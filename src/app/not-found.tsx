import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center bg-slate-50 dark:bg-bg">
      <div className="w-16 h-16 rounded-3xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center mb-4">
        <Search className="w-8 h-8" />
      </div>
      <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100">
        404 &bull; Sahifa topilmadi
      </h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-sm mb-6">
        Siz qidirayotgan sahifa mavjud emas yoki boshqa manzilga ko&apos;chirilgan bo&apos;lishi mumkin.
      </p>
      <Link href="/">
        <Button variant="primary" className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Bosh sahifaga qaytish
        </Button>
      </Link>
    </div>
  );
}
