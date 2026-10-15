"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LockOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { unlockExamSubmissionAction } from "@/actions/exam.actions";

/** Qoidabuzarlik sababli yopilgan urinishni ochib beradi: o'quvchi qolgan vaqti bilan davom etadi */
export function ExamUnlockButton({ submissionId, studentName }: { submissionId: string; studentName: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const unlock = async () => {
    try {
      setBusy(true);
      const res = await unlockExamSubmissionAction(submissionId);
      if (res.success) {
        toast.success(res.message || "Imtihon ochildi");
        router.refresh();
      } else {
        toast.error(res.error || "Ochib bo'lmadi");
      }
    } catch {
      toast.error("Ochib bo'lmadi");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={unlock}
      isLoading={busy}
      title={`${studentName}: imtihonni blokdan ochish`}
      className="h-8 text-xs gap-1"
    >
      {!busy && <LockOpen className="w-3 h-3" />}
      Ochib berish
    </Button>
  );
}
