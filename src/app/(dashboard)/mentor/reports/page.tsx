import { requireMentorPage } from "@/lib/auth/guards";
import { getGroups } from "@/actions/group.actions";
import { getReportData } from "@/actions/report.actions";
import { ReportsView } from "@/components/reports/reports-view";
import { addDaysToKey, toDateKey } from "@/lib/schedule";

export const metadata = {
  title: "Hisobotlar — ITXiva",
};

interface ReportsPageProps {
  searchParams: Promise<{ period?: string; from?: string; to?: string; group?: string }>;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function resolveRange(period: string, from?: string, to?: string) {
  const today = toDateKey();
  if (period === "custom" && from && to && DATE_RE.test(from) && DATE_RE.test(to) && from <= to) {
    return { from, to };
  }
  if (period === "week") return { from: addDaysToKey(today, -6), to: today };
  if (period === "quarter") return { from: addDaysToKey(today, -89), to: today };
  if (period === "year") {
    // O'quv yili 1-sentabrdan boshlanadi
    const [y, m] = today.split("-").map(Number);
    return { from: `${m >= 9 ? y : y - 1}-09-01`, to: today };
  }
  return { from: addDaysToKey(today, -29), to: today };
}

export default async function MentorReportsPage({ searchParams }: ReportsPageProps) {
  await requireMentorPage();
  const params = await searchParams;
  const period = ["week", "month", "quarter", "year", "custom"].includes(params.period ?? "")
    ? (params.period as string)
    : "month";
  const range = resolveRange(period, params.from, params.to);

  const [groups, data] = await Promise.all([
    getGroups(),
    getReportData({ ...range, groupId: params.group }),
  ]);

  return (
    <ReportsView
      data={data}
      groups={groups.map((g) => ({ _id: g._id.toString(), name: g.name }))}
      period={period}
      groupId={params.group ?? ""}
    />
  );
}
