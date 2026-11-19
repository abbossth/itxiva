// "Yangilik" e'lonlari: platformaga yangi imkoniyat qo'shilganda o'quvchilarga kirishda bir marta modal oynada
// slaydlar bilan tushuntiriladi. Yangi imkoniyat chiqqanda shu ro'yxatning BOSHIGA yozuv qo'shiladi (id — o'zgarmas).
// Ko'rilganlari `User.seenNews` da saqlanadi. Slayd rasmi `art` bo'yicha komponentda chiziladi.
// Bu fayl brauzer va server uchun umumiy.

export type NewsArt = "character-hello" | "character-levels" | "character-shop" | "character-games" | "character-prizes" | "emotes" | "xp-penalty" | "emoji";

export interface NewsSlide {
  title: string;
  text: string;
  art: NewsArt;
  /** art = "emoji" bo'lsa */
  emoji?: string;
}

export interface NewsItem {
  id: string;
  /** Chiqqan sana (YYYY-MM-DD): undan keyin ro'yxatdan o'tganlarga ham ko'rsatiladi */
  date: string;
  /** Kimga: hozircha faqat o'quvchilar */
  audience: "student";
  badge: string;
  title: string;
  slides: NewsSlide[];
  cta?: { label: string; href: string };
}

export const NEWS: NewsItem[] = [
  {
    id: "emotes-2026-11",
    date: "2026-11-19",
    audience: "student",
    badge: "Yangilik",
    title: "Personaj harakatlari va yangi qoidalar",
    slides: [
      {
        art: "emotes",
        title: "Personajingiz harakat qiladi!",
        text: "Jonli o'yinning kutish zalida telefoningizda tugmani bosing — personajingiz katta ekranda salom beradi, qo'lini o'pib salomlashadi yoki sakraydi. Bu 3 ta harakat hammaga bepul.",
      },
      {
        art: "character-shop",
        title: "20 dan ortiq yangi harakat",
        text: "Raqs, qarsak, kuch ko'rsatish, gitara, karate, sehr, salyut, chempion va boshqalar — «Personajim» → «Harakatlar» bo'limida coin evaziga oching. Personajlar ham yangilandi: endi yanada chiroyli va 3D ko'rinishi sifatliroq.",
      },
      {
        art: "xp-penalty",
        title: "Diqqat: jarimada XP ham olinadi",
        text: "Darsni sababsiz qoldirsangiz yoki uyga vazifani muddatida topshirmasangiz — endi coin bilan birga shuncha XP ham kamayadi. Dars sababli deb belgilansa, XP qaytariladi. Darslarga qatnashing va vazifalarni vaqtida topshiring!",
      },
    ],
    cta: { label: "Harakatlarni ko'rish", href: "/profile?tab=character" },
  },
  {
    id: "character-2026-11",
    date: "2026-11-18",
    audience: "student",
    badge: "Yangilik",
    title: "Endi sizning shaxsiy personajingiz bor!",
    slides: [
      {
        art: "character-hello",
        title: "Personajingizni yarating",
        text: "Profil → «Personajim» bo'limida teri rangi, soch, ko'z, kiyim, bosh kiyim va boshqa qismlarni tanlang. Personajni 2D yoki 3D ko'rinishda ko'rasiz — sichqoncha bilan aylantiring, bosing — u sakraydi!",
      },
      {
        art: "character-levels",
        title: "Daraja oshgani sari kuchayadi",
        text: "Boshida hammada oddiy personaj. XP to'plab darajangiz oshganda personaj o'zi chiroyliroq bo'ladi: supasi temirdan oltin va olmosgacha o'zgaradi, aura, nurlar va yulduzlar paydo bo'ladi, yangi kiyimlar ochiladi.",
      },
      {
        art: "character-shop",
        title: "Coin bilan upgrade qiling",
        text: "Coinlaringizga qilich, plash, qanot, toj, hamroh (mushuk, dron, ajdar) va boshqa buyumlarni sotib oling. «Kuch upgrade» — personaj atrofida uchqunlar va yorqin nur.",
      },
      {
        art: "character-games",
        title: "Jonli o'yinlarda shu personaj bilan",
        text: "Mentor jonli o'yin boshlaganda siz o'z personajingiz bilan qatnashasiz: proyektorda yuguradi, raketada uchadi, ko'prikdan sakraydi, konda oltin qazadi, g'alabada shohsupada raqsga tushadi.",
      },
      {
        art: "character-prizes",
        title: "O'yinlarda personajga sovg'a yuting",
        text: "Omad g'ildiragidagi 🎁 Super priz va 🎡 Super barabandan endi faqat coin emas — personaj uchun yangi buyum yoki ⚡ kuch ham chiqadi. Sovg'a buyumlari darajadan qat'i nazar ochiladi!",
      },
    ],
    cta: { label: "Personajimni yaratish", href: "/profile?tab=character" },
  },
];

/** O'quvchiga hali ko'rsatilmagan eng yangi yangilik (ro'yxat yangidan eskiga) */
export function pendingNews(seen: readonly string[], audience: NewsItem["audience"] = "student"): NewsItem | null {
  return NEWS.find((n) => n.audience === audience && !seen.includes(n.id)) ?? null;
}
