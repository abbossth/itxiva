import { Megaphone } from "lucide-react";
import { requireMentorPage } from "@/lib/auth/guards";
import { PageHeader } from "@/components/ui/page-header";
import { getPromosForMentor } from "@/actions/promo.actions";
import { PromoReview } from "@/components/promo/promo-review";

export const metadata = { title: "Bosh sahifa e'lonlari — ITXiva" };

export default async function MentorPromosPage() {
  await requireMentorPage();
  const data = await getPromosForMentor();
  return (
    <div className="space-y-4">
      <PageHeader icon={Megaphone} title="Bosh sahifa e'lonlari" subtitle="O'quvchilar coin evaziga joylagan e'lonlar: tasdiqlang yoki rad eting (rad etilsa coin qaytadi)" />
      <PromoReview pending={data.pending} recent={data.recent} />
    </div>
  );
}
