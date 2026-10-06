"use server";

import mongoose from "mongoose";
import { revalidatePath } from "next/cache";
import { connectToDatabase } from "@/lib/db/connect";
import { Product, IProductData } from "@/lib/db/models/product.model";
import { Order, IOrder, IOrderData, OrderStatus } from "@/lib/db/models/order.model";
import { User } from "@/lib/db/models/user.model";
import { CoinLedger } from "@/lib/db/models/coin-ledger.model";
import { AuditLog } from "@/lib/db/models/audit-log.model";
import { getSession } from "@/lib/auth/session";
import { requireAuth, requireMentor, requireStudent } from "@/lib/auth/guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { getDownloadPresignedUrl } from "@/lib/storage/r2";
import { productSchema, ProductInput } from "@/lib/validations/shop.schema";
import { ActionResult } from "./auth.actions";

export type ShopProduct = Omit<IProductData, "_id"> & { _id: string; imageUrl: string | null };

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

async function withImageUrls(products: IProductData[]): Promise<ShopProduct[]> {
  return Promise.all(
    products.map(async (p) => {
      let imageUrl: string | null = null;
      if (p.imageKey) {
        try {
          imageUrl = await getDownloadPresignedUrl({ key: p.imageKey });
        } catch {
          imageUrl = null;
        }
      }
      return { ...p, _id: p._id.toString(), imageUrl };
    })
  );
}

/** Do'kon katalogi: o'quvchiga faqat faol mahsulotlar, mentorga hammasi */
export async function getProducts(): Promise<ShopProduct[]> {
  const session = await requireAuth();
  await connectToDatabase();
  const filter = session.role === "mentor" ? {} : { isActive: true };
  const products = await Product.find(filter).sort({ isActive: -1, price: 1 }).lean();
  return withImageUrls(JSON.parse(JSON.stringify(products)) as IProductData[]);
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
  if (productId) {
    if (!isObjectId(productId)) return { success: false, message: "Mahsulot topilmadi" };
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

  revalidateShop();
  const [data] = await withImageUrls([JSON.parse(JSON.stringify(product)) as IProductData]);
  return { success: true, message: productId ? "Mahsulot yangilandi" : "Mahsulot qo'shildi", data };
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

  const product = await Product.findByIdAndDelete(productId);
  await AuditLog.create({
    actorId: mentor.userId,
    action: "DELETE_PRODUCT",
    details: { productId, title: product?.title },
  });
  revalidateShop();
  return { success: true, message: "Mahsulot o'chirildi" };
}

/**
 * O'quvchi buyurtma beradi. Coin shu zahoti (atomik) yechiladi; rad etilsa yoki bekor qilinsa qaytariladi.
 * Reytingdagi `totalCoins` kamaymaydi — faqat sarflanadigan balans.
 */
export async function createOrderAction(productId: string): Promise<ActionResult<{ balance: number }>> {
  const session = await requireStudent();
  if (!isObjectId(productId)) return { success: false, message: "Mahsulot topilmadi" };

  const rate = checkRateLimit(`order_${session.userId}`, 10, 60_000);
  if (!rate.allowed) {
    return { success: false, message: `Juda ko'p urinish. ${rate.resetInSeconds} soniyadan keyin urinib ko'ring` };
  }

  await connectToDatabase();

  const product = await Product.findOne({ _id: productId, isActive: true }).lean();
  if (!product) return { success: false, message: "Mahsulot hozir mavjud emas" };

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
    { _id: session.userId, role: "student", spendableBalance: { $gte: product.price } },
    { $inc: { spendableBalance: -product.price } },
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
      price: product.price,
      status: "pending",
    });
    await CoinLedger.create({
      studentId: user._id,
      amount: -product.price,
      type: "purchase",
      referenceId: order._id,
      description: `Do'kon buyurtmasi: ${product.title}`,
      balanceAfter: user.spendableBalance,
    });
  } catch (err) {
    // Buyurtma yozilmasa coin va zaxira qaytariladi
    await User.updateOne({ _id: user._id }, { $inc: { spendableBalance: product.price } });
    await releaseStock();
    throw err;
  }

  revalidateShop();
  return {
    success: true,
    message: "Buyurtma qabul qilindi! Mentor tasdiqlashini kuting.",
    data: { balance: user.spendableBalance ?? 0 },
  };
}

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
  revalidateShop();
  return { success: true, message: "Buyurtma bekor qilindi, coinlar o'quvchiga qaytarildi" };
}

export async function handOverOrderAction(orderId: string): Promise<ActionResult> {
  const mentor = await requireMentor();
  await connectToDatabase();
  const order = await transition(orderId, ["accepted"], "handed_over", { handedOverAt: new Date() });
  if (!order) return { success: false, message: "Buyurtma topilmadi yoki holati o'zgargan" };
  await AuditLog.create({ actorId: mentor.userId, action: "HAND_OVER_ORDER", targetUserId: order.studentId, details: { orderId, product: order.productTitle } });
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
  const session = await getSession();
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
