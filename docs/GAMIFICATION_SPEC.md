# ITXiva — Gamifikatsiya: topshiriqlar, darajalar, nishonlar, sertifikat tekshiruvi, coin iqtisodiyoti

> **Qanday ishlatish:** `itxiva-dizayn.zip` ni loyiha ildizida `docs/design/` papkasiga oching. Shu faylni `docs/GAMIFICATION_SPEC.md` qilib saqlang. Claude Code'ni loyiha papkasida oching va quyidagi "PROMPT" qismini bering.

---

## PROMPT

Sen ITXiva platformasining (itxiva.uz) yetakchi full-stack muhandisisan. Platforma ishlab turibdi: ~75 ta haqiqiy o'quvchi (5 guruh: 8.2, 8.10, 9.2, 9.3, 11.1), ko'pchiligi voyaga yetmagan. Endi unga **gamifikatsiya** qo'shamiz. To'liq talablar shu faylning pastki qismida, dizaynlar esa `docs/design/` dagi 11 ta HTML faylda.

### 0. Ishlash tartibi (majburiy)
1. **Avval kodni o'rgan, keyin yoz.** `CLAUDE.md` / `AGENTS.md` ni o'qi. Mavjud tuzilmani top va menga qisqa xarita ber: coin tranzaksiyalari (ledger) modeli va berish funksiyasi, reyting hisoblanishi, do'kon/buyurtma, davomat (QR), testlar/imtihonlar, uy vazifalari, Telegram bildirishnomalar va ularning sozlamalari, audit jurnali ("Amallar tarixi"), R2 fayl yuklash, platforma sozlamalari (asosiy rang tanlash), auth/rol tekshiruvi, cron.
2. Next.js bu versiyada farqlar bo'lishi mumkin: kod yozishdan oldin `node_modules/next/dist/docs/` dagi tegishli qo'llanmani o'qi.
3. **Plan mode'da reja tuz va menga ko'rsat:** yangi modellar, mavjud modellarga o'zgarishlar, marshrutlar, komponentlar, migratsiya, bosqichlar. Mavjud funksiyani qayta yozish o'rniga kengaytir. **Tasdiqlaganimdan keyin** savol bermasdan oxirigacha bajar. Noaniq joyda eng mantiqiy variantni tanla va `docs/DECISIONS.md` ga yoz.
4. Alohida branch: `feature/gamification`. Har bosqich oxirida `lint`, `tsc --noEmit`, testlar va `build` o'tsin, keyin commit. `main` ga push qilma va deploy qilma.
5. **Production xavfsizligi:** production bazasiga ulanma va unda skript ishga tushirma. `.env*` fayllarini o'qima va chiqarma. Ma'lumot o'chiradigan migratsiya yozma. Barcha o'zgarishlar orqaga mos bo'lsin.
6. Butun funksiya **sozlamadagi bitta kalit** (`gamification.enabled`) bilan yoqiladi. U o'chiq bo'lsa, platforma hozirgidek ishlaydi.

### 1. Dizayn
- `docs/design/` dagi fayllar: `01–04` o'quvchi telefonda, `05–07` o'quvchi kompyuterda, `08–11` mentor kompyuterda. Ularni brauzerda ochib, aniq shu ko'rinishni qur.
- **Hozirgi dizayn tizimidan** foydalan: mavjud komponentlar, shriftlar, kartalar. Mockupdagi `#4F46E5` va uning och/to'q variantlari o'rniga platformadagi **asosiy rang sozlamasi** (CSS o'zgaruvchilari) ishlatilsin.
- O'quvchi sahifalari bitta responsive sahifa: telefonda (<768px) pastki menyu, kompyuterda yon menyu.
- Yorug' va qorong'i rejim, skeleton/loading holatlari, bo'sh holatlar, 44px touch target, klaviatura bilan boshqarish, `prefers-reduced-motion`.
- Animatsiyalar me'yorida: coin count-up, daraja oshganda modal va konfetti, progress bar to'lishi.
- Mockupdagi ismlar va raqamlar namuna. Hammasi bazadan olinadi.

---

## TALABLAR

### A. Asosiy tushunchalar
- **Coin (balans)** — sarflanadigan pul. Do'kon xaridi kamaytiradi.
- **XP (tajriba)** — hech qachon sarflanmaydi. Daraja va reyting XP bo'yicha hisoblanadi. **Do'kon xaridi XP ni kamaytirmaydi.**
- Ledger yozuvi `coin` va `xp` ni alohida saqlaydi. Mavjud ledger kengaytiriladi, yangi parallel tizim qurilmaydi.
  - Mukofot: coin + xp (odatda teng).
  - Xarid: coin manfiy, xp = 0.
  - Mentor jarimasi: coin manfiy. XP ni kamaytirish ixtiyoriy belgi orqali.
  - Bekor qilingan mukofot (masalan, soxta sertifikat aniqlansa): coin ham, xp ham qaytariladi.
- **Backfill:** mavjud o'quvchilarning XP si ledger'dagi musbat daromadlardan hisoblanadi. Skript idempotent bo'lsin, `--dry-run` rejimi bilan. Uni men o'zim zaxira nusxadan keyin ishga tushiraman.

### B. Darajalar
- 10 daraja, XP chegaralari sozlamadan o'zgartiriladi: 1 Shogird 0 · 2 Izlanuvchi 100 · 3 Kodchi 250 · 4 Quruvchi 500 · 5 Dasturchi 900 · 6 Muhandis 1400 · 7 Arxitektor 2000 · 8 Algoritmchi 2800 · 9 Ustoz 3800 · 10 Xorazmiy vorisi 5000.
- Daraja oshganda sozlamadagi miqdorda bonus coin beriladi (standart 50). Har daraja uchun faqat bir marta, idempotent.
- O'quvchi keyingi kirishida `04` modali chiqadi (bir marta ko'rsatiladi) va Telegram xabar boradi.

### C. Topshiriqlar (Quest)
Mentor yaratadi (`08`, `09`). Maydonlar:
- nom, tavsif, qiyinlik (oson/o'rta/qiyin)
- **tekshirish turi:**
  - `auto`: tizim shartni o'zi tekshiradi. Shartlar: bugun N ta test, N kunlik kirish seriyasi, oy davomida to'liq davomat, N ta material ochish, guruh chellenji.
  - `mentor`: o'quvchi ish yuboradi (havola, fayl, matn).
  - `proof`: sertifikat yoki natija, dalil bilan.
  - `competition`: haftalik masala, 1–3-o'rinlar uchun alohida mukofot.
- dalil talablari: havola (majburiy yoki ixtiyoriy), fayl (PDF/JPG/PNG ≤10 MB), sertifikat ID, qisqa izoh
- himoya: takroriy havola yoki ID ni bloklash, sana o'quvchi qo'shilgan kundan keyin bo'lishi, oylik limit (masalan 3)
- mukofot: belgilangan coin yoki oraliq (min–max; aniq miqdorni mentor tasdiqlashda tanlaydi); XP = coin yoki alohida
- auditoriya: guruhlar yoki sinflar; takrorlanish: bir martalik / kunlik / haftalik / cheksiz
- boshlanish va tugash sanasi, faol/arxiv, qoralama/e'lon
- Telegram: e'lon qilinganda guruhlarga xabar, yangi dalil kelganda mentorga xabar
- Mentor sahifasida 4 ta shablon bo'lsin: Kurs sertifikati, Loyiha topshirish, Kunlik odat, Guruh chellenji.

### D. Yuborishlar va tekshiruv navbati (`02`, `06`, `10`)
- `QuestSubmission`: holat `pending | approved | rejected`, dalil maydonlari, tizim tekshiruvi natijalari, mentor checklisti, berilgan coin/xp, rad etish sababi, kim va qachon tekshirgan.
- **Sertifikat reyestri:** tasdiqlangan sertifikatlar alohida kolleksiyada saqlanadi, normallashtirilgan URL va ID bo'yicha **unique index** bilan. Yuborishda reyestr va kutilayotgan yuborishlar bilan solishtiriladi.
- **Tashqi havolani server tomonda ochma yoki yuklab olma** (SSRF xavfi). Faqat `https` URL qabul qilinadi va normallashtiriladi. Tekshiruv sahifasida mentor havolani yangi oynada o'zi ochadi.
- Tizim tekshiruvi (avtomatik ko'rsatiladi): havola/ID takrorlanmagan, sana qo'shilgan kundan keyin, oylik limit.
- Mentor checklisti: ism mos, kurs mos, sana mos, dasturga tegishli.
- Tasdiqlash **atomik** bo'lsin: holat faqat `pending → approved` o'tadi (shartli update). Ledger yozuvi va reyestr bir tranzaksiyada. Ikki marta bosish ikki marta coin bermaydi.
- Rad etish sabablari tayyor ro'yxatda va qo'lda yoziladi. O'quvchi qayta yubora oladi.
- Navbatda filtr (turi bo'yicha), eng eskisi belgilangan, J/K bilan keyingi/oldingi, A tasdiqlash, R rad etish (faqat input fokusda bo'lmaganda).
- Har bir tasdiq, rad etish va bekor qilish audit jurnaliga yoziladi. Natija o'quvchiga Telegram orqali boradi.
- Yuborishga rate limit: o'quvchi uchun daqiqasiga cheklov.

### E. Avtomatik qismlar
- **Kunlik topshiriqlar** (`01`, `05`): "10 ta test", "1 ta material o'qish", "platformaga kirish". Mavjud kunlik kirish coini **ikki marta berilmasin**, faqat shu ro'yxatda ko'rsatiladi. Material ochilishi uchun voqea (view event) yoziladi.
- **Anti-farming:** testdan coin har savol uchun faqat birinchi to'g'ri javobga beriladi. Testdan kunlik coin chegarasi sozlamada (standart 20).
- **Seriya (streak):** ketma-ket kirilgan kunlar, **Asia/Tashkent** vaqt zonasida. "Himoya" do'kondan sotib olinadi (standart 30 coin) va o'tkazib yuborilgan bir kunni avtomatik yopadi.
- **Marralar va nishonlar:** bosqichli (bronza/kumush/oltin, masalan 50/150/300 test), har bosqichga coin. `StudentBadge` unique (o'quvchi + nishon + bosqich).
- **Haftalik masala:** birinchi 3 ta to'g'ri yechim o'rin oladi (tasdiq vaqti bo'yicha). Hafta oxirida natija e'lon qilinadi.
- **Guruh chellenji:** oy oxirida guruh davomati maqsadga (90%) yetsa, har a'zoga bonus. Hisoblash cron orqali va idempotent.
- Cron vazifalari Vercel Cron bilan: kunlik reset, haftalik va oylik yakunlar. Endpointlar maxfiy token bilan himoyalanadi.

### F. Coin iqtisodiyoti (`11`, mentor → Hisobotlar)
- Tanlangan davrda (7/30/90 kun) berilgan coin manbalar bo'yicha (ledger turi bo'yicha agregatsiya), o'quvchi boshiga oylik o'rtacha, sarflangan, eng ko'p yig'gan.
- **Ogohlantirish:** o'rtacha o'quvchi eng arzon mahsulotga 3 oydan ko'p yig'sa, qizil banner chiqadi.
- Har mahsulot uchun yetish vaqti: `narx / o'rtacha oylik daromad`, hozirgi va maqsadli sur'atda.
- Maqsadli reja: oylik maqsad slider bilan (standart 200), manbalar bo'yicha taqsimot.
- Inflyatsiyaga qarshi sozlamalar: testdan kunlik chegara, faqat birinchi to'g'ri javob, mentor bonusining maksimumi, daraja bonusi.
- Do'konda "imtiyoz" turi qo'shilsin (material bo'lmagan mukofotlar: mentor bilan 1:1, loyihani proyektorda ko'rsatish va h.k.).

### G. Sahifalar
- **O'quvchi:** Topshiriqlar (`01`/`05`), dalil yuborish (`02`/`06`, barcha `proof` va `mentor` turlari uchun umumiy forma), Yutuqlarim (`03`/`07`: daraja, nishonlar, o'qish yo'li, yuborishlar tarixi), global daraja modali (`04`). Yon va pastki menyuga "Topshiriqlar" va "Yutuqlarim" qo'shiladi, yon menyu pastida mini daraja paneli.
- **Mentor:** Topshiriqlar ro'yxati (`08`), yaratish va tahrirlash (`09`), Tekshiruv navbati (`10`), Hisobotlar → Coin iqtisodiyoti (`11`). Yon menyuda "Topshiriqlar" kutilayotgan yuborishlar soni bilan.
- Reyting XP bo'yicha hisoblanadi. Mavjud ko'rinishlar (umumiy, guruh, sinf, hafta yulduzlari) saqlanadi.
- Telegram sozlamalari ro'yxatiga yangi xabar turlari qo'shiladi: topshiriq natijasi, yangi daraja, yangi topshiriq, haftalik natija.

### H. Xavfsizlik
- Har bir server action va API'da autentifikatsiya → rol → guruh tekshiruvi. O'quvchi faqat o'z guruhi yoki sinfiga tegishli faol topshiriqni ko'radi va yuboradi.
- zod validatsiya, fayl turi va hajmi server tomonda tekshiriladi, mavjud R2 presigned oqimi ishlatiladi. Sertifikat fayllarini faqat egasi va mentor ko'radi.
- Coin bilan bog'liq hamma narsa transaction ichida va idempotent. Manfiy balansga tushish bloklanadi.
- AI'ga yoki tashqi xizmatlarga o'quvchining shaxsiy ma'lumoti yuborilmaydi.

### I. Testlar
Kamida unit testlar yozilsin:
- daraja hisoblash va chegaralar
- seriya (Toshkent yarim tuni atrofida)
- daraja bonusining bir martaligi
- ikki marta tasdiqlashda coin bir marta berilishi
- sertifikat takrorlanishi
- oylik limit
- testdan kunlik coin chegarasi
- guruh chellenji to'lovining idempotentligi
- backfill dry-run

### J. Bosqichlar (har biri alohida commit)
1. Ma'lumotlar modeli, XP, darajalar, backfill skripti (dry-run), daraja ko'rinishi va modal
2. Topshiriqlar CRUD (mentor) va o'quvchi Topshiriqlar sahifasi, kunlik avtomatik topshiriqlar
3. Dalil yuborish, tekshiruv navbati, sertifikat reyestri, Telegram
4. Seriya, marralar va nishonlar, haftalik masala, guruh chellenji, cron
5. Coin iqtisodiyoti sahifasi va sozlamalari, do'konda imtiyozlar
6. Sayqal: responsive, skeleton, animatsiya, accessibility, qorong'i rejim, testlar

### K. Yakunda menga ber
- nima qilindi va nima qolgani, `DECISIONS.md` xulosasi
- yangi env o'zgaruvchilari va `vercel.json` cron sozlamasi
- production'ga chiqarish ketma-ketligi: zaxira nusxa → migratsiya → backfill dry-run → backfill → `gamification.enabled` ni yoqish
- qo'lda tekshirish ro'yxati: mentor va o'quvchi sifatida, telefon va kompyuterda
