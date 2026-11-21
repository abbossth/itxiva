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
    id: "anti-cheat-2026-11",
    date: "2026-11-21",
    audience: "student",
    badge: "Muhim",
    title: "Testlarda halol o'yin",
    slides: [
      {
        art: "emoji",
        emoji: "🛡️",
        title: "Endi har kim o'z bilimi bilan",
        text: "Test, imtihon va jonli o'yin paytida savollarni nusxalab, AI yoki kengaytmaga berib bo'lmaydi. Boshqa oyna yoki ilovaga o'tsangiz, screenshot olmoqchi bo'lsangiz — ekran xiralashadi va bu mentorga ko'rinadi. Ekranda ismingiz yozilgan suv belgisi turadi.",
      },
      {
        art: "emoji",
        emoji: "🔀",
        title: "Uzun javob — to'g'ri javob emas",
        text: "Variantlar endi bir xil uzunlikda va har kimga o'z tartibida chiqadi. Eng uzun variantni yoki «doim B»ni tanlash ishlamaydi — savolni o'qib, o'ylab javob bering. Uzun savollarda shrift o'zi kichrayadi, ekran buzilmaydi.",
      },
    ],
  },
  {
    id: "mentor-anti-cheat-2026-11",
    date: "2026-11-21",
    audience: "mentor",
    badge: "Platformada yangilik",
    title: "Anti-cheat va AI bilan 20 ta savol",
    slides: [
      {
        art: "emoji",
        emoji: "🛡️",
        title: "Anti-cheat",
        text: "Test va jonli o'yinda savol va variantlar matn emas, rasm bo'lib chiziladi: nusxalab ham, AI kengaytmasi o'qiy olmaydi. Copy/paste, o'ng tugma, DevTools yopiq; boshqa oynaga o'tish va screenshot urinishida ekran xiralashadi. Inson ulgurmaydigan tezlikdagi (bot) javob tezlik balini olmaydi. Qaydlar: dars natijalarida test bali yonida ⚠️, «Jonli o'yin» sahifasida «Anti-cheat: so'nggi qaydlar». Eslatma: telefon screenshotini yoki boshqa qurilmadan suratga olishni brauzer to'liq taqiqlay olmaydi — suv belgisi kimniki ekanini ko'rsatadi.",
      },
      {
        art: "emoji",
        emoji: "⚖️",
        title: "To'g'ri javob uzunligidan bilinmaydi",
        text: "«AI bilan 20 ta savol» — mavzu bo'yicha 20 ta savol, variantlar bir xil uzunlik va uslubda; bilinib qolganlari avtomatik tenglashtiriladi. Muharrirda bunday savollar sariq belgilanadi va «Variantlarni tenglashtirish» tugmasi bor. «Darslar» sahifasida «AI bilan hammasini tuzatish» — barcha eski test va imtihonlarni bir bosishda tuzatadi. Variantlar har o'quvchiga o'z tartibida chiqadi.",
      },
    ],
    cta: { label: "Darslarga o'tish", href: "/mentor/lessons" },
  },
  {
    id: "mentor-student-games-monitor-2026-11",
    date: "2026-11-21",
    audience: "mentor",
    badge: "Yaxshilandi",
    title: "O'quvchi o'yinlari kuzatuvi aniqroq",
    slides: [
      {
        art: "emoji",
        emoji: "🛰️",
        title: "Holat to'g'ri ko'rinadi, o'yin osilib qolmaydi",
        text: "«▶ Boshlash» bosilgach kuzatuvda «Boshlanmoqda…» chiqadi (avval adashtirib «O'yinchi kutilmoqda» yozilardi). Siz panelni ochib turganingizda o'yin o'zi oldinga yuradi — o'quvchilar telefonini yopib qo'ysa ham. Tashlab ketilgan o'quvchi o'yini endi 3 soat emas, 1 soatda yopiladi va guruhni band qilib turmaydi.",
      },
    ],
  },
  {
    id: "lobby-screen-throw-2026-11",
    date: "2026-11-21",
    audience: "student",
    badge: "Yangilik",
    title: "Endi to'g'ri ekranga otasiz!",
    slides: [
      {
        art: "emoji",
        emoji: "💥",
        title: "Ekranga urilib yopishadi",
        text: "Kutish zalida yoningizdagini boshingiz uzra yonboshlatib ko'tarasiz va to'g'ri ekranga otasiz: u yon tomoni bilan oynaga urilib yopishadi (oyna yoriladi!), pastga sirpanib tushadi va yugurib joyiga qaytadi. Otish tugamaguncha ikkalangiz ham boshqa tugmani bosa olmaysiz.",
      },
    ],
  },
  {
    id: "mentor-lobby-screen-throw-2026-11",
    date: "2026-11-21",
    audience: "mentor",
    badge: "Platformada yangilik",
    title: "Kutish zali: ekranga otish",
    slides: [
      {
        art: "emoji",
        emoji: "💥",
        title: "Ko'tarib ekranga otish",
        text: "O'quvchi qo'shnisini boshi uzra yonboshlatib ko'taradi va to'g'ri ekranga otadi: personaj proyektorda (ortiqcha kattalashmasdan) yon tomoni bilan oynaga urilib yopishadi, pastga sirpanadi va yugurib joyiga qaytadi (~4 soniya). Otish davomida ikkala ishtirokchi boshqa otishda qatnasha olmaydi; har bir o'quvchi uchun 10 soniyalik oraliq avvalgidek.",
      },
    ],
  },
  {
    id: "emotes-natural-2026-11",
    date: "2026-11-21",
    audience: "student",
    badge: "Yangilik",
    title: "Harakatlar tabiiyroq bo'ldi",
    slides: [
      {
        art: "emotes",
        title: "Haqiqiy harakatlar",
        text: "«Qo'lini o'pib salom» — personaj kaftini labiga olib boradi va o'pichni uchiradi; «Salyut» — tirsak yonga, kaft qosh oldida; «Dab» — ikkala qo'l bir chiziqda, yuz tirsakka yashiringan. Qo'llar endi hamma harakatda yelkadan to'g'ri aylanadi.",
      },
    ],
    cta: { label: "Harakatlarni ko'rish", href: "/profile?tab=character" },
  },
  {
    id: "xp-rules-2026-11",
    date: "2026-11-21",
    audience: "student",
    badge: "Qoida",
    title: "XP va jarimalar yangilandi",
    slides: [
      {
        art: "emoji",
        emoji: "⚡",
        title: "Jarima endi XP olmaydi",
        text: "Darsni sababsiz qoldirsangiz yoki uyga vazifani topshirmasangiz — faqat coin olinadi, XP (tajriba) kamaymaydi. Avval jarima bilan olingan XP sizga qaytarildi! Uyga vazifa jarimasi endi har safar bir xil — 20 coin.",
      },
      {
        art: "emoji",
        emoji: "🎮",
        title: "Jonli o'yinda — faqat coin",
        text: "Jonli o'yinlarda g'olib bo'lsangiz yoki sovg'a qutisini ochsangiz faqat coin olasiz. XP esa o'qish uchun: darsga kelish, test, uyga vazifa va topshiriqlar.",
      },
    ],
  },
  {
    id: "mentor-xp-rules-2026-11",
    date: "2026-11-21",
    audience: "mentor",
    badge: "Platformada yangilik",
    title: "XP va coin qoidalari qayta ko'rib chiqildi",
    slides: [
      {
        art: "emoji",
        emoji: "⚖️",
        title: "XP — faqat o'qish uchun",
        text: "Jarimalar endi XP olmaydi (faqat coin); avval olingan XP o'quvchilarga avtomatik qaytarildi. Uyga vazifa jarimasi — har safar bir xil 20 coin; dars qoldirish — avvalgidek oy ichida 10 / 30 / 50 coin. Jonli o'yin sovrinlari, sovg'a qutilari va o'yindagi to'g'ri javoblar — faqat coin. Profil to'ldirish va Telegram ulash bonusi ham faqat coin. Davomat, test, vazifa, nishon va topshiriqlar XP beradi; siz qo'lda coin berganda XP ni o'zingiz belgilaysiz.",
      },
      {
        art: "emoji",
        emoji: "↩️",
        title: "Xato jarimani qaytarsangiz — sanoq ham qaytadi",
        text: "«Coin iqtisodi»da xato yozilgan jarimani bekor qilsangiz, u oy ichidagi jarima sanog'idan ham chiqadi: o'quvchining keyingi haqiqiy jarimasi birinchidek (−10) hisoblanadi. Avval qaytarilgan jarimalar ham to'g'rilandi. «Bekor qilish» ro'yxati endi sana bo'yicha — bugunga yaqini birinchi.",
      },
    ],
  },
  {
    id: "mentor-student-games-start-2026-11",
    date: "2026-11-21",
    audience: "mentor",
    badge: "Platformada yangilik",
    title: "O'quvchilar o'yinini boshlash — sozlamalar",
    slides: [
      {
        art: "emoji",
        emoji: "▶️",
        title: "O'yinchilar soni va avtomatik boshlanish",
        text: "«Jonli o'yin» → «O'quvchilar yaratgan o'yinlar» → «Sozlamalar»da endi o'yin boshlanishi uchun kamida nechta o'yinchi kerakligini (sukutda 5) va tayyor o'yin necha daqiqa yangi o'yinchi kutib o'zi boshlanishini (sukutda 5) o'zgartirasiz. Kuzatuv ro'yxatida tayyor o'yin yonida «▶ Boshlash» tugmasi chiqadi.",
      },
    ],
    cta: { label: "Sozlash", href: "/mentor/live" },
  },
  {
    id: "student-games-min5-2026-11",
    date: "2026-11-20",
    audience: "student",
    badge: "Qoida",
    title: "O'quvchilar o'yini kamida 5 kishi bilan",
    slides: [
      {
        art: "emoji",
        emoji: "👥",
        title: "Kamida 5 o'yinchi",
        text: "O'zingiz ochgan jonli o'yin kamida 5 kishi qo'shilganda (va coin yig'ilgach) boshlanadi. Uni o'yin egasi yoki mentor boshlaydi; 5 daqiqa yangi o'yinchi qo'shilmasa — o'zi boshlanadi.",
      },
    ],
  },
  {
    id: "mentor-student-games-min5-2026-11",
    date: "2026-11-20",
    audience: "mentor",
    badge: "Platformada yangilik",
    title: "O'quvchilar o'yini: kamida 5 o'yinchi",
    slides: [
      {
        art: "emoji",
        emoji: "👥",
        title: "Boshlashni egasi yoki siz hal qilasiz",
        text: "O'quvchilar o'yini kamida 5 o'yinchi qo'shilmaguncha boshlanmaydi. Tayyor o'yinni o'yin egasi yoki siz (proyektordagi «Boshlash») boshlaysiz; 5 daqiqa yangi o'yinchi qo'shilmasa — o'zi boshlanadi. 20 daqiqada yig'ilmasa — bekor, coin qaytadi.",
      },
    ],
  },
  {
    id: "student-games-sale-2026-11",
    date: "2026-11-20",
    audience: "student",
    badge: "Skidka",
    title: "Jonli o'yinlar arzonlashdi!",
    slides: [
      {
        art: "emoji",
        emoji: "🏷️",
        title: "Har bir o'yin 5 coin arzon",
        text: "«Jonli o'yin» bo'limida o'yin ochish endi skidkada: har bir tur 5 coin arzon — masalan, klassik 15 emas, 10 coin. Mentor ba'zan bepul davr ham ochadi — o'shanda coin to'lamasdan o'yin ochib, o'zingiz boshlaysiz!",
      },
    ],
    cta: { label: "O'yin ochish", href: "/live" },
  },
  {
    id: "mentor-student-games-sale-2026-11",
    date: "2026-11-20",
    audience: "mentor",
    badge: "Platformada yangilik",
    title: "O'quvchilar o'yini: skidka va bepul davr",
    slides: [
      {
        art: "emoji",
        emoji: "🎁",
        title: "Skidka va bepul davr sizning qo'lingizda",
        text: "«Jonli o'yin» → «O'quvchilar yaratgan o'yinlar» → «Sozlamalar»: skidka (sukutda har o'yin 5 coin arzon, 0 — o'chiq) va bepul davr — boshlanish/tugash vaqtini belgilang yoki «1 soat», «Bugun kechgacha», «3 kun», «1 hafta» tugmalarini bosing. Bepul davrda o'quvchilar coin to'lamasdan o'yin ochadi va o'zi boshlaydi; bepul o'yinlarda sovrin sukut bo'yicha berilmaydi (xohlasangiz yoqasiz).",
      },
    ],
    cta: { label: "Sozlash", href: "/mentor/live" },
  },
  {
    id: "arena-shield-2026-11",
    date: "2026-11-20",
    audience: "student",
    badge: "Yangilik",
    title: "Kiber arenada qalqon endi yaqqol ko'rinadi",
    slides: [
      {
        art: "emoji",
        emoji: "🛡️",
        title: "Oltin qalqon",
        text: "Kiber arenada qalqon olgan o'yinchi atrofida endi oltin-kamalaksimon nurli gardish, olti burchakli energiya to'ri va tepasida oltin qalqon belgisi chiqadi — qizil, ko'k yoki boshqa jamoada bo'lsangiz ham darhol bilinadi.",
      },
    ],
  },
  {
    id: "mentor-arena-shield-2026-11",
    date: "2026-11-20",
    audience: "mentor",
    badge: "Platformada yangilik",
    title: "Kiber arena: qalqon effekti",
    slides: [
      {
        art: "emoji",
        emoji: "🛡️",
        title: "Qalqon jamoa rangidan ajralib turadi",
        text: "Jamoaviy arenada ko'k jamoa halqasi va qalqon bir-biriga o'xshab qolardi. Endi qalqon alohida effektda: oltin nurli aylanuvchi gardish, olti burchakli to'r va tepada qalqon belgisi — proyektorda ham, o'quvchi ekranida ham.",
      },
    ],
  },
  {
    id: "characters-real-2026-11",
    date: "2026-11-20",
    audience: "student",
    badge: "Yangilik",
    title: "Personajlar yanada jonli va harakatlar arzon!",
    slides: [
      {
        art: "character-hello",
        title: "Haqiqiyroq yuz va tana",
        text: "Personajingiz yuzi endi odamnikiga o'xshaydi: jag' va yonoq, bodom shaklidagi ko'zlar (qovoq, kiprik, rangli kamalak parda), burun va lablar. Qo'l va oyoqlar hajmli soyali, qo'llar tirsakdan bukiladi — salom berish, yugurish, karate va kuch ko'rsatish ancha tabiiy.",
      },
      {
        art: "emotes",
        title: "Harakatlar endi 5 coindan",
        text: "«Personajim» → «Harakatlar»: barcha harakatlar arzonlashdi — 5 dan 30 coingacha. Raqs 12, gitara 22, chempion 30 coin. Salom berish, qo'lini o'pib salom va sakrash avvalgidek bepul.",
      },
    ],
    cta: { label: "Harakatlarni ko'rish", href: "/profile?tab=character" },
  },
  {
    id: "mentor-characters-real-2026-11",
    date: "2026-11-20",
    audience: "mentor",
    badge: "Platformada yangilik",
    title: "Personajlar: realistikroq ko'rinish, arzon harakatlar",
    slides: [
      {
        art: "emoji",
        emoji: "🧑",
        title: "Yuz, soya va tirsak bo'g'imi",
        text: "O'quvchilar personaji hozirgi uslubda realistikroq bo'ldi: jag'li yuz, haqiqiyroq ko'z, burun va lablar, qo'l-oyoqlarda hajmli soya, tirsakdan bukiladigan qo'llar. Harakatlar (emotlar) narxi 5–30 coinga tushirildi (avval 30–150).",
      },
    ],
  },
  {
    id: "lobby-throw-2026-11",
    date: "2026-11-20",
    audience: "student",
    badge: "Yangilik",
    title: "Endi ko'tarib otasiz!",
    slides: [
      {
        art: "emoji",
        emoji: "🤾",
        title: "Ko'tarib otish",
        text: "Kutish zalida yoningizdagini endi shunchaki itarmaysiz: personajingiz unga yaqinlashib, boshi uzra ko'taradi va otib yuboradi — u havoda aylanib uchadi, yerga tushib chang ko'taradi. Bir marta otgandan keyin 10 soniya kutasiz.",
      },
    ],
  },
  {
    id: "mentor-lobby-throw-2026-11",
    date: "2026-11-20",
    audience: "mentor",
    badge: "Platformada yangilik",
    title: "Kutish zali: ko'tarib otish",
    slides: [
      {
        art: "emoji",
        emoji: "🤾",
        title: "Itarish o'rniga ko'tarib otish, 10 soniya oraliq",
        text: "Kutish zalidagi hazil endi jonliroq: o'quvchi qo'shnisini boshi uzra ko'tarib yon tomonga otadi (havoda aylanadi, qo'nganda chang ko'tariladi) — proyektorda ham shunday ko'rinadi. Bir o'quvchi otgandan keyin 10 soniya qayta bosa olmaydi.",
      },
    ],
  },
  {
    id: "lobby-push-2026-11",
    date: "2026-11-20",
    audience: "student",
    badge: "Yangilik",
    title: "Kutish zalida hazillashing!",
    slides: [
      {
        art: "emoji",
        emoji: "🤜",
        title: "Yoningizdagini itaring",
        text: "Jonli o'yinning kutish zalida telefoningizda chap yoki o'ngdagi o'yinchi nomi bilan tugma chiqadi — bosing, personajingiz uni itarib yuboradi! Buni siz ham, u ham telefonda, hamma esa katta ekranda ko'radi.",
      },
      {
        art: "emoji",
        emoji: "📺",
        title: "G'oliblar — avval katta ekranda",
        text: "O'yin tugaganda telefoningiz «Monitorga qarang!» deydi: g'oliblar avval katta ekranda e'lon qilinadi, keyin o'z o'rningiz telefonda chiqadi. Harakatlarda endi stikerlar chiqmaydi — faqat personajingiz harakat qiladi.",
      },
    ],
  },
  {
    id: "mentor-lobby-push-2026-11",
    date: "2026-11-20",
    audience: "mentor",
    badge: "Platformada yangilik",
    title: "Kutish zali va g'oliblar e'loni",
    slides: [
      {
        art: "emoji",
        emoji: "🤜",
        title: "O'quvchilar yonidagini itarib hazillashadi",
        text: "Kutish zalida o'quvchi chap yoki o'ng qo'shnisini itara oladi (proyektordagi tartib bo'yicha; jamoaviyda — o'z jamoasi qatorida). Itaruvchi tashlanadi, itarilgan uchib gandiraklaydi — proyektorda ham ko'rinadi. Harakatlarda emoji-stikerlar olib tashlandi.",
      },
      {
        art: "emoji",
        emoji: "📺",
        title: "G'oliblar avval proyektorda",
        text: "O'yin tugaganda o'quvchilar telefonida ~12 soniya «Monitorga qarang!» chiqadi — shohsupa proyektorda ochilib bo'lgach, har kim o'z o'rnini va coin tabrigini telefonda ko'radi.",
      },
    ],
  },
  {
    id: "characters-v3-2026-11",
    date: "2026-11-20",
    audience: "student",
    badge: "Yangilik",
    title: "Personajlar yangilandi va arzonlashdi!",
    slides: [
      {
        art: "character-hello",
        title: "Haqiqiy odamga o'xshash tana",
        text: "Personajingiz endi o'smir nisbatida: bo'yin, yelka, beli toraygan gavda, tirsakda bukiladigan qo'llar, barmoqli kaftlar, kamar, tizzali shim va krossovka. Hamma o'yinlarda shunday ko'rinadi.",
      },
      {
        art: "emoji",
        emoji: "🦸",
        title: "Yangi qahramonlar — 50 coindan",
        text: "«Personajim» → «Kostyum» bo'limida yangi qahramonlar: Asalari (50), Super qahramon (60), Soya ninja (80), Kosmonavt (90), Ritsar (100), Temir robot (120), Sehrgar (140). Eski kostyumlar ham arzonlashdi — 50 dan 150 coingacha.",
      },
      {
        art: "character-shop",
        title: "Buyumlar endi juda arzon",
        text: "Soch, ko'z, kiyim, bosh kiyim, hamroh va boshqa buyumlar endi 2 coindan boshlanadi — ko'pchiligi 2–30 coin. Personajingizni xohlagancha bezang!",
      },
    ],
    cta: { label: "Personajimni bezash", href: "/profile?tab=character" },
  },
  {
    id: "mentor-characters-v3-2026-11",
    date: "2026-11-20",
    audience: "mentor",
    badge: "Platformada yangilik",
    title: "Personajlar narxi va jonli o'yinlar ro'yxati",
    slides: [
      {
        art: "emoji",
        emoji: "🧍",
        title: "Personajlar: yangi tana, yangi narxlar",
        text: "O'quvchilar personajining tanasi odamga yaqin nisbatda qayta chizildi. Personaj buyumlari narxi 2–30 coinga tushirildi, kostyumlar (butun personaj) 50–150 coin; 7 ta yangi original qahramon qo'shildi (Asalari, Super qahramon, Soya ninja, Kosmonavt, Ritsar, Temir robot, Sehrgar).",
      },
      {
        art: "emoji",
        emoji: "📄",
        title: "Oxirgi o'yinlar — sahifalab",
        text: "«Jonli o'yin» sahifasidagi «Oxirgi o'yinlar» endi 5 tadan sahifalab ko'rsatiladi (oxirgi 60 ta o'yin); o'quvchilar o'yinlari ro'yxati ham shunday.",
      },
    ],
  },
  {
    id: "student-games-prizes-2026-11",
    date: "2026-11-20",
    audience: "student",
    badge: "Yangilik",
    title: "O'quvchilar o'yinida endi sovrin bor!",
    slides: [
      {
        art: "emoji",
        emoji: "🏆",
        title: "G'oliblarga coin",
        text: "O'zingiz ochgan jonli o'yinlarda ham g'oliblar coin yutadi: 🥇 1-o'rin — 30, 🥈 2-o'rin — 20, 🥉 3-o'rin — 10 coin. Jamoaviy o'yinda g'olib jamoaning har bir a'zosiga 20 coin. Sovrin o'yinda kamida 3 kishi qatnashsa beriladi — do'stlaringizni chaqiring!",
      },
    ],
    cta: { label: "O'yin ochish", href: "/live" },
  },
  {
    id: "mentor-student-games-prizes-2026-11",
    date: "2026-11-20",
    audience: "mentor",
    badge: "Platformada yangilik",
    title: "O'quvchilar o'yinida g'oliblarga coin",
    slides: [
      {
        art: "emoji",
        emoji: "🏆",
        title: "Sovrinlar va himoya",
        text: "O'quvchilar ochgan o'yinlarda endi g'oliblarga coin beriladi: 1-o'rin 30, 2-o'rin 20, 3-o'rin 10, jamoaviyda g'olib jamoa a'zolariga 20. Sovrin faqat kamida 3 o'yinchi qatnashganda beriladi (o'quvchi yolg'iz o'ynab coin yig'masin); sovg'a qutisi va test savollari coini yo'q. Miqdorlar va o'yinchilar sonini «Jonli o'yin» → «O'quvchilar yaratgan o'yinlar» → «Sozlamalar»da o'zgartirasiz.",
      },
    ],
    cta: { label: "Sozlash", href: "/mentor/live" },
  },
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
        text: "G'oliblarga coin beriladi: 🥇 30, 🥈 20, 🥉 10, jamoaviy o'yinda g'olib jamoaning har biriga 20 (kamida 3 kishi o'ynasa). Dars vaqtida o'yin ochib bo'lmaydi. Darsni sababsiz qoldirsangiz, 2 kun jonli o'yinlarga kira olmaysiz — darslarga qatnashing!",
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
        text: "O'quvchi «Jonli o'yin» bo'limida guruhi yoki butun sinfi uchun o'yin ochadi; narxini qatnashchilar birgalikda coin qo'shib yig'adi (masalan, klassik 15 coin: 5+2+4+3+1). Narx to'lgach o'yin o'zi boshlanadi, server o'zi boshqaradi. G'oliblarga coin: 30/20/10, jamoaviyda g'olib jamoa a'zolariga 20 (kamida 3 o'yinchi bo'lsa; sozlamalardan o'zgartirasiz). Sovg'a qutisi va test coini yo'q. Boshlanmasa — har kimga o'z coini qaytadi.",
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
