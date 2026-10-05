import { requireMentorPage } from "@/lib/auth/guards";
import { getGroups } from "@/actions/group.actions";
import { LessonEditorForm } from "@/components/mentor/lesson-editor-form";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface NewLessonPageProps {
  searchParams: Promise<{
    groupId?: string;
    quarter?: string;
  }>;
}

export const metadata = {
  title: "Yangi dars — ITXiva",
};

export default async function NewLessonPage({ searchParams }: NewLessonPageProps) {
  await requireMentorPage();
  const resolvedSearchParams = await searchParams;

  const groups = await getGroups();
  const defaultGroupId = resolvedSearchParams.groupId;
  const defaultQuarter = resolvedSearchParams.quarter ? parseInt(resolvedSearchParams.quarter, 10) : 1;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/mentor/lessons"
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-teal-600 min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          Darslar boshqaruviga qaytish
        </Link>
      </div>

      <LessonEditorForm
        groups={groups}
        defaultGroupId={defaultGroupId}
        defaultQuarter={defaultQuarter}
      />
    </div>
  );
}
