"use client";

import * as React from "react";
import { Button, IconButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { OTPInput } from "@/components/ui/otp-input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Avatar } from "@/components/ui/avatar";
import { ProgressBar } from "@/components/ui/progress-bar";
import { CoinBadge } from "@/components/ui/coin-badge";
import { CountdownRing } from "@/components/ui/countdown-ring";
import { Modal } from "@/components/ui/modal";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  Sparkles,
  Heart,
  Share2,
  Trash2,
  Bell,
  BookOpen,
  Calendar,
  Layers,
} from "lucide-react";

export default function UIDevShowroomPage() {
  const { toast } = useToast();
  const [segmentedVal, setSegmentedVal] = React.useState<string>("week");
  const [otpVal, setOtpVal] = React.useState("");
  const [modalOpen, setModalOpen] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  return (
    <div className="space-y-10 max-w-5xl mx-auto pb-20 animate-in fade-in">
      <PageHeader
        icon={Layers}
        title="Dizayn tizimi & Komponentlar katalogi"
        subtitle="ITXiva dizayn tokenlari, primitivlari va qulaylik (a11y) holatlari ko'rgazmasi"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.info("Komponentlar to'liq WCAG AA talablariga mos!")}
          >
            <Sparkles className="w-4 h-4 mr-1.5 text-amber-500" />
            Tekshirish
          </Button>
        }
      />

      {/* 1. Rang tokenlari */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <span>1. Rang va Kontrast tokenlari</span>
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
          <div className="p-4 rounded-2xl bg-white dark:bg-surface border border-slate-200 dark:border-slate-800 space-y-2 shadow-xs">
            <div className="w-full h-8 rounded-lg bg-teal-700 dark:bg-teal-400" />
            <p className="text-xs font-bold">Primary</p>
            <p className="text-[10px] text-slate-500 font-mono">#0F766E / #2DD4BF</p>
          </div>
          <div className="p-4 rounded-2xl bg-white dark:bg-surface border border-slate-200 dark:border-slate-800 space-y-2 shadow-xs">
            <div className="w-full h-8 rounded-lg bg-itxiva-gradient" />
            <p className="text-xs font-bold">Primary Grad</p>
            <p className="text-[10px] text-slate-500 font-mono">Teal &rarr; Blue</p>
          </div>
          <div className="p-4 rounded-2xl bg-white dark:bg-surface border border-slate-200 dark:border-slate-800 space-y-2 shadow-xs">
            <div className="w-full h-8 rounded-lg bg-amber-500" />
            <p className="text-xs font-bold">Gold / Coin</p>
            <p className="text-[10px] text-slate-500 font-mono">#B45309 / #FBBF24</p>
          </div>
          <div className="p-4 rounded-2xl bg-white dark:bg-surface border border-slate-200 dark:border-slate-800 space-y-2 shadow-xs">
            <div className="w-full h-8 rounded-lg bg-emerald-600 dark:bg-emerald-400" />
            <p className="text-xs font-bold">Success</p>
            <p className="text-[10px] text-slate-500 font-mono">#15803D / #4ADE80</p>
          </div>
          <div className="p-4 rounded-2xl bg-white dark:bg-surface border border-slate-200 dark:border-slate-800 space-y-2 shadow-xs">
            <div className="w-full h-8 rounded-lg bg-rose-600 dark:bg-rose-400" />
            <p className="text-xs font-bold">Danger</p>
            <p className="text-[10px] text-slate-500 font-mono">#B91C1C / #F87171</p>
          </div>
          <div className="p-4 rounded-2xl bg-white dark:bg-surface border border-slate-200 dark:border-slate-800 space-y-2 shadow-xs">
            <div className="w-full h-8 rounded-lg bg-amber-600 dark:bg-amber-400" />
            <p className="text-xs font-bold">Warning</p>
            <p className="text-[10px] text-slate-500 font-mono">#A16207 / #FACC15</p>
          </div>
        </div>
      </section>

      {/* 2. Tugmalar va IconButtons */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          2. Tugmalar (Buttons) va IconButton (min 44px tap target)
        </h2>
        <Card className="p-6 space-y-5">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Asosiy tugma</Button>
            <Button variant="secondary">Ikkilamchi</Button>
            <Button variant="outline">Hoshiyali</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Xavfli (Danger)</Button>
            <Button variant="gold">Oltin (Gold)</Button>
            <Button variant="primary" isLoading>Yuklanmoqda</Button>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-500 w-full">O&apos;lchamlar:</p>
            <Button size="sm">Kichik (sm)</Button>
            <Button size="md">Standart (md 44px)</Button>
            <Button size="lg">Katta (lg 48px)</Button>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-500 w-full">
              IconButtonlar (WCAG AA bo&apos;yicha kamida 44px sensor o&apos;lchami):
            </p>
            <IconButton aria-label="Yoqtirish" variant="primary">
              <Heart className="w-4 h-4" />
            </IconButton>
            <IconButton aria-label="Ulashish" variant="secondary">
              <Share2 className="w-4 h-4" />
            </IconButton>
            <IconButton aria-label="Bildirishnomalar" variant="outline">
              <Bell className="w-4 h-4" />
            </IconButton>
            <IconButton aria-label="O'chirish" variant="danger">
              <Trash2 className="w-4 h-4" />
            </IconButton>
          </div>
        </Card>
      </section>

      {/* 3. Badjlar & Coin Badge & Avatarlar */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          3. Badjlar, Tangalar (CoinBadge) va Avatarlar
        </h2>
        <Card className="p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <Badge variant="teal">Faol</Badge>
            <Badge variant="success">Bajarildi</Badge>
            <Badge variant="warning">Kutilmoqda</Badge>
            <Badge variant="danger">Xato</Badge>
            <Badge variant="gold">1-o&apos;rin</Badge>
            <Badge variant="secondary">Qoralama</Badge>
            <Badge variant="outline">Oddiy</Badge>
          </div>

          <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">CoinBadge:</span>
              <CoinBadge amount={50} size="sm" />
              <CoinBadge amount={350} size="md" />
              <CoinBadge amount={1200} size="lg" />
            </div>

            <div className="flex items-center gap-2 pl-4 border-l border-slate-200 dark:border-slate-800">
              <span className="text-xs font-semibold text-slate-500">Avatar:</span>
              <Avatar name="Alisher Valiyev" size="sm" />
              <Avatar name="Alisher Valiyev" size="md" />
              <Avatar name="Alisher Valiyev" size="lg" variant="gold" />
            </div>
          </div>
        </Card>
      </section>

      {/* 4. Formalar va Maydonlar */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          4. Forma maydonlari (Field, Input, Select, Textarea, OTPInput)
        </h2>
        <Card className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="O'quvchi ismi" htmlFor="field-name" required hint="Familiya va ismni to'liq kiriting">
              <Input id="field-name" placeholder="Masalan: Alisher Valiyev" />
            </Field>

            <Field label="Sinf guruhi" htmlFor="field-group" required>
              <Select id="field-group">
                <option value="8-a">8-A guruhi</option>
                <option value="9-a">9-A guruhi</option>
                <option value="11-a">11-A guruhi</option>
              </Select>
            </Field>

            <div className="sm:col-span-2">
              <Field
                label="Login (Xato holati ko'rinishi)"
                htmlFor="field-login"
                error="Ushbu login tizimda allaqachon mavjud"
                required
              >
                <Input id="field-login" defaultValue="alisher_valiyev" hasError />
              </Field>
            </div>

            <div className="sm:col-span-2">
              <Field label="Izoh yoki tavsif" htmlFor="field-desc">
                <Textarea id="field-desc" placeholder="Dars yoki topshiriq haqida ma'lumot..." />
              </Field>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2 text-center">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              6 xonali Davomat OTP Kiritish komponenti:
            </p>
            <div className="py-2">
              <OTPInput
                length={6}
                value={otpVal}
                onChange={setOtpVal}
                onComplete={(code) => toast.success(`Kod to'liq kiritildi: ${code}`)}
              />
            </div>
            <p className="text-xs font-mono text-slate-500">Joriy qiymat: {otpVal || "—"}</p>
          </div>
        </Card>
      </section>

      {/* 5. Navigatsiya va Boshqaruvlar */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          5. SegmentedControl & Scroll-snap Tablar
        </h2>
        <Card className="p-6 space-y-5">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500">SegmentedControl:</p>
            <SegmentedControl
              options={[
                { value: "week", label: "Haftalik", icon: <Calendar className="w-3.5 h-3.5" /> },
                { value: "quarter", label: "Choraklik", icon: <BookOpen className="w-3.5 h-3.5" /> },
                { value: "all", label: "Barchasi" },
              ]}
              value={segmentedVal}
              onChange={setSegmentedVal}
            />
          </div>

          <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-500">Scroll-snap Tabs:</p>
            <Tabs defaultValue="tab1">
              <TabsList>
                <TabsTrigger value="tab1">1-chorak</TabsTrigger>
                <TabsTrigger value="tab2">2-chorak</TabsTrigger>
                <TabsTrigger value="tab3">3-chorak</TabsTrigger>
                <TabsTrigger value="tab4">4-chorak</TabsTrigger>
                <TabsTrigger value="tab5">Yakuniy imtihonlar</TabsTrigger>
              </TabsList>
              <TabsContent value="tab1" className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/40 text-xs">
                1-chorak darslari va topshiriqlari
              </TabsContent>
              <TabsContent value="tab2" className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/40 text-xs">
                2-chorak darslari va topshiriqlari
              </TabsContent>
            </Tabs>
          </div>
        </Card>
      </section>

      {/* 6. Progress & Taymerlar */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          6. ProgressBar va CountdownRing
        </h2>
        <Card className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ProgressBar value={75} label="Dars o'zlashtirish" showLabel variant="primary" />
            <ProgressBar value={40} label="Davomat foizi" showLabel variant="gold" />
          </div>

          <div className="flex flex-wrap items-center justify-around gap-6 pt-4 border-t border-slate-100 dark:border-slate-800">
            <div className="flex flex-col items-center gap-2">
              <CountdownRing progressPercent={85} size={72}>
                <span className="text-xs">2:45</span>
              </CountdownRing>
              <span className="text-[11px] text-slate-500">Normal (85%)</span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <CountdownRing progressPercent={22} size={72}>
                <span className="text-xs text-amber-500">0:40</span>
              </CountdownRing>
              <span className="text-[11px] text-amber-500 font-semibold">Warning (22%)</span>
            </div>

            <div className="flex flex-col items-center gap-2">
              <CountdownRing progressPercent={8} size={72}>
                <span className="text-xs text-rose-500 font-bold">0:15</span>
              </CountdownRing>
              <span className="text-[11px] text-rose-500 font-bold">Urgent (8%)</span>
            </div>
          </div>
        </Card>
      </section>

      {/* 7. Dialoglar, Sheetlar & Toastlar */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          7. Modallar, BottomSheet, ConfirmDialog & Toast
        </h2>
        <Card className="p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => setModalOpen(true)}>
              Oddiy Modalni ochish
            </Button>
            <Button variant="outline" onClick={() => setSheetOpen(true)}>
              Mobil BottomSheet ochish
            </Button>
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>
              Xavfli amal ConfirmDialog
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
            <span className="text-xs font-semibold text-slate-500 w-full">Toast xabarlarini sinash:</span>
            <Button size="sm" variant="secondary" onClick={() => toast.success("Amal muvaffaqiyatli bajarildi!")}>
              Success Toast
            </Button>
            <Button size="sm" variant="secondary" onClick={() => toast.error("Kutilmagan xatolik yuz berdi")}>
              Error Toast
            </Button>
            <Button size="sm" variant="secondary" onClick={() => toast.warning("Diqqat, muddat oz qoldi!")}>
              Warning Toast
            </Button>
            <Button size="sm" variant="secondary" onClick={() => toast.info("Yangi dars yuklandi")}>
              Info Toast
            </Button>
          </div>
        </Card>
      </section>

      {/* 8. Bo'sh holat (EmptyState) */}
      <section className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          8. Bo&apos;sh holat (EmptyState)
        </h2>
        <EmptyState
          title="Hozircha ma'lumotlar mavjud emas"
          description="Yangi guruh yoki dars yaratish uchun quyidagi tugmani bosing."
          action={<Button variant="primary">Yangi yaratish</Button>}
        />
      </section>

      {/* Dialogs instances */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Namuna Modal oynasi"
      >
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          Ushbu oyna barcha ekran o&apos;lchamlarida to&apos;g&apos;ri markazlashadi va klaviatura orqali Esc
          yoki tashqi fonni bosish bilan yopiladi.
        </p>
        <div className="flex justify-end pt-4">
          <Button size="sm" onClick={() => setModalOpen(false)}>
            Tushunarli
          </Button>
        </div>
      </Modal>

      <BottomSheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Mobil BottomSheet"
      >
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 pb-4">
          Telefonda foydalanuvchi profilini ko&apos;rish, sozlamalar yoki guruh tanlash uchun qulay pastki
          panel.
        </p>
        <Button className="w-full" onClick={() => setSheetOpen(false)}>
          Yopish
        </Button>
      </BottomSheet>

      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          toast.success("Guruh o'chirildi!");
        }}
        title="Guruhni o'chirishni tasdiqlaysizmi?"
        description="Ushbu amal qaytarib bo'lmaydi. Guruhdagi barcha o'quvchilar va darslar ham o'chiriladi."
        confirmMatchString="8-A"
        danger
        confirmText="O'chirish"
      />
    </div>
  );
}
