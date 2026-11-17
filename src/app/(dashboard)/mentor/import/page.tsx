import { requireMentorPage } from "@/lib/auth/guards";
import { ExcelImportView } from "@/components/mentor/excel-import-view";
import { DocumentImportSection } from "@/components/mentor/document-import-section";

export const metadata = {
  title: "Excel import — ITXiva",
};

export default async function MentorImportPage() {
  await requireMentorPage();
  return (
    <div className="space-y-6">
      <ExcelImportView />
      <DocumentImportSection />
    </div>
  );
}
