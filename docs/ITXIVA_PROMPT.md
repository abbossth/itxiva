# ITXiva — mentor uchun o'quv platformasi (LMS) — to'liq prompt

Sen tajribali full-stack muhandissan. Quyidagi talablar asosida **ITXiva** nomli veb-platformani qur. Avval loyihaning to'liq rejasini (papka tuzilmasi, ma'lumotlar sxemasi, bosqichlar) yoz va menga ko'rsat, tasdig'imdan keyin 1-bosqichdan boshla. Har bosqichni tugatgach build/typecheck'dan o'tkaz va nima tayyor ekanini qisqa yoz.

## 1. Kontekst
- Men — Abbos, "Muhammad al-Xorazmiy vorislari" dasturida mentorman (Xiva, Xorazm).
- Platforma **faqat mening 5 ta guruhim** uchun: 2 ta 8-sinf, 2 ta 9-sinf, 1 ta 11-sinf (bitiruvchi). Jami ~75 o'quvchi, ko'pchiligi voyaga yetmagan.
- Domen: **itxiva.uz**. Interfeys to'liq **o'zbek tilida** (lotin), mobil telefonda qulay bo'lishi shart (o'quvchilar asosan telefondan kiradi).
- O'quvchilar ro'yxati menda Google Sheets'da bor.

## 2. Texnik stek
- Next.js (App Router, eng so'nggi versiya) + TypeScript + Tailwind CSS.
- **Muhim:** Next.js'ning bu versiyasida eski bilimlardan farqlar bo'lishi mumkin (masalan, `params`/`cookies()` asinxron, `middleware` o'rniga `proxy`). Kod yozishdan oldin `node_modules/next/dist/docs/` ichidagi tegishli qo'llanmalarni o'qi.
- MongoDB Atlas (Mongoose). Hosting: Vercel.
- Fayllar: **Cloudflare R2** (S3 mos), `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`. Bucket **private** bo'lsin (Public Development URL yoqilmaydi, custom domain ham shart emas): yuklash va ko'rish faqat serverda ruxsat tekshirilgandan keyin berilgan qisqa muddatli presigned URL orqali.
  - Account ID: `5f9109839719d5cf37ba7f8c35a7f19c`
  - Bucket: `itxivas3` (joylashuv: Eastern Europe)
  - S3 endpoint: `https://5f9109839719d5cf37ba7f8c35a7f19c.r2.cloudflarestorage.com` (bucket nomi endpoint'ga emas, `Bucket` parametriga beriladi), region: `auto`, `forcePathStyle` kerak bo'lsa yoq.
  - Kalitlar (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`) faqat `.env.local` va Vercel Environment Variables'da turadi; kodga, repoga va promptga **hech qachon** yozilmaydi. `.env.example`da faqat bo'sh nomlar bo'lsin.
  - Brauzerdan to'g'ridan-to'g'ri `PUT` bilan yuklash uchun R2 **CORS Policy** kerak: ruxsat etilgan manbalar `https://itxiva.uz`, `https://www.itxiva.uz`, `http://localhost:3000`; metodlar `GET, PUT, HEAD`; headerlar `Content-Type`. README'da shu sozlamaning tayyor JSON'ini ber.
  - Rasmlar (do'kon mahsuloti, material rasmi) yuklashdan oldin brauzerda siqilsin (WebP, maks. ~1600px); ko'rsatishda kichik preview ishlatilsin.
  - Video uchun YouTube (unlisted) havolasi asosiy yo'l.
- Autentifikatsiya: login + parol (bcrypt), httpOnly cookie ichida JWT (`jose`). Sessiya 14 kun.
- Telegram bot: grammY, webhook rejimida (Vercel).
- AI: Anthropic API (Claude), faqat server tomondan chaqiriladi.
- Rejalashtirilgan vazifalar: Vercel Cron.
- Validatsiya: zod. Barcha server action va API route'larda autentifikatsiya + rol + guruh tekshiruvi bo'lsin.

## 3. Rollar
- **mentor** (men): hamma narsani boshqaraman.
- **student**: faqat o'z guruhi kontentini va o'z ma'lumotlarini ko'radi. Ro'yxatdan o'tish yo'q — akkauntni faqat mentor yaratadi.

## 4. Modullar

### 4.1 Akkaunt va import
- Google Sheets'dan nusxalab joylashtirilgan jadval (yoki CSV) orqali ommaviy import: ism-familiya, guruh.
- Tizim har bir o'quvchiga noyob login va tasodifiy parol yaratadi; parol bcrypt bilan saqlanadi. Yaratilgan login/parollar jadvali **bir marta** ko'rsatiladi va CSV sifatida yuklab olinadi (mentor o'quvchilarga tarqatadi).
- Birinchi kirishda parolni almashtirish majburiy (`mustChangePassword`).
- Mentor parolni qayta tiklay oladi, o'quvchini guruhdan guruhga ko'chira oladi, o'chira oladi.
- Faqat zarur ma'lumot saqlansin (ism, guruh, login). Telefon va boshqa shaxsiy ma'lumot so'ralmasin.

### 4.2 Guruhlar, choraklar, darslar, materiallar
- Guruh → Chorak (1–4) → Dars. Dars: sarlavha, mavzu, tavsif, sana, tartib raqami, "nashr etilgan/qoralama" holati.
- Dars materiallari: fayl (PDF, rasm, DOCX/PPTX/XLSX, ZIP), YouTube video (sahifada joylashtirilgan player), tashqi havola. Fayl hajmi cheklovi (masalan, 100 MB) va ruxsat etilgan turlar ro'yxati bo'lsin.
- O'quvchi faqat o'z guruhining **nashr etilgan** darslarini ko'radi. Fayllarga kirish har safar server tomonda tekshirilgan, qisqa muddatli presigned URL orqali.
- Yangi material/dars uchun "yangi" belgisi.

### 4.3 Dars orasidagi kichik testlar
- Savol turlari: bitta javobli test, ko'p javobli test, qisqa matnli javob, ochiq savol.
- O'quvchi javob yozadi, mentor ko'radi va baholaydi. Test turlari avtomatik tekshiriladi.

### 4.4 Imtihonlar
- Mentor har bir guruh uchun alohida imtihon yaratadi; faqat shu guruh ko'radi.
- Boshlanish va tugash vaqti belgilanadi; vaqtidan oldin ochilmaydi, keyin yopiladi.
- Topshiriq turlari: test, ochiq savol, loyiha fayli yuklash (yoki GitHub havolasi).
- **Taymer serverda** hisoblanadi (brauzer vaqtiga ishonilmaydi). Urinishlar soni cheklanadi. Javoblar vaqti-vaqti bilan avtomatik saqlanadi.
- Test qismi avtomatik baholanadi; ochiq savol va loyihani mentor baholaydi, izoh qoldiradi.
- Natija e'lon qilingach, o'quvchi o'z xatolarini, fayllar bo'yicha izohlarni va ballni ko'radi.

### 4.5 Coin tizimi
- Hamma o'zgarish bitta **tranzaksiyalar jadvalida (ledger)** saqlanadi: o'quvchi, miqdor (+/−), tur, sabab, kim berdi (tizim yoki mentor), vaqt. Tranzaksiya o'chirilmaydi va tahrirlanmaydi; xatoni tuzatish uchun qarshi yozuv qo'shiladi.
- **Balans** (sarflash mumkin bo'lgan) va **reyting balli** ikki alohida narsa: do'kondagi xarajat balansni kamaytiradi, lekin **reytingni tushirmaydi**.
- Avtomatik qo'shish: kuniga **bir marta** kirish uchun (Toshkent vaqti bo'yicha kun, takror berilmaydi — noyob indeks `student + sana`), davomat belgilanganda, imtihon natijasiga qarab.
- Qo'lda: mentor coin qo'shadi yoki ayiradi (sabab majburiy).
- Miqdorlar (kunlik kirish, davomat, imtihon ball→coin koeffitsienti) admin sozlamalarida o'zgartiriladi, kodga qotirilmaydi.

### 4.6 Do'kon
- Mentor mahsulot qo'shadi: nom, rasm, tavsif, narx (coin), soni.
- O'quvchi buyurtma beradi; coin buyurtma vaqtida **band qilinadi** (balans yetarli bo'lishi shart, parallel buyurtmalarda ham manfiyga tushmasligi uchun atomik operatsiya/tranzaksiya ishlat).
- Holatlar: kutilmoqda → tasdiqlandi → topshirildi; rad etilsa coin qaytariladi.
- Mentor buyurtmalar ro'yxatini ko'radi va holatini o'zgartiradi.

### 4.7 Reyting (muhim)
- Reyting **reyting balli** (4.5) asosida hisoblanadi.
- Uch ko'rinish:
  1. **Umumiy reyting** — barcha 75 o'quvchi.
  2. **Guruh bo'yicha** — tanlangan guruh ichida (o'quvchi odatiy holda o'z guruhini ko'radi; mentor istalgan guruhni tanlaydi).
  3. **Sinf bo'yicha** — 8-sinf, 9-sinf, 11-sinf (shu sinfdagi barcha guruhlar birga).
- Davr filtri: butun vaqt / shu oy / shu hafta.
- Ko'rsatish: o'rin, ism, ball, guruh. Teng ball bir xil o'rin oladi. **O'quvchining o'z o'rni doim ajratib ko'rsatiladi** (jadval uzun bo'lsa, top 10 + o'z o'rni).
- **Mentor ham, o'quvchilar ham** o'z akkauntiga kirganda reytingni ko'ra oladi (alohida "Reyting" bo'limi va bosh sahifada qisqa ko'rinish).
- Maxfiylik: o'quvchilarga boshqalarning faqat ismi va familiyasining bosh harfi ko'rsatiladi (masalan, "Ali V."); to'liq ism faqat mentorga. Mentor reytingni butunlay o'chira oladi yoki ma'lum o'quvchini reytingdan yashira oladi.
- Reyting so'rovlari samarali bo'lsin (ledger'dan agregatsiya, kerakli indekslar yoki keshlangan `totalCoins`).

### 4.8 Profil
- O'quvchi profili: balans, reyting balli va o'rni, tranzaksiyalar tarixi, imtihon natijalari (fayllar, xatolar, mentor izohlari), buyurtmalar.

### 4.9 Davomat
- Mentor dars bo'yicha davomat belgilaydi (keldi/kelmadi/sababli). "Keldi" bo'lsa avtomatik coin beriladi (bir dars uchun bir marta).

### 4.10 Telegram bot
- Bog'lash: o'quvchi profilida bir martalik kod oladi, botga yuboradi — shunda akkaunt bog'lanadi.
- Xabarlar: yangi dars/material, imtihon eslatmasi (1 kun va 1 soat oldin), natija chiqdi, coin qo'shildi/ayirildi, buyurtma holati, mentor e'lonlari.
- Har xabarda platformadagi tegishli sahifaga havola. Natija platformada ham ko'rinib turadi.
- Platformadagi bildirishnomalar ro'yxati (qo'ng'iroqcha belgisi) ham bo'lsin.

### 4.11 AI yordamchi (faqat mentor uchun)
- Material yaratish (dars konspekti, mashqlar), test savollari yaratish va tekshirish, ochiq javoblar uchun dastlabki baholash tavsiyasi.
- **Yakuniy bahoni doim mentor tasdiqlaydi**; AI faqat tavsiya beradi.
- AI'ga o'quvchining shaxsiy ma'lumoti (ism, login) **yuborilmaydi** — faqat javob matni.
- API kalit faqat serverda; foydalanish chegaralari va xato holatlari ko'rib chiqilsin.

## 5. Ma'lumotlar sxemasi (taklif; yaxshilashing mumkin)
`User`, `Group`, `Lesson` (materiallar ichida), `Quiz`/`Question`/`Answer`, `Exam`/`ExamQuestion`/`Attempt`/`Submission`, `CoinTransaction`, `CoinRule`, `Product`, `Order`, `Attendance`, `Notification`, `Setting`, `AuditLog`.

## 6. Xavfsizlik va sifat
- Parollar bcrypt; login urinishlariga cheklov (rate limit); cookie `httpOnly`, `secure`, `sameSite=lax`.
- Har bir so'rovda rol va guruh egaligi tekshiriladi (o'quvchi boshqa guruh ma'lumotini ko'ra olmasin — IDOR'dan himoya).
- Barcha kirish ma'lumotlari zod bilan tekshiriladi; fayl yuklashda tur va hajm server tomonda tekshiriladi.
- Mentor amallari (coin, baho, parol tiklash, o'chirish) `AuditLog`ga yoziladi.
- Maxfiy kalitlar faqat `.env` da; `.env.example` va `README.md` (ishga tushirish, deploy, R2 CORS sozlamasi, Telegram webhook o'rnatish) yoz.
- Shaxsiy ma'lumotlarni O'zbekiston qonunchiligi talablariga muvofiq saqlash masalasi hosting tanlashda e'tiborga olinishi kerakligini README'da eslat.

## 7. Dizayn, tezlik va qulaylik (juda muhim — bu yerda kamchilik bo'lmasin)

Maqsad: platforma **tez**, **qulay** va **chiroyli** bo'lsin; o'quvchi telefonda ham "ilova"dek his qilsin.

### 7.1 Tezlik
- Server Components'ni default qil; client component'larni faqat kerak joyda (interaktivlik) ishlat. Og'ir kutubxonalarni `next/dynamic` bilan kechiktirib yukla.
- **Lazy loading:** rasmlar (`next/image` yoki `loading="lazy"` + o'lcham berilgan), YouTube videolar (avval faqat thumbnail "facade", bosilganda iframe yuklanadi), uzun ro'yxatlar (sahifalash yoki cheksiz skroll), pastdagi bo'limlar.
- **Skeleton:** har bir sahifa uchun `loading.tsx` va `Suspense` chegaralari; jadval, karta, reyting, profil uchun alohida skeleton (shimmer animatsiyali), kontent joylashuvi sakramasligi uchun (layout shift yo'q).
- Streaming: sahifaning tez qismi darrov chiqsin, sekin ma'lumotlar (reyting, tarix) keyin oqib kelsin.
- Keshlash: o'zgarmas ma'lumotlarga `cache`/revalidate teglari; reyting kabi og'ir so'rovlar qisqa muddat keshlansin. MongoDB so'rovlariga to'g'ri indekslar, `lean()`, kerakli maydonlarni tanlash (`select`).
- Optimistic UI: coin sarflash, buyurtma, javob saqlash kabi amallarda interfeys darrov javob bersin, xato bo'lsa qaytarilsin.
- `next/font` bilan shrift (kirill/lotin to'liq qo'llab-quvvatlanadigan, masalan Inter yoki Manrope), bundle hajmini nazorat qil, keraksiz kutubxona qo'shma.
- Maqsad: Lighthouse mobil Performance 90+, LCP < 2.5s, CLS ≈ 0.

### 7.2 Vizual uslub
- Zamonaviy, toza, "o'quv platforma" ruhi: yumshoq gradientlar, yumaloq burchaklar (`rounded-2xl`), yengil soyalar, yetarli bo'sh joy, aniq ierarxiya.
- Rang tizimi (CSS o'zgaruvchilari/Tailwind tokenlari bilan, yorug' va qorong'i rejim uchun alohida):
  - Asosiy: Xiva firuza (turquoise) → chuqur ko'k gradient (masalan `#14B8A6` → `#2563EB`),
  - Urg'u: iliq oltin/amber (`#F59E0B`) — coin, yutuq, reyting uchun,
  - Muvaffaqiyat: zumrad (`#10B981`), xato: marjon (`#F43F5E`), ogohlantirish: amber,
  - Fon: yorug'da `#F8FAFC`, qorong'ida `#0B1220`; kartalar uchun ikki daraja sirt rangi.
  - Barcha matn/fon juftligi WCAG AA kontrastiga javob bersin.
- Logotip: Xiva minorasi siluet + "ITXiva" yozuvi (oddiy SVG).
- UI kutubxona: shadcn/ui + Radix (qulaylik/accessibility uchun), ikonlar: lucide-react.
- Mobil-birinchi: pastki navigatsiya paneli (Darslar, Imtihon, Reyting, Do'kon, Profil), katta bosiladigan maydonlar (kamida 44px), mentor uchun desktopda yon panel.
- Har bir bo'sh holat (empty state) uchun chiroyli illyustratsiya/ikonka va yo'naltiruvchi matn; xatolar uchun tushunarli o'zbekcha xabar; toast bildirishnomalar.
- Tugmalarda yuklanish holati (spinner), takroriy bosishdan himoya.

### 7.3 Animatsiyalar (me'yorida, ma'noli)
- Kutubxona: Motion (`motion/react`, ilgari Framer Motion).
- Sahifalar orasida yengil fade/slide o'tish; ro'yxat elementlari ketma-ket (stagger) paydo bo'lishi; kartalarda hover/press effekti.
- **Coin:** balans raqami "sanab" o'zgaradi (count-up), coin qo'shilganda kichik uchib chiqish animatsiyasi va konfetti; kundalik kirish bonusi uchun bayramona karta.
- **Reyting:** top-3 uchun podium animatsiyasi (oltin/kumush/bronza), o'z o'rnimga o'tish tugmasi, o'rin o'zgarganda silliq joy almashish.
- **Imtihon:** taymer progress halqasi; oxirgi daqiqalarda rangi o'zgaradi; topshirilganda muvaffaqiyat animatsiyasi.
- Skeleton'lar uchun shimmer; sahifa yuklanishida ingichka yuqori progress chiziq.
- `prefers-reduced-motion` yoqilgan foydalanuvchilar uchun animatsiyalar o'chirilsin yoki kamaytirilsin.
- Animatsiyalar tezlikka halaqit bermasin (faqat `transform`/`opacity`, 150–400ms).

### 7.4 Qabul qilish mezonlari
- Barcha asosiy sahifalar 360px kenglikdagi telefonda to'liq ishlaydi va chiroyli ko'rinadi.
- Hech bir sahifada bo'sh oq ekran yoki sakrab ketuvchi kontent yo'q (skeleton/loading holatlari bor).
- Yorug' va qorong'i rejimda barcha komponentlar to'g'ri ko'rinadi.
- Klaviatura bilan boshqarish va ekran o'quvchilar uchun asosiy `aria` atributlari qo'yilgan.

## 8. Bosqichlar
1. **Poydevor:** kirish, import, guruhlar, chorak/darslar, materiallar, **reyting sahifasi skeleti** (`totalCoins` bo'yicha, 3 ko'rinish).
2. **Kichik testlar va imtihonlar.**
3. **Coin ledger, davomat, do'kon, reytingni ledger'ga ulash.**
4. **Telegram bot va bildirishnomalar.**
5. **AI yordamchi.**

Har bosqich alohida ishga tushishi va deploy qilinishi mumkin bo'lsin.
