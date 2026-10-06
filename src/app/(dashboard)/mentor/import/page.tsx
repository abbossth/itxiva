import { requireMentorPage } from "@/lib/auth/guards";
import { ExcelImportView } from "@/components/mentor/excel-import-view";

export const metadata = {
  title: "Excel import — ITXiva",
};

export default async function MentorImportPage() {
  await requireMentorPage();
  return <ExcelImportView />;
}
