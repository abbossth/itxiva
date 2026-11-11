import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// "Kiber jang" real vaqt xonasi (Cloudflare Worker) — sozlangan bo'lsa, uning manzili
const arenaOrigin = (() => {
  try {
    const u = process.env.NEXT_PUBLIC_ARENA_WS_URL ? new URL(process.env.NEXT_PUBLIC_ARENA_WS_URL) : null;
    return u && (u.protocol === "wss:" || u.protocol === "ws:") ? `${u.protocol}//${u.host}` : "";
  } catch {
    return "";
  }
})();

// Skript va freymlar faqat o'zimizdan (va YouTube pleyeridan). Rasm, fayl yuklash va yuklab olish
// Cloudflare R2'ning vaqtinchalik havolalari orqali ketadi, shuning uchun img/connect/media uchun https ruxsat etilgan.
// Next.js o'zining inline skriptlarini nonce'siz chiqaradi — shu sabab 'unsafe-inline' qoldirilgan.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // Brauzer faqat saytning o'ziga, fayl omboriga (R2 presigned havolalari) va "Kiber jang" real vaqt xonasiga ulana oladi
  `connect-src 'self' https://*.r2.cloudflarestorage.com${arenaOrigin ? ` ${arenaOrigin}` : ""}`,
  "media-src 'self' blob: https:",
  "frame-src https://www.youtube-nocookie.com https://www.youtube.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Kamera faqat QR davomat skaneri uchun kerak
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  // Boshqa sayt ochgan oyna bu sahifaga (window.opener orqali) murojaat qila olmaydi
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

// Qaysi versiya ishlayotgani: brauzerdagi eski sahifa yangi deploydan keyin o'zini yangilashi uchun
const buildId = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.VERCEL_DEPLOYMENT_ID ?? "dev";

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_BUILD_ID: buildId },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "img.youtube.com",
        pathname: "/vi/**",
      },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
