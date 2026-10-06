import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/guards";
import { getProducts, getMyBalance, getMyOrders } from "@/actions/shop.actions";
import { ShopCatalog } from "@/components/shop/shop-catalog";

export const metadata = {
  title: "Coin do'koni — ITXiva",
};

export default async function ShopPage() {
  const session = await requireAuth();
  if (session.role === "mentor") {
    redirect("/mentor/shop");
  }

  const [products, balance, orders] = await Promise.all([getProducts(), getMyBalance(), getMyOrders()]);
  const activeOrders = orders.filter((o) => ["pending", "accepted", "handed_over"].includes(o.status)).length;

  return <ShopCatalog products={products} initialBalance={balance} activeOrders={activeOrders} />;
}
