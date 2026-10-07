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

### [2026-10-05] 13-qaror: Proyektor ekrani — setState-in-render va Router yangilanishi xatosi bartaraf etildi
- **Holat**: `ProjectorScreen`da 180 soniyalik teskari hisoblagich nolga tushganda, `setSecondsLeft((prev) => { rotateCode(); ... })` orqali Server Action render jarayonida chaqirilgan va bu `Cannot update a component ('Router') while rendering a different component ('ProjectorScreen')` xatosini keltirib chiqarayotgan edi. Shuningdek `getAttendanceSessionForProjector` o'qish funksiyasi ichida mutatsiya chaqirilgan edi.
- **Qaror**:
  1. **Toza taymer**: 1 soniyalik interval faqat sof raqamni kamaytiradi (`prev - 1`), hech qanday nojo'ya ta'sirsiz.
  2. **Effect orqali rotatsiya**: Taymer 0 ga yetganda alohida `useEffect` render to'liq yakunlangandan so'ng xavfsiz tarzda `rotateCode()`ni ishga tushiradi (`isRotatingRef` orqali takroriy chaqiruvlardan himoyalangan).
  3. **O'qish so'rovi tozaligi**: `getAttendanceSessionForProjector` funksiyasidan nojo'ya mutatsiya chaqiruvi olib tashlandi.

### [2026-10-05] 14-qaror: Darslar boshqaruvi — Chorak tanlash selectga o'zgartirildi
- **Holat**: `/mentor/lessons` sahifasida guruh tablari va chorak tablari (1, 2, 3, 4) yonma-yon turib, gorizontal bo'shliqni to'ldirib yuborayotgan va guruh nomlari qisqarib ketayotgan edi.
- **Qaror**:
  1. Chorak tanlash 4 ta tab o'rniga ixcham `<select>` ga o'zgartirildi (`1-chorak`, `2-chorak`, `3-chorak`, `4-chorak`).
  2. Sukut bo'yicha (default) qiymati `1` (`1-chorak`) etib belgilandi.
  3. Guruhlar ro'yxatiga ko'proq joy ajratilib, mobil va planshetlarda aylantirish osonlashdi.

### [2026-10-06] 15-qaror: Guruh dars jadvali
- **Holat**: Har bir guruh haftada 3 kun, 1 soat 30 daqiqadan dars o'tadi (toq yoki juft kunlar).
- **Qaror**: `Group.schedule = { days (1=Dushanba), startTime, endTime }`. Barcha sana hisob-kitoblari `src/lib/schedule.ts` da `Asia/Tashkent` bo'yicha. Davomat sahifasida "Bugungi darslar" va o'quvchida "Keyingi dars" shu jadvaldan chiqadi.

### [2026-10-06] 16-qaror: Excel import — mavjud o'quvchilar paroliga tegilmaydi
- **Holat**: Yil boshida ro'yxat Excel'da keladi; o'quvchilar allaqachon o'z parolini qo'ygan.
- **Qaror**: `/mentor/import` fayl brauzerda o'qiladi (JSHSHIR/pasport serverga ketmaydi), avval ko'rib chiqish (mos keldi / guruhi o'zgaradi / yangi / shubhali), keyin tasdiqlash. Mavjud o'quvchida faqat `groupId` yoziladi. O'quvchining guruhi endi har so'rovda bazadan olinadi (`getCurrentUser`), shuning uchun ko'chirish darhol kuchga kiradi.

### [2026-10-06] 17-qaror: Login/parollarni eksport qilish
- **Holat**: Mentor guruh login-parollarini fayl qilib olmoqchi, lekin parollar bcrypt xesh sifatida saqlanadi.
- **Qaror**: Mentor bergan vaqtinchalik parol AES-256-GCM bilan shifrlab saqlanadi (`User.tempPasswordEnc`) va o'quvchi parolini o'zgartirganda o'chiriladi. Eksport (guruh sahifasi pastidagi yashirin tugma) mentor parolini qayta so'raydi, audit logga yoziladi. O'quvchi o'zi qo'ygan parol hech qachon ko'rsatilmaydi.

### [2026-10-06] 18-qaror: Davomat — dars kesimida ko'rish
- **Qaror**: Yakunlangan sessiya sahifasi guruhning to'liq ro'yxatini ko'rsatadi (4 holat, bir bosishda o'zgartirish); oylik jurnal matritsasi; QR ochilmagan dars uchun qo'lda sessiya. O'quvchi faqat o'z guruhi sessiyasida belgilana oladi (12-qarordagi "guruhdan qat'i nazar" qoidasi bekor qilindi — jurnal aralashib ketardi). "Kechikkan" ham coin oladi; sababli qoldirilgan dars foizga kirmaydi.

### [2026-10-06] 19-qaror: Coin do'koni va buyurtmalar
- **Qaror**: `Product` va `Order` modellari. Holatlar: `pending → accepted → handed_over → received`, `rejected`/`cancelled` da coin va zaxira qaytadi. Coin buyurtma paytida atomik yechiladi (`spendableBalance >= price` sharti bilan bitta so'rovda); reytingdagi `totalCoins` kamaymaydi.

### [2026-10-06] 20-qaror: Hisobotlar
- **Qaror**: `/mentor/reports` — davr va guruh filtri URL'da; davomat, test/imtihon, coin va do'kon bo'limlari, har birida CSV. `/mentor/reports/students/[id]` — bitta o'quvchi kartasi.

### [2026-10-06] 21-qaror: AI yordamchi (Claude API)
- **Qaror**: `@anthropic-ai/sdk`, model `claude-opus-5-5`, tuzilgan javob (Zod) bilan. Dars matni, konspektni yaxshilash, test savollari, taqdimot (`pptxgenjs`) va konspekt (`docx`). Natija hech qachon avtomatik saqlanmaydi — mentor tasdiqlaydi. `ANTHROPIC_API_KEY` bo'lmasa panel o'chiq.

### [2026-10-06] 22-qaror: Yuklanish holatlari
- **Qaror**: Barcha sahifalarda `loading.tsx` skeletonlari (haqiqiy maket o'lchamida), `(dashboard)/template.tsx` + `.page-stage` orqali skeleton va kontent yumshoq paydo bo'ladi, nav havolalarida `useLinkStatus` indikatori.

### [2026-10-07] 23-qaror: AI provayderi — Gemini (bepul tarif)
- **Qaror**: Asosiy provayder Gemini: `gemini-3.8-flash`, band bo'lsa `gemini-flash-latest`, so'ng `gemini-flash-lite-latest` (band model 3 daqiqa o'tkazib yuboriladi). SDK'siz, REST orqali; javob o'sha Zod sxemasi bilan tekshiriladi. Pro modellar bepul tarifda yo'q.
- **Zaxira**: `ANTHROPIC_API_KEY` bo'lsa, Gemini javob bera olmaganda Claude sinaladi (balans/kalit xatosidan keyin 10 daqiqa o'tkazib yuboriladi).

### [2026-10-07] 24-qaror: Uyga vazifa
- **Qaror**: Vazifa darsning ichki maydoni (`Lesson.homework`: matn, biriktirma fayllar, muddat, coin); javoblar alohida `HomeworkSubmission` (bitta darsga bitta o'quvchidan bitta hujjat, qayta yuborish shu hujjatni yangilaydi). Javob — matn/kod, havolalar va fayllar birga bo'lishi mumkin.
- **Muddat**: sukut bo'yicha guruh jadvalidagi keyingi dars boshlanishi; muddatdan keyin ham qabul qilinadi, lekin `isLate` belgilanadi va coin taklifi 0 bo'ladi (mentor o'zgartira oladi).
- **Baholash**: 0–100 ball + izoh + coin (ballga mutanosib taklif). Qayta baholashda faqat farq `CoinLedger`ga (`homework`) yoziladi. "Qayta ishlashga qaytarish" faqat baholanmagan javob uchun.
- **Fayllar**: `homework/{lessonId}/{userId}/...` kaliti bilan R2'ga; har biri 50 MB gacha, 5 tagacha, bajariladigan fayllar rad etiladi. Havola faqat mentor yoki javob egasiga beriladi.

### [2026-10-07] 25-qaror: Bitta dars — bir nechta guruh (bog'langan nusxalar)
- **Qaror**: Dars bitta hujjat bo'lib bir nechta guruhga ulanmaydi; har bir guruhda o'z nusxasi yaratiladi va nusxalar `Lesson.linkId` bilan bog'lanadi.
- **Birga yangilanadi**: sarlavha, qisqa mavzu, konspekt, materiallar, uyga vazifa (yoqilgani, matni, biriktirmalari, coin) va test (savollar o'z `_id`lari bilan).
- **Har guruhda alohida**: sana (guruh jadvaliga moslanadi), chorak ichidagi tartib, nashr holati, vazifa muddati, o'quvchilarning javoblari, baholari va test natijalari.
- **Sabab**: guruhlarning dars kunlari har xil, javoblar esa darsga bog'langan — bitta umumiy hujjatda sana/muddat/nashr holatini guruh kesimida yuritish barcha so'rovlarni murakkablashtirardi; oddiy nusxa esa tahrirda ikki joyni qo'lda tuzatishni talab qilardi.
- **Chiqish yo'li**: "Bog'lanishni uzish" darsni mustaqil qiladi (hech narsa o'chmaydi).

### [2026-10-07] 26-qaror: Telegram bildirishnomalari
- **Ulash**: profilda bir martalik token (10 daqiqa, bazada faqat SHA-256 xeshi) → `t.me/<bot>?start=<token>` → webhook chatni hisobga bog'laydi; sayt holatni 3 soniyada bir so'raydi. Bitta chat — bitta hisob.
- **Webhook**: `/api/telegram/webhook`, `X-Telegram-Bot-Api-Secret-Token` bilan himoyalangan, faqat shaxsiy chat. Buyruqlar: `/start`, `/help`, `/status`, `/stop`. O'rnatish: `scripts/telegram-webhook.mjs`.
- **Yuborish**: yagona modul `lib/notifications/notify.ts` (`notify`, `notifyMany`, `notifyGroup`, `notifyAllStudents`, `notifyMentors`). Javobdan keyin (`after`) yuboriladi — so'rovni bloklamaydi. 25 tadan batch, 403 da chat avtomatik uziladi. Har tur profilda yoqiladi/o'chiriladi.
- **Vaqtga bog'liq**: `/api/cron/daily` (Vercel Cron, 09:00 Toshkent, `CRON_SECRET`) — muddati 24 soat ichida tugaydigan vazifalar eslatmasi va yakunlangan imtihon statistikasi. Imtihonni hamma topshirib bo'lsa, statistika kutmasdan ketadi.

### [2026-10-07] 27-qaror: Design system, navigatsiya va tezlik
- **Tokenlar**: neytral "dev tool" palitrasi va firuza accent Tailwind `@theme` tokenlari sifatida (`globals.css`); qotirilgan ranglar tokenlarga almashtirilgan. Yorug' fonda ikkinchi darajali matn `slate-500`, qorong'ida `slate-400` (WCAG AA).
- **Shrift**: Geist Sans (UI) va JetBrains Mono (`h1`, yirik raqamlar, coin, kod) — `next/font`, faqat lotin to'plami oldindan yuklanadi.
- **Logo**: kod qavslari orasidagi minora (`components/layout/logo.tsx`); barcha rastr ikonkalar `scripts/generate-icons.mjs` bilan generatsiya qilinadi.
- **Navigatsiya**: `/` — rolga qarab dashboard; desktop sidebar yig'iladi (holati cookie'da); `Ctrl+K` palitra birinchi ochilganda yuklanadi.
- **Tezlik**: og'ir kutubxonalar (konfetti, QR skaner, palitra) kerak bo'lganda yuklanadi. Animatsiyalar faqat `transform`/`opacity`, `prefers-reduced-motion` da o'chadi.
- **Xavfsizlik**: CSP (skript va freymlar faqat o'zimizdan + YouTube), `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` (kamera faqat o'zimizga), HSTS.
- **Testlar**: `npm test` — vitest + xotiradagi MongoDB (auth, do'kon, vazifa, Telegram).

### [2026-10-07] 28-qaror: Dars eslatmasi (bir soat oldin)
- **Nima**: guruh jadvali bo'yicha dars boshlanishiga ~1 soat qolganda shu guruh o'quvchilariga va mentorlarga Telegram xabari (`lesson_reminder`). Profilda o'chiriladi, sukut bo'yicha yoniq.
- **Qachon**: `/api/cron/reminders` har 5 daqiqada chaqiriladi; eslatma dars boshlanishiga 65–10 daqiqa qolgan oraliqda, har guruhga kuniga bir marta ketadi (`Group.lessonReminderSentFor`). Oraliq kechikkan chaqiruvni ham qamrab oladi.
- **Kim chaqiradi**: GitHub Actions (`.github/workflows/lesson-reminders.yml`, `CRON_SECRET` repo secret'i) — Vercel'ning bepul tarifida cron kuniga bir martadan ortiq ishlamaydi. GitHub jadvali bir necha daqiqaga kechikishi mumkin.
