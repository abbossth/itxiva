import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/guards";
import { getMyOrders } from "@/actions/shop.actions";
import { MyOrdersView } from "@/components/shop/my-orders-view";

export const metadata = {
  title: "Buyurtmalarim — ITXiva",
};

export default async function MyOrdersPage() {
  const session = await requireAuth();
  if (session.role === "mentor") {
    redirect("/mentor/orders");
  }
  const orders = await getMyOrders();
  return <MyOrdersView initialOrders={orders} />;
}
