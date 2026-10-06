import { requireMentorPage } from "@/lib/auth/guards";
import { getOrdersForMentor } from "@/actions/shop.actions";
import { OrdersManager } from "@/components/shop/orders-manager";

export const metadata = {
  title: "Buyurtmalar — ITXiva",
};

export default async function MentorOrdersPage() {
  await requireMentorPage();
  const orders = await getOrdersForMentor();
  return <OrdersManager initialOrders={orders} />;
}
