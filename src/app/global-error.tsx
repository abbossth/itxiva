"use client";

// Ildiz layout'ning o'zida xato chiqsa ko'rsatiladi: global uslublar yuklanmaydi, shuning uchun
// hamma narsa inline — tashqi komponent yoki CSS'ga bog'liq emas.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="uz">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: 16,
          textAlign: "center",
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "#0B1220",
          color: "#F1F5F9",
        }}
      >
        <title>Xatolik — ITXiva</title>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Nimadir xato ketdi</h1>
        <p style={{ fontSize: 14, color: "#94A3B8", maxWidth: 360, margin: 0 }}>
          Sayt kutilmagan xatoga uchradi. Qayta urinib ko&apos;ring.
        </p>
        {error.digest && (
          <p style={{ fontSize: 11, fontFamily: "monospace", color: "#64748B", margin: 0 }}>Xato kodi: {error.digest}</p>
        )}
        <button
          type="button"
          onClick={() => retry()}
          style={{
            marginTop: 8,
            minHeight: 44,
            padding: "0 20px",
            borderRadius: 12,
            border: 0,
            background: "#0D9488",
            color: "#fff",
            fontWeight: 600,
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          Qayta urinish
        </button>
      </body>
    </html>
  );
}
