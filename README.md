# ITXiva — O'quv Platformasi (LMS)

Muhammad al-Xorazmiy vorislari dasturi (Xiva, Xorazm) doirasidagi 5 ta guruh (2×8-sinf, 2×9-sinf, 1×11-sinf) uchun mo'ljallangan ixtisoslashtirilgan o'quv platformasi.

Domen: **itxiva.uz**

---

## 1. Texnologik stek

- **Frontend & Backend**: Next.js 16 (App Router), TypeScript (strict mode), Tailwind CSS v4, shadcn/ui, `motion/react`.
- **Ma'lumotlar bazasi**: MongoDB Atlas (Mongoose ORM).
- **Fayllar ombori**: Cloudflare R2 (Private bucket, AWS SDK v3 S3 presigned URL).
- **Autentifikatsiya**: `bcryptjs` (parollarni xeshlash) + `jose` (JWT cookie: `httpOnly`, `secure`, `sameSite=lax`, 14 kunlik sessiya).
- **Validatsiya**: Zod.
- **Dizayn**: Mobile-first (360px+ moslashuvchan), Xiva firuza (`#14B8A6`) → chuqur ko'k (`#2563EB`) gradient, iliq oltin/amber (`#F59E0B`) urg'u, yorug' va qorong'i rejim.

---

## 2. Loyihani mahalliydan ishga tushirish

### 1-qadam. Muhit o'zgaruvchilarini sozlash
`.env.example` faylidan nusxa olib `.env.local` yarating va kerakli qiymatlarni kiriting:

```bash
cp .env.example .env.local
```

`.env.local` tarkibi:
```env
MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/itxiva?retryWrites=true&w=majority
JWT_SECRET=bu_yerga_kamida_32_belgili_maxfiy_satr_yozing_123456789
R2_ACCESS_KEY_ID=sizning_r2_access_key
R2_SECRET_ACCESS_KEY=sizning_r2_secret_key
R2_ACCOUNT_ID=5f9109839719d5cf37ba7f8c35a7f19c
R2_BUCKET_NAME=itxivas3
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 2-qadam. Paketlarni o'rnatish va dev serverni ishga tushirish

```bash
npm install
npm run dev
```

Brauzerda: `http://localhost:3000` ochiladi.

---

## 3. Test ma'lumotlarini bazaga yuklash (Seed)

Test guruhlari (8-A, 8-B, 9-A, 9-B, 11-A), mentor akkaunti va sinov o'quvchilarini yaratish uchun quyidagi buyruqni bering:

```bash
npx tsx scripts/seed.ts
```

> **Eslatma:** Tasodifiy parollar konsolda faqat bir marta jadval ko'rinishida chiqariladi.

---

## 4. Cloudflare R2 CORS sozlamasi

Brauzerdan fayllarni to'g'ridan-to'g'ri `PUT` orqali R2 bucketiga yuklash uchun Cloudflare Dashboard'da quyidagi CORS qoidasini qo'llang:

**Cloudflare Dashboard → R2 Object Storage → `itxivas3` bucket → Settings → CORS Policy:**

```json
[
  {
    "AllowedOrigins": [
      "https://itxiva.uz",
      "https://www.itxiva.uz",
      "http://localhost:3000"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "HEAD"
    ],
    "AllowedHeaders": [
      "Content-Type",
      "Authorization"
    ],
    "ExposeHeaders": [
      "ETag"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

---

## 5. Vercel'ga joylash (Production Deploy)

1. Loyihani GitHub reposingizga push qiling.
2. [Vercel Dashboard](https://vercel.com) da loyihani import qiling.
3. **Environment Variables** bo'limiga `.env.local` dagi barcha qiymatlarni kiriting (`MONGODB_URI`, `JWT_SECRET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, `R2_BUCKET_NAME`, `NEXT_PUBLIC_APP_URL`).
4. **Deploy** tugmasini bosing.

---

## 6. Shaxsiy ma'lumotlar xavfsizligi va qonunchilik eslatmasi

> [!IMPORTANT]
> O'zbekiston Respublikasining "Shaxsga doir ma'lumotlar to'g'risida"gi Qonuni (O'RQ-547) 27-1-moddasi talablariga muvofiq, O'zbekiston fuqarolarining shaxsga doir ma'lumotlari jismonan O'zbekiston hududida joylashgan ma'lumotlar bazalarida saqlanishi belgilangan.
> Loyihada faqat zarur minimal ma'lumotlar (ism, guruh, login) saqlanadi; telefon raqam yoki boshqa ortiqcha shaxsiy ma'lumotlar so'ralmaydi va saqlanmaydi. Ishlab chiqarish (production) serverlari va bazasini tanlashda milliy qonunchilik talablariga rioya etilishiga e'tibor qaratilishi zarur.
