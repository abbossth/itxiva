// "Yangilik" e'lonlari: platformaga o'zgarish kelganda tegishli foydalanuvchilarga kirishda bir marta modal oynada
// slaydlar bilan tushuntiriladi. QOIDA: o'quvchilarga tegishli har bir o'zgarish — audience "student" yozuvi,
// mentorga tegishlisi — audience "mentor" yozuvi; ikkalasiga tegishli bo'lsa — ikkita yozuv (har biri o'z tilida).
// Yangi yozuv ro'yxatning BOSHIGA qo'shiladi (id — o'zgarmas).
// Ko'rilganlari `User.seenNews` da saqlanadi. Slayd rasmi `art` bo'yicha komponentda chiziladi.
// Bu fayl brauzer va server uchun umumiy.

export type NewsArt = "character-hello" | "character-levels" | "character-shop" | "character-games" | "character-prizes" | "emotes" | "xp-penalty" | "boosters" | "games" | "emoji";

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
  /** Kimga: o'quvchilar yoki mentorlar */
  audience: "student" | "mentor";
  badge: string;
  title: string;
  slides: NewsSlide[];
  cta?: { label: string; href: string };
}

export const NEWS: NewsItem[] = [
  {
    id: "student-games-2026-11",
    date: "2026-11-20",
    audience: "student",
    badge: "Yangilik",
    title: "Endi jonli o'yinni o'zingiz ochasiz!",
    slides: [
      {
        art: "emoji",
        emoji: "🎮",
        title: "O'z o'yiningizni oching",
        text: "Menyudagi «Jonli o'yin» bo'limida istalgan o'yin turini tanlang: guruhingiz uchun yoki butun sinfingiz (masalan, barcha 8-sinflar) uchun. O'yinni o'zingiz ham o'ynaysiz — proyektor shart emas, o'yin o'zi yuradi.",
      },
      {
        art: "emoji",
        emoji: "🤝",
        title: "Narxini birgalikda yig'asiz",
        text: "Har o'yinning narxi bor (10 coindan, masalan klassik — 15). Siz birinchi hissani qo'shasiz, do'stlaringiz ham +1, +2, +5 qo'shadi. Coin to'lgach o'yin bir necha soniyada o'zi boshlanadi. Boshlanmasa — har kimga o'z coini qaytariladi.",
      },
      {
        art: "emoji",
        emoji: "⚠️",
        title: "Qoidalar",
        text: "Bu o'yinlarda g'oliblarga coin berilmaydi — faqat sharaf va zavq uchun. Dars vaqtida o'yin ochib bo'lmaydi. Darsni sababsiz qoldirsangiz, 2 kun jonli o'yinlarga kira olmaysiz — darslarga qatnashing!",
      },
    ],
    cta: { label: "O'yin ochish", href: "/live" },
  },
  {
    id: "mentor-student-games-2026-11",
    date: "2026-11-20",
    audience: "mentor",
    badge: "Platformada yangilik",
    title: "O'quvchilar o'z jonli o'yinlarini ochadi",
    slides: [
      {
        art: "emoji",
        emoji: "🎮",
        title: "O'quvchilar o'yin ochadi, birgalikda coin yig'adi",
        text: "O'quvchi «Jonli o'yin» bo'limida guruhi yoki butun sinfi uchun o'yin ochadi; narxini qatnashchilar birgalikda coin qo'shib yig'adi (masalan, klassik 15 coin: 5+2+4+3+1). Narx to'lgach o'yin o'zi boshlanadi, server o'zi boshqaradi. G'oliblarga coin, XP va sovg'a berilmaydi. Boshlanmasa — har kimga o'z coini qaytadi.",
      },
      {
        art: "emoji",
        emoji: "🛠️",
        title: "To'liq boshqaruv sizda",
        text: "Jonli o'yin sahifasidagi «O'quvchilar yaratgan o'yinlar» → «Sozlamalar»: yoqish/o'chirish, dars vaqtida taqiqlash, har tur narxi (0 — yopiq), butun sinf uchun ruxsat va qo'shimcha narx, kunlik limit. Darsni sababsiz qoldirgan o'quvchi uchun jonli o'yinlar necha kun yopilishini ham shu yerda belgilaysiz (sukutda 2 kun, mentor o'yinlariga ham).",
      },
      {
        art: "emoji",
        emoji: "👀",
        title: "Kuzating va to'xtating",
        text: "Shu sahifada hozir ketayotgan o'quvchi o'yinlari ko'rinadi: kim ochgan, kimlar qancha coin qo'shgan, kimlar o'ynayapti va qaysi bosqichda. «Kuzatish» — proyektor ko'rinishida ochiladi, «To'xtatish» — o'yinni yopadi (xohlasangiz coin qaytariladi). Siz guruhda o'yin ochsangiz, o'quvchilar o'yini avtomatik to'xtaydi.",
      },
    ],
    cta: { label: "Sozlash", href: "/mentor/live" },
  },
  {
    id: "arena-board-2026-11",
    date: "2026-11-19",
    audience: "student",
    badge: "Yangilik",
    title: "Kiber arenada statistika",
    slides: [
      {
        art: "emoji",
        emoji: "📊",
        title: "Tab — kim nechta kill qildi?",
        text: "Kiber arenada kompyuterda Tab tugmasini bosib turing (telefonda — yuqoridagi 📊 tugmasi): har bir o'yinchining kill soni, necha marta yiqilgani, qolgan joni va kim chiqib ketgani ko'rinadi. Eng ko'p kill qilgan 👑 bilan belgilanadi, jamoaviy jangda — jamoalar bo'yicha.",
      },
    ],
  },
  {
    id: "mentor-arena-board-2026-11",
    date: "2026-11-19",
    audience: "mentor",
    badge: "Platformada yangilik",
    title: "Kiber arenada o'quvchilar uchun statistika",
    slides: [
      {
        art: "emoji",
        emoji: "📊",
        title: "Tab bosilganda jang statistikasi",
        text: "Kiber arena paytida o'quvchilar o'z qurilmasida Tab tugmasini bosib turib (telefonda 📊 tugmasi) jadvalni ko'radi: kill, o'lim, qolgan jon va kim chiqib ketgani; jamoaviy jangda jamoalar bo'yicha jami kill. Jang davom etaveradi — jadval o'yinni to'xtatmaydi.",
      },
    ],
  },
  {
    id: "mentor-reports-2026-11",
    date: "2026-11-19",
    audience: "mentor",
    badge: "Platformada yangilik",
    title: "Hisobotlar va ro'yxatlar yangilandi",
    slides: [
      {
        art: "emoji",
        emoji: "📊",
        title: "Hisobotlar tezroq ochiladi",
        text: "«Hisobotlar» sahifasi (ayniqsa «O'quv yili» davri) endi ancha tez yuklanadi: coinlar baza ichida hisoblanadi, bo'limlar bir vaqtda yuklanadi. Uyga vazifalar qutisi, imtihonlar va e'lonlar ro'yxati ham yengillashdi.",
      },
      {
        art: "emoji",
        emoji: "🔤",
        title: "Ismlar o'zbek alifbosi tartibida",
        text: "Jadvallarda ismlar endi hamma joyda bir xil — o'zbek alifbosi bo'yicha saralanadi: Oʻ, Gʻ, Sh, Ch harflari Z dan keyin keladi. Avval hisobot jadvali ochilganda tartib bir lahzada o'zgarib ketardi — bu tuzatildi.",
      },
      {
        art: "emoji",
        emoji: "👥",
        title: "Guruhdagi o'quvchilar soni doim to'g'ri",
        text: "Guruh kartochkasi va guruh sahifasidagi o'quvchilar soni endi har safar bazadan sanaladi — o'quvchini arxivlash yoki tiklashdan keyin ham to'g'ri ko'rinadi. Davomat proyektori ham serverga kamroq yuk beradi.",
      },
    ],
    cta: { label: "Hisobotlarni ochish", href: "/mentor/reports" },
  },
  {
    id: "mentor-live-2026-11",
    date: "2026-11-19",
    audience: "mentor",
    badge: "Platformada yangilik",
    title: "Jonli o'yinlarda nimalar o'zgardi",
    slides: [
      {
        art: "games",
        title: "O'quvchilar personaji barcha o'yinlarda",
        text: "Yashil zona va Kiber arenada robotlar o'rniga o'quvchilarning o'z personajlari yuradi, Galaktika poygasida kema kabinasida uchuvchining boshi ko'rinadi. Javob berib bo'lgan o'quvchilar kutish paytida harakat (emot) yuboradi — proyektordagi personajlar qatorida ko'rinadi.",
      },
      {
        art: "boosters",
        title: "O'quvchilar uchun kuchaytirgichlar",
        text: "O'quvchilar coin evaziga sotib olib, savol paytida ishlatadi: ✂️ 50/50 (15 coin), ⚡ ×2 ochko (20 coin, faqat oddiy savol rejimlarida), 🛡️ Qalqon (20 coin — bitta xato kechiriladi). Har savolda har turdan bittadan, bir o'yinda har turdan ko'pi bilan 3 ta. Sarflangan coin «Coin iqtisodi»da «purchase» sifatida ko'rinadi.",
      },
      {
        art: "emoji",
        emoji: "🎲",
        title: "Mini o'yinlar tartibi endi tasodifiy",
        text: "Har 3 savoldan keyingi mini o'yin endi har doim omad g'ildiragi bo'lmaydi: tartib har o'yinda boshqacha va hamma tur bir martadan chiqmaguncha takrorlanmaydi. «Qisqa o'yinlarda Yashil zona ham chiqsin» yoqilgan bo'lsa, Yashil zona ham shu navbatga qo'shiladi.",
      },
      {
        art: "emoji",
        emoji: "⚡",
        title: "Tezroq va yengilroq",
        text: "Natijani ochish katta guruhlarda ham bir lahzada bajariladi, sahifalar serverga kamroq yuk beradi. Jonli o'yin paytida o'quvchilar ekraniga e'lon, mukofot yoki yangilik oynalari chiqmaydi — ular o'yindan keyin ko'rsatiladi.",
      },
    ],
    cta: { label: "Jonli o'yinlar", href: "/mentor/live" },
  },
  {
    id: "live-random-2026-11",
    date: "2026-11-19",
    audience: "student",
    badge: "Yangilik",
    title: "Jonli o'yinlar yanada qiziqarli",
    slides: [
      {
        art: "emoji",
        emoji: "🎲",
        title: "Mini o'yinlar har safar boshqacha",
        text: "Har 3 savoldan keyin chiqadigan mini o'yin endi tasodifiy: mo'ljalga otish, xotira, tez hisob, rang tuzog'i, reaksiya, omad g'ildiragi, bonus raund yoki Yashil zona. Hamma o'yin bir martadan chiqmaguncha takrorlanmaydi!",
      },
      {
        art: "emoji",
        emoji: "🎯",
        title: "O'yin paytida hech narsa xalaqit bermaydi",
        text: "Savolga javob berayotganingizda ekranga e'lon, mukofot yoki yangilik oynasi chiqmaydi — ular o'yin tugagach ko'rsatiladi.",
      },
    ],
  },
  {
    id: "boosters-2026-11",
    date: "2026-11-19",
    audience: "student",
    badge: "Yangilik",
    title: "Personajingiz endi barcha o'yinlarda",
    slides: [
      {
        art: "games",
        title: "Hamma o'yinda — o'z personajingiz",
        text: "Yashil zonada robot o'rniga personajingiz yuguradi, Kiber arenada qurol bilan jang qiladi, Galaktika poygasida kemangiz kabinasida o'tiradi. Savolga javob berib kutayotganda ham harakat tugmalarini bosing — katta ekranda ko'rinadi.",
      },
      {
        art: "boosters",
        title: "O'yin uchun kuchaytirgichlar",
        text: "Coinga sotib oling va savol paytida bosing: ✂️ 50/50 — ikkita noto'g'ri variant o'chadi; ⚡ ×2 — keyingi to'g'ri javob ikki baravar ochko; 🛡️ Qalqon — bitta xato kechiriladi (jon ketmaydi, seriya uzilmaydi). Kutish zalida yoki «Personajim» → «O'yin uchun» bo'limida.",
      },
    ],
    cta: { label: "Kuchaytirgich olish", href: "/profile?tab=character" },
  },
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
