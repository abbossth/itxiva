import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/guards";
import { getProducts, getMyBalance, getMyOrders } from "@/actions/shop.actions";
import { ShopCatalog } from "@/components/shop/shop-catalog";
import { getMyPromos } from "@/actions/promo.actions";
import { PromoComposer } from "@/components/promo/promo-composer";
import { connectToDatabase } from "@/lib/db/connect";
import { Group } from "@/lib/db/models/group.model";
import { groupShortName } from "@/lib/group-name";

export const metadata = {
  title: "Coin do'koni — ITXiva",
};

export default async function ShopPage() {
  const session = await requireAuth();
  if (session.role === "mentor") {
    redirect("/mentor/shop");
  }

  await connectToDatabase();
  const [products, balance, orders, promos, group] = await Promise.all([
    getProducts(),
    getMyBalance(),
    getMyOrders(),
    getMyPromos(),
    session.groupId ? Group.findById(session.groupId).select("name shortName grade").lean() : null,
  ]);
  const activeOrders = orders.filter((o) => ["pending", "accepted", "handed_over"].includes(o.status)).length;

  return (
    <div className="space-y-5">
      <ShopCatalog products={products} initialBalance={balance} activeOrders={activeOrders} />
      <PromoComposer mine={promos} balance={balance} me={{ name: session.fullName, group: group ? groupShortName(group) : null }} />
    </div>
  );
}
