# ITXiva — Arxitektura tahlili va kod bazasi holati (ARCHITECTURE_NOTES.md)

Audit sanasi: 2026-yil 5-oktabr

Ushbu hujjat yangi dizayn tizimi, UI/UX modernizatsiyasi va QR/kod davomat tizimini amalga oshirishdan oldin mavjud kod bazasini to'liq o'rganish natijalarini jamlaydi.

---

## 1. Papka va Loyiha tuzilmasi
- **Framework**: Next.js 16.3.8 (React 19.2.8, Turbopack, App Router).
- **Styling**: Tailwind CSS v4 (`@import "tailwindcss";`, `@custom-variant dark (&:where(.dark, .dark *));`).
- **Icons & Animation**: `lucide-react`, `motion` (Motion for React / Framer Motion zamonaviy versiyasi).
- **Asosiy kataloglar**:
  - `src/app/(auth)`: Kirish (`/login`) va parolni majburiy yangilash (`/change-password`).
  - `src/app/(dashboard)`: Mentor boshqaruvi (`/mentor/groups`, `/mentor/lessons`, `/mentor/exams`, `/mentor/audit`), O'quvchi sahifalari (`/lessons`, `/exams`), Umumiy reyting (`/leaderboard`).
  - `src/actions/`: Server Actions (`auth`, `group`, `student`, `lesson`, `quiz`, `exam`, `leaderboard`).
  - `src/components/`:
    - `ui/`: Primitivlar (`button`, `card`, `dialog`, `badge`, `input`, `tabs`, `skeleton`).
    - `layout/`: `header.tsx`, `desktop-nav.tsx`, `mobile-nav.tsx`, `logo.tsx`.
    - `shared/`: `theme-toggle.tsx`, `skeletons.tsx`, `empty-state.tsx`.
    - `mentor/`, `exams/`, `quiz/`, `lessons/`, `leaderboard/`.
  - `src/lib/`:
    - `auth/`: `guards.ts`, `session.ts`, `password.ts`.
    - `db/`: Mongoose ulanishi (`connect.ts`) va modellar (`models/`).
    - `storage/`: Cloudflare R2 S3 klient va presigned URL generatori (`r2.ts`).
    - `validations/`: Zod sxemalari.
    - `utils.ts`, `grading.ts`, `rate-limit.ts`.

---

## 2. Autentifikatsiya va Rol tekshiruvi (Guards)
- **Sessiya**: `jose` orqali 14 kunlik HTTP-only cookie (`itxiva_session`). Sessiya ichida: `{ userId, role, login, fullName, groupId, mustChangePassword }`.
- **Guards tartibi (`src/lib/auth/guards.ts`)**:
  1. `requireAuth()` — sessiya mavjudligini tasdiqlaydi, aks holda `/login` ga yo'naltiradi.
  2. `requireMentor()` / `requireMentorPage()` — faqat mentor roli. Sahifada mentor bo'lmasa xato emas, `/lessons` ga toza yo'naltiriladi.
  3. `requireStudent()` — faqat o'quvchi roli.
  4. `requireGroupAccess(groupId)` — o'quvchi faqat o'z guruhiga, mentor esa barcha guruhlarga kirish huquqiga egaligi.
- **Server Actions & API Routes xavfsizlik qoidasi**:
  1) `auth`, 2) `role`, 3) `ownership/group` qat'iy saqlangan.

---

## 3. Ma'lumotlar modeli (Mongoose / MongoDB)
- `User`: `fullName`, `login` (unique), `passwordHash`, `role` (mentor|student), `groupId`, `mustChangePassword`, `totalCoins`, `spendableBalance`, `isHiddenFromLeaderboard`, `lastLoginAt`.
- `Group`: `name`, `grade` (8|9|10|11), `academicYear`, `studentCount`, `isActive`.
- `Lesson`: `groupId`, `quarter` (1..4), `order`, `title`, `topic`, `description`, `materials` (video, file, link), `isPublished`.
- `Quiz` & `QuizSubmission`: Dars ichidagi testlar (4 ta savol turi: `single_choice`, `multiple_choice`, `short_answer`, `open_ended`).
- `Exam` & `ExamSubmission`: Choraklik nazorat imtihonlari va loyihalar. Server-side taymer (`startedAt`, `durationMinutes`), Cloudflare R2 presigned fayl yuklash, GitHub havola, baholash.
- `AuditLog`: Mentor bajargan amallar tarixi (`actorId`, `action`, `targetUserId`, `details`, `ip`, `createdAt`).

---

## 4. Gamifikatsiya va Coin mexanizmi
- Hozirgi holatda o'quvchining jami yig'gan tangalari `User.totalCoins` va sarflanadigan balansi `User.spendableBalance` maydonlarida saqlanadi.
- Tranzaksiyalar tarixi va davomat/test uchun takrorlanmaslikni ta'minlovchi `CoinLedger` / `CoinTransaction` modeli mavjud emas edi. 4-faza (Davomat) va Do'kon tizimi uchun idempotent `CoinLedger` kolleksiyasini qo'shish arxitektura jihatidan eng to'g'ri yechim bo'ladi.

---

## 5. Auditda aniqlangan muammolar sababi
1. **Telefonda jadval kesilishi (K1)**: `group-students-view.tsx` va `mentor/audit/page.tsx` da `<div className="overflow-hidden">` ichida keng `<table>` ishlatilgan. `overflow-x-auto` yo'q va mobilda karta ko'rinishi yaratilmagan.
2. **Inter shrifti ishlamasligi (K2)**: `layout.tsx` da `inter.variable` yuklangan, lekin Tailwind CSS v4 da `@theme { --font-sans: var(--font-inter), ...; }` belgilanmagani uchun brauzer tizim shriftini ko'rsatmoqda.
3. **Reyting podiumidagi zidlik (K3)**: Hamma 0 coin bo'lganda ham `entries.slice(0, 3)` olinib, podiumga 1-, 2-, 3-o'rin sifatida chiqarilmoqda. Ro'yxatda esa hammada 1-o'rin ko'rinadi.
4. **Forma maydonlari (K4)**: Formalarda `<label>` va `<Input>` orasida `htmlFor` / `id` bog'lanishi yo'q.
5. **Desktop yon paneli yo'qolishi (M1)**: `desktop-nav.tsx` da `aside` `position: static` bo'lib turibdi, sticky emas.
6. **Davomat va Do'kon**: Do'kon (`/shop`) va Davomat (`/attendance`) marshrutlari umuman mavjud emas edi (404).

---

## 6. Reja va Amalga oshirish bosqichlari
- **1-FAZA**: Yangi dizayn tizimi, CSS tokenlar, Inter shrifti, kengaytirilgan UI primitivlari va `/dev/ui` sahifasi.
- **2-FAZA**: Umumiy maket, sticky navigatsiya, mobil bottom nav, mobil profil/avatar sheet, rol yo'naltirishlari va metadata.
- **3-FAZA**: Sahifalarni bosqichma-bosqich qayta dizayn qilish va barcha audit kamchiliklarini bartaraf etish.
- **4-FAZA**: QR va 6 belgili kod orqali dinamik 180s davomat tizimi, jonli proyektor rejimi, OTP kiritish, Coin taqdirlash va CSV eksport.
- **5-7-FAZALAR**: Animatsiyalar, mikrointeraksiyalar, tezlik/Lighthouse optimallashtirish va a11y tekshiruvi.
