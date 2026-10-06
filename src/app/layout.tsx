import type { Metadata, Viewport } from "next";
import { Geist, JetBrains_Mono } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

// Fontlar build vaqtida yuklab olinib, saytning o'zidan beriladi (Google'ga so'rov ketmaydi)
const geist = Geist({
  // Faqat lotin to'plami oldindan yuklanadi (o'zbek lotin yozuvi uchun yetarli, ʻ va ʼ ham shu to'plamda)
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist",
});

// Sarlavhalar, raqamlar, coin va kod uchun
const jetbrains = JetBrains_Mono({
  // Faqat lotin to'plami oldindan yuklanadi (o'zbek lotin yozuvi uchun yetarli, ʻ va ʼ ham shu to'plamda)
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains",
  weight: ["500", "700", "800"],
});

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://itxiva.uz";
const DESCRIPTION =
  "ITXiva — Xivadagi “Muhammad al-Xorazmiy vorislari” dasturi o'quvchilari uchun dasturlash o'quv platformasi: darslar, uyga vazifalar, testlar, davomat va coin do'koni.";

// Ikonkalar (favicon.ico, icon.svg, apple-icon.png) va OG rasm (opengraph-image.png) app/ papkasidagi fayllardan olinadi
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "ITXiva — O'quv platformasi",
    template: "%s",
  },
  description: DESCRIPTION,
  applicationName: "ITXiva",
  openGraph: {
    type: "website",
    locale: "uz_UZ",
    siteName: "ITXiva",
    title: "ITXiva — O'quv platformasi",
    description: DESCRIPTION,
    url: "/",
  },
  twitter: { card: "summary_large_image", title: "ITXiva — O'quv platformasi", description: DESCRIPTION },
  appleWebApp: { capable: true, title: "ITXiva", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F7F9" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0D12" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uz" className={`${geist.variable} ${jetbrains.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const storedTheme = localStorage.getItem('theme');
                  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  if (storedTheme === 'dark' || (!storedTheme && prefersDark)) {
                    document.documentElement.classList.add('dark');
                  } else {
                    document.documentElement.classList.remove('dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className="font-sans min-h-screen bg-slate-50 text-slate-900 dark:bg-bg dark:text-slate-100 selection:bg-teal-500/20 selection:text-teal-600 dark:selection:text-teal-400">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
