import { requireAuth } from "@/lib/auth/guards";
import { connectToDatabase } from "@/lib/db/connect";
import { User } from "@/lib/db/models/user.model";
import { ShoppingBag, Sparkles, Shirt, Bookmark, Coffee, Laptop } from "lucide-react";
import { CoinBadge } from "@/components/ui/coin-badge";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "Coin do'koni — ITXiva",
};

export default async function ShopPage() {
  const session = await requireAuth();
  await connectToDatabase();

  const user = await User.findById(session.userId).lean();
  const spendableCoins = user?.spendableBalance || user?.totalCoins || 0;

  const shopItems = [
    {
      id: "stickers",
      title: "ITXiva stikerlar to'plami",
      description: "Noutbuk va telefon uchun maxsus sifatli dasturlash stikerlari",
      price: 50,
      icon: Laptop,
      category: "Merch",
      available: true,
    },
    {
      id: "desk-choice",
      title: "Partani erkin tanlash imtiyozi",
      description: "1 kun davomida sinf xonasida istalgan qulay joyni tanlash huquqi",
      price: 30,
      icon: Bookmark,
      category: "Imtiyoz",
      available: true,
    },
    {
      id: "mentor-1on1",
      title: "Mentor bilan 1-on-1 konsultatsiya",
      description: "30 daqiqalik shaxsiy kod audit va loyihani birga ko'rib chiqish",
      price: 120,
      icon: Coffee,
      category: "Ta'lim",
      available: true,
    },
    {
      id: "tshirt",
      title: "ITXiva brend futbolkasi",
      description: "Muhammad al-Xorazmiy vorislari ramzi tushirilgan paxta futbolka",
      price: 350,
      icon: Shirt,
      category: "Kiyim",
      available: false,
    },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 dark:border-slate-800/80 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
            <ShoppingBag className="w-7 h-7 text-teal-600 dark:text-teal-400" />
            Coin do&apos;koni
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Darslarda va davomatda yig&apos;ilgan coinlaringizni esdalik sovg&apos;alar va imtiyozlarga almashtiring
          </p>
        </div>

        {/* User Balance Card */}
        <div className="p-3.5 px-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3 shrink-0">
          <div className="text-xs font-semibold text-amber-700 dark:text-amber-300">
            Mavjud balansingiz:
          </div>
          <CoinBadge amount={spendableCoins} size="md" animate={false} />
        </div>
      </div>

      {/* Info Banner */}
      <div className="p-4 sm:p-5 rounded-2xl bg-teal-500/10 border border-teal-500/20 flex items-center gap-3.5 text-xs sm:text-sm text-teal-900 dark:text-teal-200">
        <Sparkles className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0" />
        <span>
          Do&apos;kondagi sovg&apos;alarni olish uchun yetarli tanga to&apos;plang va dars vaqtida mentorga murojaat qiling!
        </span>
      </div>

      {/* Shop Items Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {shopItems.map((item) => {
          const Icon = item.icon;
          const canAfford = spendableCoins >= item.price;

          return (
            <div
              key={item.id}
              className="p-5 rounded-3xl bg-white dark:bg-[#131E32] border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex flex-col justify-between space-y-4 hover:border-teal-500/40 transition-all"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {item.category}
                  </span>
                  {item.available ? (
                    <Badge variant="success">Mavjud</Badge>
                  ) : (
                    <Badge variant="warning">Tez kunda</Badge>
                  )}
                </div>

                <div className="w-14 h-14 rounded-2xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                  <Icon className="w-7 h-7" />
                </div>

                <div>
                  <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <CoinBadge amount={item.price} size="sm" animate={false} />
                <span className="text-[11px] font-semibold text-slate-400">
                  {canAfford ? "Balans yetadi" : "Yetarli emas"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
