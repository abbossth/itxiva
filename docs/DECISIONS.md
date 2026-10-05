# ITXiva — Arxitektura va texnik qarorlar daftari (DECISIONS.md)

Ushbu hujjatda loyihani amalga oshirish davomida qabul qilingan texnik qarorlar, mantiqiy tanlovlar va arxitektura yechimlari qayd etib boriladi.

---

### [2026-10-05] 1-qaror: Next.js 16 va Tailwind CSS v4 integratsiyasi
- **Holat**: Loyihada eng so'nggi Next.js (16.3.8, React 19.2.8) va Tailwind CSS v4 o'rnatildi.
- **Qaror**: `globals.css`da zamonaviy `@import "tailwindcss";` va CSS custom properties orqali dizayn tokenlari (yorug'/qorong'i rejim, Xiva firuza `#14B8A6` → chuqur ko'k `#2563EB`, oltin/amber `#F59E0B`) e'lon qilindi. Theme almashtirish `html.dark` classi orqali boshqariladi.

### [2026-10-05] 2-qaror: Auth va Sessiya boshqaruvi
- **Holat**: Autentifikatsiya `jose` va HTTP-only cookie bilan amalga oshiriladi.
- **Qaror**: Next.js 15+ da `cookies()` asinxron funksiya. Server Actions va Server Components ichida `await cookies()` ishlatiladi. Sessiya tokenida `{ userId, role, groupId, mustChangePassword }` saqlanadi, muddati 14 kun.

### [2026-10-05] 3-qaror: O'quvchilar importi va Login yaratish
- **Holat**: Google Sheets yoki CSV'dan nusxalangan ism-familiyalar uchun noyob login va tasodifiy parol generatsiya qilinadi.
- **Qaror**: Ism-familiyadan transliteratsiya orqali login yasaladi (masalan, `alisher_valiyev`). Agar bazada bor bo'lsa, tartib raqami qo'shiladi (`alisher_valiyev_2`). Parollar 8 belgili xavfsiz tasodifiy string (harflar va raqamlar) bo'lib, konsol/modal orqali faqat 1 marta CSV sifatida ko'rsatiladi va `bcryptjs` bilan xeshlanadi.

### [2026-10-05] 4-qaror: 1-bosqich Reyting hisoblash
- **Holat**: 3-bosqichdagi Coin ledger ulanmaguncha, reyting `User.totalCoins` maydoni bo'yicha hisoblanadi.
- **Qaror**: 1-bosqichda Umumiy, Guruh va Sinf filtrlari to'liq ishlaydi. O'quvchilarga boshqalarning ismi "Ali V." ko'rinishida yuboriladi (privacy protection).

### [2026-10-05] 5-qaror: Dars orasidagi kichik testlar (Quizzes) arxitekturasi
- **Holat**: Darslarni mustahkamlash uchun dars sahifasida kichik testlar (`/lessons/[id]`).
- **Qaror**: Test savollari 4 turga bo'lindi: `single_choice`, `multiple_choice`, `short_answer` (avtomatik tekshirish va `normalizeText` orqali bo'shliqlar/harf registri tenglashtiriladi), `open_ended` (mentor baholashi uchun). Mentor dars muharririda (`QuizEditorModal`) testni darsga bog'laydi. O'quvchi topshirgach darhol o'tish bali va to'g'ri javoblarni ko'radi.

### [2026-10-05] 6-qaror: Choraklik imtihonlar (Exams), qat'iy server-side taymer va R2 fayl yuklash
- **Holat**: Choraklik nazorat va loyiha imtihonlari (`/exams` va `/mentor/exams`).
- **Qaror**: 
  1. **Qat'iy server-side taymer**: O'quvchi imtihonni boshlaganda serverda `startedAt` fiksatsiyalanadi. Har bir qoralama saqlash (`saveExamDraftAction`) va yakuniy topshirishda (`submitExamAction`) `startedAt + durationMinutes + 1 daqiqa bufer` qat'iy tekshiriladi; mijoz soatini orqaga surish imtihon vaqtini cho'za olmaydi.
  2. **Auto-save**: Imtihon vaqtida har 30 soniyada qoralama javoblar avtomatik serverga saqlanadi.
  3. **Loyiha fayllari va GitHub**: Amaliy topshiriqlar uchun GitHub repozitoriy havolasi yoki Cloudflare R2 presigned PUT URL orqali to'g'ridan-to'g'ri fayl (zip/rar/pdf/py/js/ipynb, max 50MB) yuklanadi. Mentor baholash oynasida presigned GET URL orqali faylni yuklab oladi.
  4. **Natijalarni e'lon qilish nazorati**: Mentor tekshirib `isResultsPublished`ni yoqmaguncha, test javoblari va natijalar o'quvchilarga sir tutiladi.

### [2026-10-05] 7-qaror: Mobil-first jadval arxitekturasi (K1 muammosi yechimi)
- **Holat**: Guruh tafsilotlari (`/mentor/groups/[id]`) va audit jurnali (`/mentor/audit`) 400px mobil ekranda `overflow-hidden` sababli kesilib, amallar tugmalariga yetib bo'lmayotgan edi.
- **Qaror**: 768px dan kichik ekranlarda har bir o'quvchi va audit yozuvi alohida Karta (`StudentCard`, `AuditCard`) ko'rinishida chiqarildi. Karta ichida avatar, ism, login, coinlar, oxirgi kirish vaqti va kamida 44×44px o'lchamdagi tezkor amallar (Parol, Ko'chirish, O'chirish) joylashtirildi. Desktopda esa `overflow-x-auto` jadvali saqlandi.

### [2026-10-05] 8-qaror: Inter shrifti va Tailwind CSS v4 `@theme` integratsiyasi (K2 muammosi yechimi)
- **Holat**: Inter shrifti yuklangan bo'lsa-da, Tailwind CSS v4 tizim shriftini ko'rsatayotgan va yorug' rejimda kontrast WCAG AA talablariga yetmayotgan edi.
- **Qaror**: `globals.css`da `@theme { --font-sans: var(--font-inter), ...; }` o'rnatildi. Matnlar uchun firuza `#0F766E` (5.5:1 nisbat), sarlavhalar uchun to'q ranglar va asosiy gradient `#0D9488 → #2563EB` sifatida to'qlashtirildi.

### [2026-10-05] 9-qaror: Reyting podiumi va tenglik mantiqi (K3 muammosi yechimi)
- **Holat**: Barcha o'quvchilarda 0 coin bo'lganda ham podium 1-2-3 o'rinni soxta ko'rsatayotgan edi.
- **Qaror**: Agar yetakchilarda tangalar soni 0 bo'lsa, podium o'rniga "Hali hech kim coin to'plamagan — birinchi bo'ling!" rag'batlantiruvchi bo'sh holati chiqadi. Teng coin to'plangan hollarda bir xil o'rin berilib, keyingi o'rin o'tkazib yuboriladi (1, 1, 3). Shuningdek, talaba uchun qayerda ekanini ko'rsatuvchi "Mening o'rnim" fiksatsiyalangan paneli kiritildi.

### [2026-10-05] 10-qaror: 180 soniyalik aylanuvchi QR va 6 belgili OTP davomat tizimi
- **Holat**: O'quvchilar davomatini qog'ozsiz, firibgarlikdan xoli (skrinshot uzatishning oldini oluvchi) va gamifikatsiya bilan bog'langan zamonaviy tizim yaratish talabi.
- **Qaror**: 
  1. **180s rotatsiya va 20s grace period**: Har 180 soniyada serverda yangi crypto token va 6 belgili kod avtomatik yangilanadi. Eski kodga 20 soniya imtiyoz beriladi, bu orqali sekinroq internetli o'quvchilar uzilib qolmaydi.
  2. **Proyektor rejimi**: Mentor uchun ulkan QR kod, katta shriftli kod, SVG taymer aylana (`CountdownRing`) va kelganlarning jonli oqimi.
  3. **Auto-coin va Ledger**: Har bir kelgan o'quvchiga avtomatik +10 coin beriladi va bu `CoinLedger` tranzaksiyalar kitobiga qayd etiladi. Sessiya yopilganda qatnashmagan barcha o'quvchilarga avtomatik `absent` (0 coin) yoziladi.

### [2026-10-05] 11-qaror: Joriy o'quv yili (2026-2027) standartlashtirilishi
- **Holat**: Platforma 2026-2027 o'quv yilida faoliyat ko'rsatmoqda, biroq guruh yaratish formasi, Mongoose modeli va Zod validatsiyasida sukut bo'yicha `2025-2026` qolgan edi.
- **Qaror**: Barcha standart qiymatlar (`Group` modeli, `groupSchema`, `GroupsManager` overview va formasi, `scripts/seed.ts` guruhlari) `2026-2027` ga yangilandi.

### [2026-10-05] 12-qaror: O'quvchi davomati — Doimiy 6 xonali kod kiritish va Kamera orqali QR skaner
- **Holat**: `/attendance` sahifasida faol sessiya aniqlanmagan taqdirda kod kiritish maydoni butunlay yashirinib, o'quvchida hech narsa ko'rinmayotgan edi; shuningdek kamera orqali QR skanerlash imkoniyati yo'q edi.
- **Qaror**:
  1. **Doimiy interaktiv panel**: O'quvchi sahifasida 6 xonali kod (`OTPInput`) kiritish har doim ochiq bo'ladi.
  2. **Kamera QR Skaneri (`html5-qrcode`)**: "QR Skaner" orqali kamera ochiladi, proyektor ekranidagi QR belgini real vaqtda o'qiydi (yoki rasm yuklash orqali ham ishlaydi).
  3. **Universal token/kod tekshiruvi**: Serverda `markAttendanceAction` kiritilgan kod yoki skaner qilingan token orqali to'g'ridan-to'g'ri faol sessiyani topadi va talabaning guruhidan qat'i nazar davomatni adolatli qayd etadi.
  4. **Profilga tezkor havola**: O'quvchi profilida (`/profile`) dars davomatiga to'g'ridan-to'g'ri o'tuvchi tezkor karta qo'shildi.
