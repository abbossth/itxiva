# Antigravity uchun boshlang'ich prompt (1-bosqich)

> Oldin loyiha papkasiga `docs/SPEC.md` nomi bilan `ITXIVA_PROMPT.md` faylini qo'ying va `ANTIGRAVITY_RULES.md` mazmunini Workspace Rule sifatida qo'shing (qo'llanmada tushuntirilgan). Keyin quyidagini Agent'ga bering.

---

Sen ITXiva loyihasini quruvchi yetakchi full-stack muhandissan.

**Birinchi qadam — o'qi.** `docs/SPEC.md` ni boshidan oxirigacha o'qi va workspace qoidalariga amal qil. Next.js bu versiyada farq qilishi mumkin, shuning uchun `node_modules/next/dist/docs/` dagi kerakli qo'llanmalarni ham o'qi.

**Ikkinchi qadam — reja.** Kod yozishdan oldin *Implementation Plan* va *Task List* artifaktlarini tayyorla: papka tuzilmasi, Mongoose sxemalari, marshrutlar, komponentlar ro'yxati, rang/tipografiya tokenlari. Rejani artifakt sifatida saqla, lekin **tasdiq kutma**: darrov qurishni boshla.

**Avtonom rejim (qat'iy qoida).** Men uxlayman/boshqa ish qilyapman, shuning uchun:
- Menga savol berma va ruxsat so'rama. Noaniq joyda `docs/SPEC.md` dagi eng mantiqiy variantni o'zing tanla va qaroringni `docs/DECISIONS.md` ga bir qatorda yoz (nima tanlandi va nima uchun).
- Xato chiqsa, to'xtama: sababini top, tuzat, qayta sinab ko'r. Bir muammoga 3 urinishdan keyin ham hal bo'lmasa, uni `docs/BLOCKERS.md` ga yoz va keyingi vazifaga o't.
- Faqat ikki holatda to'xta: (1) maxfiy qiymat kerak bo'lib qolsa (parol, kalit, token) — `.env.example` ga nom qo'shib, `docs/BLOCKERS.md` ga yoz va maxfiy qiymat talab qilmaydigan ishlarni davom ettir; (2) qaytarib bo'lmaydigan xavfli amal kerak bo'lsa (ma'lumotlarni o'chirish, `git push --force`, loyiha papkasidan tashqariga yozish).
- Har bir katta qism tugagach `git commit` qil (qisqa inglizcha xabar bilan), shunda biror narsa buzilsa orqaga qaytish mumkin.
- Barcha vazifalar (Task List) bajarilmaguncha va oxirgi tekshiruv (lint, tsc, build, brauzerda sinov) o'tmaguncha ishni tugatma. Oxirida bitta yakuniy hisobot ber: nima tayyor, `DECISIONS.md` va `BLOCKERS.md` xulosasi, qo'lda qilishim kerak bo'lgan ishlar.

**Uchinchi qadam — faqat 1-bosqichni qur** (2–5-bosqichlarga tegma):
1. Loyiha poydevori: Next.js + TS + Tailwind + shadcn/ui, dizayn tokenlari (Xiva firuza→ko'k gradient, oltin urg'u, yorug'/qorong'i rejim), `next/font`, logotip (minora siluet SVG).
2. Kirish: login+parol, JWT cookie, rollar (mentor/student), majburiy parol almashtirish (birinchi kirish), rate limit.
3. Mentor paneli: guruhlar (CRUD), o'quvchilarni Google Sheets'dan nusxalangan jadval/CSV orqali import (login va parollar bir marta ko'rsatiladi + CSV yuklab olish), parol tiklash, o'quvchini ko'chirish/o'chirish.
4. Chorak (1–4) va darslar: yaratish/tahrirlash/tartiblash, nashr etish/qoralama, materiallar (fayl R2 orqali presigned URL, YouTube facade, havola).
5. O'quvchi tomoni: o'z guruhining nashr etilgan darslari, material ko'rish/yuklab olish, "yangi" belgisi.
6. Reyting sahifasi skeleti: umumiy / guruh / sinf bo'yicha, davr filtri, `totalCoins` asosida (ledger 3-bosqichda ulanadi). Mentor ham, o'quvchilar ham ko'radi; o'quvchilarga boshqalar "Ali V." ko'rinishida.
7. Dizayn: mobil-birinchi pastki navigatsiya, skeletonlar, bo'sh holatlar, toast'lar, yengil animatsiyalar (stagger, sahifa o'tishi, reyting podium), `prefers-reduced-motion`.
8. `README.md`: ishga tushirish, `.env.example`, Atlas va R2 sozlamalari (R2 CORS JSON), Vercel deploy.

**Tekshiruv (majburiy).** Tugatgach: `npm run lint`, `npx tsc --noEmit`, `npm run build`. Keyin built-in brauzerda loyihani ishga tushirib, 360px mobil va desktop o'lchamlarida asosiy oqimlarni (kirish → import → dars yaratish → material yuklash → o'quvchi sifatida ko'rish → reyting) sinab, skrinshotlar bilan *Walkthrough* artifakti qoldir. Topilgan xatolarni o'zing tuzat.

**Cheklovlar.**
- Maxfiy qiymatlarni (`.env.local`) o'qima va so'rama; `.env.example` ni bo'sh nomlar bilan yoz, men o'zim to'ldiraman.
- Test uchun o'quvchi/mentor ma'lumotlari kerak bo'lsa, `scripts/seed.ts` yoz (parollar tasodifiy, konsolga bir marta chiqadi), lekin uni o'zing ishga tushirma — menga qanday ishga tushirishni yoz.
- Bajarmagan yoki taxminan qilgan joyingni hisobotda halol ayt.

---

# Claude Code uchun tekshiruv prompti (Antigravity tugagach)

Bu loyiha Antigravity yordamida qurildi. `docs/SPEC.md` va workspace qoidalarini o'qi, so'ng loyihani **audit qil** va topilgan kamchiliklarni tuzat:
1. `npm run lint`, `npx tsc --noEmit`, `npm run build` — xatolarni tuzat.
2. Xavfsizlik: har bir server action/API route'da autentifikatsiya, rol va guruh egaligi tekshiruvi bormi (IDOR), zod validatsiya, fayl yuklashda tur/hajm tekshiruvi, maxfiy qiymatlar kodda yo'qligi, cookie sozlamalari.
3. SPEC bilan solishtir: yetishmayotgan yoki noto'g'ri bajarilgan talablar ro'yxatini tuz, keyin tuzat.
4. Tezlik/dizayn: skeleton va loading holatlari, lazy loading, layout shift, mobil 360px, yorug'/qorong'i rejim.
5. Oxirida: nima topilgani, nima tuzatilgani va nima qolgani haqida qisqa hisobot.
