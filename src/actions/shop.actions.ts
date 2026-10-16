"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { connectToDatabase } from "@/lib/db/connect";
import { Product, IProductData } from "@/lib/db/models/product.model";
import { Order, IOrder, IOrderData, OrderStatus } from "@/lib/db/models/order.model";
import { User } from "@/lib/db/models/user.model";
import { CoinLedger } from "@/lib/db/models/coin-ledger.model";
import { AuditLog } from "@/lib/db/models/audit-log.model";
import { getCurrentUser, requireAuth, requireMentor, requireStudent } from "@/lib/auth/guards";
import { archiveEntity } from "@/lib/archive";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAppSettings } from "@/lib/settings";
import { getDownloadPresignedUrl } from "@/lib/storage/r2";
import { productSchema, ProductInput } from "@/lib/validations/shop.schema";
import { suggestCoinPrice, type PriceSuggestion } from "@/lib/shop-pricing";
import { activeSale, effectivePrice } from "@/lib/shop-sale";
import { notify, notifyAllStudents, notifyMentors } from "@/lib/notifications/notify";
import { ActionResult } from "./auth.actions";

export type ShopProduct = Omit<IProductData, "_id"> & {
  _id: string;
  imageUrl: string | null;
  /** Nechta o'quvchi sotib olgan (har biri bir marta; rad etilgan va bekor qilinganlar sanalmaydi) */
  buyers: number;
  /** O'quvchining o'zi ham olganmi (mentorda — false) */
  boughtByMe: boolean;
};

/** Sotib olingan deb sanaladigan buyurtmalar: coin to'langan va qaytarilmagan */
const BOUGHT_STATUSES: OrderStatus[] = ["pending", "accepted", "handed_over", "received"];

export interface ShopOrder extends Omit<IOrderData, "_id" | "studentId" | "groupId" | "productId"> {
  _id: string;
  productId: string;
  student?: { _id: string; fullName: string; login: string; groupName: string | null };
}

const isObjectId = (id: unknown): id is string => typeof id === "string" && mongoose.isValidObjectId(id);

function revalidateShop() {
  // Navigatsiyadagi buyurtmalar soni layout'da hisoblanadi
  revalidatePath("/", "layout");
}

async function withImageUrls(products: IProductData[], meId: string | null = null): Promise<ShopProduct[]> {
  const ids = products.map((p) => new mongoose.Types.ObjectId(String(p._id)));
  const rows = ids.length
    ? await Order.aggregate<{ _id: mongoose.Types.ObjectId; buyers: mongoose.Types.ObjectId[] }>([
        { $match: { productId: { $in: ids }, status: { $in: BOUGHT_STATUSES } } },
        { $group: { _id: "$productId", buyers: { $addToSet: "$studentId" } } },
      ])
    : [];
  const buyersOf = new Map(rows.map((r) => [String(r._id), r.buyers.map(String)]));
  return Promise.all(
    products.map(async (p) => {
      const buyers = buyersOf.get(String(p._id)) ?? [];
      let imageUrl: string | null = null;
      if (p.imageKey) {
        try {
          imageUrl = await getDownloadPresignedUrl({ key: p.imageKey });
        } catch {
          imageUrl = null;
        }
      }
      return { ...p, _id: p._id.toString(), imageUrl, buyers: buyers.length, boughtByMe: meId !== null && buyers.includes(meId) };
    })
  );
}

/** Do'kon katalogi: o'quvchiga faqat faol mahsulotlar, mentorga hammasi */
export async function getProducts(): Promise<ShopProduct[]> {
  const session = await requireAuth();
  await connectToDatabase();
  // Gamifikatsiya o'chiq bo'lsa seriya himoyasi o'quvchiga ko'rinmaydi
  const shieldHidden = session.role !== "mentor" && !(await getAppSettings()).gamification.enabled;
  const filter = session.role === "mentor" ? {} : { isActive: true, ...(shieldHidden ? { kind: { $ne: "streak_shield" } } : {}) };
  // Hayotdagi (so'm) narx faqat mentorga
  const products = await Product.find(filter)
    .select(session.role === "mentor" ? {} : { realPrice: 0 })
    .sort({ isActive: -1, price: 1 })
    .lean();
  return withImageUrls(JSON.parse(JSON.stringify(products)) as IProductData[], session.role === "student" ? session.userId : null);
}

export async function getMyBalance(): Promise<number> {
  const session = await requireAuth();
  await connectToDatabase();
  const user = await User.findById(session.userId).select("spendableBalance").lean();
  return user?.spendableBalance ?? 0;
}

export async function saveProductAction(
  input: ProductInput,
  productId?: string
): Promise<ActionResult<ShopProduct>> {
  const mentor = await requireMentor();
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message || "Ma'lumotlar noto'g'ri" };
  }
  await connectToDatabase();

  let product;
  let hadSale = false;
  if (productId) {
    if (!isObjectId(productId)) return { success: false, message: "Mahsulot topilmadi" };
    const before = await Product.findById(productId).select("price salePrice saleEndsAt").lean();
    hadSale = Boolean(before && activeSale(before));
    product = await Product.findByIdAndUpdate(productId, { $set: parsed.data }, { returnDocument: "after" });
    if (!product) return { success: false, message: "Mahsulot topilmadi" };
  } else {
    product = await Product.create(parsed.data);
  }

  await AuditLog.create({
    actorId: mentor.userId,
    action: productId ? "UPDATE_PRODUCT" : "CREATE_PRODUCT",
    details: { productId: product._id, title: product.title, price: product.price },
  });

  // Faqat yangi va do'konda ko'rinadigan mahsulot haqida xabar beriladi; chegirma boshlanganda — chegirma xabari
  const sale = activeSale(product);
  if (product.isActive && sale && !hadSale) {
    notifyAllStudents("product_new", { title: product.title, price: sale.price, oldPrice: sale.oldPrice, saleEndsAt: sale.endsAt });
  } else if (!productId && product.isActive) {
    notifyAllStudents("product_new", { title: product.title, price: product.price });
  }

  revalidateShop();
  const [data] = await withImageUrls([JSON.parse(JSON.stringify(product)) as IProductData]);
  return { success: true, message: productId ? "Mahsulot yangilandi" : "Mahsulot qo'shildi", data };
}

/** Mentor uchun: hayotdagi narxdan coin narxi tavsiyasi (do'kondagi boshqa mahsulotlar va o'quvchilar daromadi bo'yicha) */
export async function suggestProductPriceAction(input: { realPrice: number; productId?: string | null }): Promise<PriceSuggestion | null> {
  await requireMentor();
  const realPrice = Number(input?.realPrice);
  if (!Number.isFinite(realPrice) || realPrice <= 0 || realPrice > 1_000_000_000) return null;
  await connectToDatabase();

  const since = new Date(Date.now() - 30 * 86_400_000);
  const [catalog, earned, students, settings] = await Promise.all([
    Product.find({
      realPrice: { $gt: 0 },
      kind: { $ne: "streak_shield" },
      ...(isObjectId(input.productId) ? { _id: { $ne: input.productId } } : {}),
    })
      .select("title price realPrice")
      .lean(),
    CoinLedger.aggregate<{ sum: number }>([
      { $match: { createdAt: { $gte: since }, amount: { $gt: 0 }, type: { $nin: ["purchase", "adjustment", "xp_align"] } } },
      { $group: { _id: null, sum: { $sum: "$amount" } } },
    ]),
    User.countDocuments({ role: "student", groupId: { $ne: null } }),
    getAppSettings(),
  ]);
  return suggestCoinPrice({
    realPrice,
    catalog: catalog.map((p) => ({ title: p.title, price: p.price, realPrice: p.realPrice ?? 0 })),
    perStudentMonthly: students > 0 ? Math.round((earned[0]?.sum ?? 0) / students) : 0,
    monthlyTarget: settings.gamification.monthlyCoinTarget,
  });
}

export async function deleteProductAction(productId: string): Promise<ActionResult> {
  const mentor = await requireMentor();
  if (!isObjectId(productId)) return { success: false, message: "Mahsulot topilmadi" };
  await connectToDatabase();

  // Buyurtmalar tarixi buzilmasligi uchun buyurtmasi bor mahsulot o'chirilmaydi, faqat yashiriladi
  const hasOrders = await Order.exists({ productId });
  if (hasOrders) {
    await Product.updateOne({ _id: productId }, { $set: { isActive: false } });
    revalidateShop();
    return { success: true, message: "Mahsulotga buyurtmalar bor — u do'kondan yashirildi" };
  }

  const archived = await archiveEntity("product", productId, mentor.userId);
  if (!archived) return { success: false, message: "Mahsulot topilmadi" };
  await AuditLog.create({
    actorId: mentor.userId,
    action: "DELETE_PRODUCT",
    details: { productId, title: archived.archive.title },
  });
  revalidateShop();
  return { success: true, message: "Mahsulot arxivga o'tkazildi" };
}

/**
 * O'quvchi buyurtma beradi. Coin shu zahoti (atomik) yechiladi; rad etilsa yoki bekor qilinsa qaytariladi.
 * Reytingdagi `totalCoins` kamaymaydi — faqat sarflanadigan balans.
 */
export async function createOrderAction(productId: string, expectedPrice?: number): Promise<ActionResult<{ balance: number }>> {
  const session = await requireStudent();
  if (!isObjectId(productId)) return { success: false, message: "Mahsulot topilmadi" };

  const rate = checkRateLimit(`order_${session.userId}`, 10, 60_000);
  if (!rate.allowed) {
    return { success: false, message: `Juda ko'p urinish. ${rate.resetInSeconds} soniyadan keyin urinib ko'ring` };
  }

  await connectToDatabase();

  const product = await Product.findOne({ _id: productId, isActive: true }).lean();
  if (!product) return { success: false, message: "Mahsulot hozir mavjud emas" };
  // Chegirma bo'lsa — chegirma narxi. O'quvchi ko'rgan narx o'zgarib qolgan bo'lsa (chegirma tugagan), coin yechilmaydi
  const price = effectivePrice(product);
  const onSale = price < product.price;
  if (typeof expectedPrice === "number" && expectedPrice !== price) {
    return { success: false, message: `Narx o'zgardi: endi ${price} coin. Sahifani yangilab, qayta tasdiqlang` };
  }

  // Seriya himoyasi: gamifikatsiya yoqilgan bo'lsa va o'quvchida ko'pi bilan 2 ta bo'lsa
  const isShield = product.kind === "streak_shield";
  if (isShield) {
    if (!(await getAppSettings()).gamification.enabled) return { success: false, message: "Mahsulot hozir mavjud emas" };
    const me = await User.findById(session.userId).select("streakShields").lean();
    if ((me?.streakShields ?? 0) >= MAX_STREAK_SHIELDS) {
      return { success: false, message: `Sizda allaqachon ${MAX_STREAK_SHIELDS} ta himoya bor` };
    }
  }

  // 1. Zaxirani band qilish (cheklangan bo'lsa)
  if (product.stock !== null && product.stock !== undefined) {
    const reserved = await Product.updateOne(
      { _id: productId, isActive: true, stock: { $gte: 1 } },
      { $inc: { stock: -1 } }
    );
    if (reserved.modifiedCount === 0) {
      return { success: false, message: "Afsuski, bu mahsulot tugab qoldi" };
    }
  }
  const releaseStock = () =>
    product.stock !== null && product.stock !== undefined
      ? Product.updateOne({ _id: productId }, { $inc: { stock: 1 } })
      : Promise.resolve();

  // 2. Coin yechish: shart va kamaytirish bitta atomik so'rovda (ikki marta bosishdan himoya)
  const user = await User.findOneAndUpdate(
    { _id: session.userId, role: "student", spendableBalance: { $gte: price } },
    { $inc: { spendableBalance: -price } },
    { returnDocument: "after" }
  );
  if (!user) {
    await releaseStock();
    return { success: false, message: "Balansingizda yetarli coin yo'q" };
  }

  try {
    const order = await Order.create({
      studentId: user._id,
      groupId: user.groupId ?? null,
      productId: product._id,
      productTitle: product.title,
      price,
      // Himoya darhol beriladi — buyurtma "olingan" holatda yoziladi
      status: isShield ? "received" : "pending",
    });
    if (isShield) await User.updateOne({ _id: user._id }, { $inc: { streakShields: 1 } });
    await CoinLedger.create({
      studentId: user._id,
      amount: -price,
      type: "purchase",
      referenceId: order._id,
      description: `Do'kon buyurtmasi: ${product.title}${onSale ? ` (chegirma: ${product.price} → ${price})` : ""}`,
      balanceAfter: user.spendableBalance,
    });
  } catch (err) {
    // Buyurtma yozilmasa coin va zaxira qaytariladi
    await User.updateOne({ _id: user._id }, { $inc: { spendableBalance: price } });
    await releaseStock();
    throw err;
  }

  if (!isShield) notifyMentors("order_new", { productTitle: product.title, price, studentName: session.fullName });

  revalidateShop();
  return {
    success: true,
    message: isShield ? "Seriya himoyasi qo'shildi: bir kun o'tkazib yuborsangiz ham seriyangiz uzilmaydi." : "Buyurtma qabul qilindi! Mentor tasdiqlashini kuting.",
    data: { balance: user.spendableBalance ?? 0 },
  };
}

/** O'quvchida bir vaqtda ko'pi bilan shuncha seriya himoyasi */
const MAX_STREAK_SHIELDS = 2;

async function refundOrder(order: IOrder, reason: string) {
  const user = await User.findByIdAndUpdate(
    order.studentId,
    { $inc: { spendableBalance: order.price } },
    { returnDocument: "after" }
  );
  await Product.updateOne({ _id: order.productId, stock: { $ne: null } }, { $inc: { stock: 1 } });
  await CoinLedger.create({
    studentId: order.studentId,
    amount: order.price,
    type: "adjustment",
    referenceId: order._id,
    description: `${reason}: ${order.productTitle} (coin qaytarildi)`,
    balanceAfter: user?.spendableBalance,
  });
}

/**
 * Holatni faqat kutilgan oldingi holatdan o'zgartiradi (bir vaqtda ikki amal bajarilsa bittasi o'tadi)
 */
async function transition(
  orderId: string,
  from: OrderStatus[],
  to: OrderStatus,
  extra: Record<string, unknown> = {},
  ownerId?: string
) {
  if (!isObjectId(orderId)) return null;
  return Order.findOneAndUpdate(
    { _id: orderId, status: { $in: from }, ...(ownerId ? { studentId: ownerId } : {}) },
    { $set: { status: to, ...extra } },
    { returnDocument: "after" }
  );
}

export async function acceptOrderAction(orderId: string): Promise<ActionResult> {
  const mentor = await requireMentor();
  await connectToDatabase();
  const order = await transition(orderId, ["pending"], "accepted", { acceptedAt: new Date() });
  if (!order) return { success: false, message: "Buyurtma topilmadi yoki holati o'zgargan" };
  await AuditLog.create({ actorId: mentor.userId, action: "ACCEPT_ORDER", targetUserId: order.studentId, details: { orderId, product: order.productTitle } });
  notify(order.studentId, "order_status", { productTitle: order.productTitle, status: "accepted" });
  revalidateShop();
  return { success: true, message: "Buyurtma qabul qilindi" };
}

export async function rejectOrderAction(orderId: string, note?: string): Promise<ActionResult> {
  const mentor = await requireMentor();
  await connectToDatabase();
  const order = await transition(orderId, ["pending", "accepted"], "rejected", {
    closedAt: new Date(),
    mentorNote: typeof note === "string" ? note.trim().slice(0, 300) : "",
  });
  if (!order) return { success: false, message: "Buyurtma topilmadi yoki holati o'zgargan" };
  await refundOrder(order, "Buyurtma rad etildi");
  await AuditLog.create({ actorId: mentor.userId, action: "REJECT_ORDER", targetUserId: order.studentId, details: { orderId, product: order.productTitle, refunded: order.price } });
  notify(order.studentId, "order_status", {
    productTitle: order.productTitle,
    status: "rejected",
    note: order.mentorNote,
    refunded: order.price,
  });
  revalidateShop();
  return { success: true, message: "Buyurtma bekor qilindi, coinlar o'quvchiga qaytarildi" };
}

export async function handOverOrderAction(orderId: string): Promise<ActionResult> {
  const mentor = await requireMentor();
  await connectToDatabase();
  const order = await transition(orderId, ["accepted"], "handed_over", { handedOverAt: new Date() });
  if (!order) return { success: false, message: "Buyurtma topilmadi yoki holati o'zgargan" };
  await AuditLog.create({ actorId: mentor.userId, action: "HAND_OVER_ORDER", targetUserId: order.studentId, details: { orderId, product: order.productTitle } });
  notify(order.studentId, "order_status", { productTitle: order.productTitle, status: "handed_over" });
  revalidateShop();
  return { success: true, message: "Topshirildi deb belgilandi. O'quvchi tasdiqlashi kutilmoqda" };
}

/** O'quvchi sovg'ani olganini tasdiqlaydi */
export async function confirmReceivedAction(orderId: string): Promise<ActionResult> {
  const session = await requireStudent();
  await connectToDatabase();
  const now = new Date();
  const order = await transition(orderId, ["handed_over"], "received", { receivedAt: now, closedAt: now }, session.userId);
  if (!order) return { success: false, message: "Buyurtma topilmadi yoki hali topshirilmagan" };
  revalidateShop();
  return { success: true, message: "Rahmat! Buyurtma yakunlandi" };
}

/** O'quvchi hali ko'rib chiqilmagan buyurtmasini bekor qiladi */
export async function cancelOrderAction(orderId: string): Promise<ActionResult> {
  const session = await requireStudent();
  await connectToDatabase();
  const order = await transition(orderId, ["pending"], "cancelled", { closedAt: new Date() }, session.userId);
  if (!order) return { success: false, message: "Buyurtmani endi bekor qilib bo'lmaydi" };
  await refundOrder(order, "Buyurtma bekor qilindi");
  revalidateShop();
  return { success: true, message: "Buyurtma bekor qilindi, coinlar qaytarildi" };
}

export async function getMyOrders(): Promise<ShopOrder[]> {
  const session = await requireStudent();
  await connectToDatabase();
  const orders = await Order.find({ studentId: session.userId }).sort({ createdAt: -1 }).limit(100).lean();
  return JSON.parse(JSON.stringify(orders)).map((o: IOrderData) => ({
    ...o,
    _id: String(o._id),
    productId: String(o.productId),
  }));
}

export async function getOrdersForMentor(): Promise<ShopOrder[]> {
  await requireMentor();
  await connectToDatabase();
  const orders = await Order.find({})
    .sort({ createdAt: -1 })
    .limit(500)
    .populate("studentId", "fullName login")
    .populate("groupId", "name")
    .lean();

  return (JSON.parse(JSON.stringify(orders)) as Array<
    Omit<IOrderData, "studentId" | "groupId"> & {
      studentId: { _id: string; fullName: string; login: string } | null;
      groupId: { name: string } | null;
    }
  >).map(({ studentId, groupId, ...o }) => ({
    ...o,
    _id: String(o._id),
    productId: String(o.productId),
    student: studentId
      ? { _id: studentId._id, fullName: studentId.fullName, login: studentId.login, groupName: groupId?.name ?? null }
      : undefined,
  }));
}

/**
 * Navigatsiyadagi belgi: mentor uchun yangi buyurtmalar, o'quvchi uchun "Qabul qildim" kutilayotganlari
 */
export async function getOrdersBadgeCount(): Promise<number> {
  const session = await getCurrentUser();
  if (!session) return 0;
  try {
    await connectToDatabase();
    return session.role === "mentor"
      ? await Order.countDocuments({ status: "pending" })
      : await Order.countDocuments({ studentId: session.userId, status: "handed_over" });
  } catch {
    return 0;
  }
}
