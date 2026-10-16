import { requireMentorPage } from "@/lib/auth/guards";
import { getCoinEconomy } from "@/actions/economy.actions";
import { CoinEconomyView } from "@/components/mentor/coin-economy-view";

export const metadata = {
  title: "Coin iqtisodiyoti — ITXiva",
};

export default async function CoinEconomyPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireMentorPage();
  const { days } = await searchParams;
  const data = await getCoinEconomy(Number(days) || 30);
  return <CoinEconomyView key={data.days} data={data} />;
}
