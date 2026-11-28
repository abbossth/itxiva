"use client";

import { useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight, Lightbulb, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Kutish zali ("Siz o'yindasiz!") uchun qisqa qo'llanma: qaysi tugma nima qiladi — birma-bir, kichik kartada.
// Yopilsa "💡 Yordam" tugmasiga aylanadi (shu qurilmada eslab qolinadi).

export type GuideTab = "friends" | "boost" | "emotes";

interface Step {
  icon: string;
  title: string;
  text: string;
  tab?: GuideTab;
}

const STEPS: Step[] = [
  { icon: "⏳", title: "Kutib turing", text: "O'yin boshlanganda savollar shu ekranda o'zi chiqadi. Tez va to'g'ri javob ko'proq ochko beradi." },
  { icon: "💃", title: "Harakat g'ildiragi", text: "Personaj atrofidagi tugmalardan birini bosing: personajingiz raqsga tushadi, salom beradi va hokazo. Buni katta ekranda hamma ko'radi." },
  { icon: "🤝", title: "Qo'shnilar", text: "Yoningizdagi o'yinchi tugmasini bosing: personajingiz uni hazil qilib ko'tarib, ekranga otadi. Ochkoga ta'sir qilmaydi.", tab: "friends" },
  { icon: "🎒", title: "Kuchaytirgich", text: "Coin'ga ✂️ 50/50, ⚡ ×2 ochko yoki 🛡️ Qalqon oling. Savol paytida telefonda bir bosishda ishlatasiz (har turdan bir o'yinda 3 tagacha).", tab: "boost" },
  { icon: "🛍️", title: "Harakatlar do'koni", text: "Yangi raqs va harakatlarni coin'ga oching. Ular harakat g'ildiragiga qo'shiladi.", tab: "emotes" },
];

export const TAB_HINTS: Record<GuideTab, string> = {
  friends: "👆 Yoningizdagi o'yinchini bosing: personajingiz uni hazil qilib ekranga otadi",
  boost: "🎒 Kuchaytirgichni hozir oling, savol paytida bir bosishda ishlatasiz",
  emotes: "🛍️ Ochilgan harakat yuqoridagi g'ildirakda paydo bo'ladi",
};

const KEY = "itxiva_lobby_guide_hidden";
let memory: boolean | null = null;
const read = () => {
  if (memory !== null) return memory;
  try {
    memory = window.localStorage.getItem(KEY) === "1";
  } catch {
    memory = false;
  }
  return memory;
};
const setHidden = (v: boolean) => {
  memory = v;
  try {
    window.localStorage.setItem(KEY, v ? "1" : "0");
  } catch {
    /* storage may be blocked — remember for this page only */
  }
  window.dispatchEvent(new Event(KEY));
};
const subscribe = (cb: () => void) => {
  window.addEventListener(KEY, cb);
  return () => window.removeEventListener(KEY, cb);
};

export function LobbyGuide({ onTab }: { onTab: (t: GuideTab) => void }) {
  const hidden = useSyncExternalStore(subscribe, read, () => false);
  const [i, setI] = useState(0);
  if (hidden)
    return (
      <button
        type="button"
        onClick={() => {
          setI(0);
          setHidden(false);
        }}
        className="mx-auto inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-bold text-amber-200 ring-1 ring-white/15 hover:bg-white/15"
      >
        <Lightbulb className="h-3.5 w-3.5" /> Yordam: qaysi tugma nima qiladi?
      </button>
    );
  const s = STEPS[i];
  const go = (d: number) => setI((v) => (v + d + STEPS.length) % STEPS.length);
  return (
    <div className="rounded-2xl bg-amber-300/10 p-3 text-left ring-1 ring-amber-300/30" role="region" aria-label="Qo'llanma">
      <div className="flex items-start gap-2.5">
        <span className="text-2xl leading-none" aria-hidden>
          {s.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-black uppercase tracking-wider text-amber-200">
            💡 {i + 1}/{STEPS.length} · {s.title}
          </p>
          <p key={i} className="quiz-pop mt-0.5 text-sm leading-snug text-white/90">
            {s.text}
          </p>
        </div>
        <button type="button" onClick={() => setHidden(true)} aria-label="Qo'llanmani yopish" className="-mr-1 -mt-1 cursor-pointer rounded-full p-1.5 text-white/50 hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <button type="button" onClick={() => go(-1)} aria-label="Oldingi" className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex flex-1 items-center justify-center gap-1">
          {STEPS.map((_, k) => (
            <button key={k} type="button" aria-label={`${k + 1}-maslahat`} onClick={() => setI(k)} className={cn("h-1.5 cursor-pointer rounded-full transition-all", k === i ? "w-5 bg-amber-300" : "w-1.5 bg-white/30")} />
          ))}
        </div>
        {s.tab && (
          <button type="button" onClick={() => onTab(s.tab!)} className="min-h-8 cursor-pointer rounded-full bg-amber-300 px-3 text-xs font-black text-slate-900">
            Ko&apos;rsat
          </button>
        )}
        <button type="button" onClick={() => go(1)} aria-label="Keyingi" className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
