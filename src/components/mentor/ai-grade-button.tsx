"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { runExamAiGradingAction } from "@/actions/exam.actions";
import { runQuizAiGradingAction } from "@/actions/quiz.actions";

/** Hali tekshirilmagan ochiq javoblarni AI'dan qayta o'tkazadi (topshirish paytida AI band bo'lgan bo'lsa) */
export function AiGradeButton({ kind, id, pending }: { kind: "exam" | "quiz"; id: string; pending: number }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isRunning, setIsRunning] = useState(false);

  const run = async () => {
    try {
      setIsRunning(true);
      const res = kind === "exam" ? await runExamAiGradingAction(id) : await runQuizAiGradingAction(id);
      if (res.success) {
        toast.success(res.message || "Tekshirildi");
        router.refresh();
      } else {
        toast.error(res.error || "AI tekshiruvida xatolik");
      }
    } catch {
      toast.error("AI tekshiruvida xatolik");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={run} isLoading={isRunning} disabled={pending === 0}>
      <Bot className="w-3.5 h-3.5" />
      {isRunning ? "Tekshirilmoqda…" : `AI bilan tekshirish (${pending})`}
    </Button>
  );
}
