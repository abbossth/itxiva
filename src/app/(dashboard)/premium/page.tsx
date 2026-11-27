import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/guards";
import { getMyPremiumAction } from "@/actions/premium.actions";
import { PremiumView } from "@/components/premium/premium-view";

export const metadata = {
  title: "IT Xiva Premium — ITXiva",
};

export default async function PremiumPage() {
  const session = await requireAuth();
  if (session.role === "mentor") redirect("/chat");
  const me = await getMyPremiumAction();
  if (!me) redirect("/login");
  return <PremiumView initial={me} name={session.fullName} />;
}
