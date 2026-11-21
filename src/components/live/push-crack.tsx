// Ekran oynasi yorilishi: otilgan personaj "ekranga" urilganda chaqnash va yoriqlar (CSS animatsiya bilan)

export function PushCrack() {
  return (
    <svg className="push-crack" viewBox="0 0 100 100" aria-hidden>
      <defs>
        <radialGradient id="pushFlash" cx="50%" cy="45%" r="50%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="60%" stopColor="#e0f2fe" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="45" r="46" fill="url(#pushFlash)" />
      <g fill="none" stroke="#f8fafc" strokeLinecap="round" strokeLinejoin="round" opacity="0.95">
        <path d="M50 45 L38 22 L33 10 M50 45 L66 20 L72 6 M50 45 L80 40 L96 44 M50 45 L74 66 L88 86 M50 45 L52 74 L48 96 M50 45 L28 66 L12 82 M50 45 L18 42 L4 36" strokeWidth="0.7" />
        <path d="M38 22 L46 30 M66 20 L60 31 M80 40 L70 50 M74 66 L64 58 M52 74 L56 62 M28 66 L38 57 M18 42 L32 47" strokeWidth="0.45" />
        <path d="M40 38 Q50 30 60 38 Q64 48 56 55 Q46 58 40 50 Q37 44 40 38 Z" strokeWidth="0.5" />
      </g>
    </svg>
  );
}
