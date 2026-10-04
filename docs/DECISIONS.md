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
