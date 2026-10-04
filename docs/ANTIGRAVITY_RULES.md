# ITXiva — loyiha qoidalari (Antigravity Workspace Rule)

Bu qoidalar har bir vazifada doim amal qilinadi.

## Loyiha
- ITXiva: mentor Abbos uchun o'quv platformasi (LMS), ~75 o'quvchi, 5 guruh (2×8-sinf, 2×9-sinf, 1×11-sinf). Domen: itxiva.uz.
- To'liq talablar `docs/SPEC.md` faylida. Har yangi vazifadan oldin tegishli bo'limni o'qi.
- Interfeys tili: o'zbek (lotin). Kod, o'zgaruvchi va commit xabarlari: ingliz tili.

## Stek
- Next.js (App Router) + TypeScript (strict) + Tailwind CSS, shadcn/ui, lucide-react, Motion (`motion/react`).
- MongoDB Atlas (Mongoose), Cloudflare R2 (presigned URL), zod, jose (JWT cookie), bcryptjs.
- Next.js'ning bu versiyasida eski bilimlardan farqlar bor: kod yozishdan oldin `node_modules/next/dist/docs/` dagi tegishli qo'llanmani o'qi (`params`, `cookies()` asinxron; `middleware` o'rniga `proxy` va h.k.).

## Xavfsizlik (buzilmasin)
- `.env`, `.env.local` fayllarini **o'qima, chiqarma, commit qilma, logga yozma**. Maxfiy qiymat so'rama: `.env.example`ga faqat bo'sh nomlarni yoz, haqiqiy qiymatlarni foydalanuvchi o'zi kiritadi.
- Har bir server action, API route va sahifada: autentifikatsiya → rol → guruh egaligi tekshiruvi. O'quvchi boshqa guruh yoki boshqa o'quvchi ma'lumotini ko'ra olmasin.
- Kirish ma'lumotlari zod bilan tekshiriladi. Parollar bcrypt. Cookie: httpOnly, secure, sameSite=lax.
- Foydalanuvchilar asosan voyaga yetmagan: keraksiz shaxsiy ma'lumot so'ralmasin va saqlanmasin.
- AI chaqiruvlariga o'quvchi ismi/logini yuborilmasin.
- Terminalda xavfli buyruqlar (`rm -rf`, bazani tozalash, `git push --force`) ishlatma; kerak bo'lsa avval so'ra.

## Sifat
- Server Components default; `"use client"` faqat kerak joyda.
- Har sahifada `loading.tsx` / Suspense + skeleton. Rasmlar `next/image`, YouTube — facade (bosilganda yuklanadi).
- Mobil-birinchi (360px dan), yorug' va qorong'i rejim, `prefers-reduced-motion` hurmat qilinadi.
- Har bosqich oxirida `npm run lint`, `npx tsc --noEmit` va `npm run build` xatosiz o'tishi shart.
- Kichik, aniq o'zgarishlar; ishlayotgan kodni keraksiz qayta yozma. Qilgan ishing oxirida qisqa hisobot ber (nima tayyor, nima qolgan, nimani qo'lda sozlash kerak).
