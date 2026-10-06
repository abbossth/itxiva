// Logodan barcha rastr ikonkalarni generatsiya qiladi: favicon.ico, apple-touch-icon, PWA ikonkalari, OG rasm.
// Ishga tushirish: node scripts/generate-icons.mjs
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";

const TEAL = "#12B5A3";
const DARK = "#0A0D12";
const LIGHT = "#F6F7F9";

/** Belgi: `< >` qavslari orasida minora. 48x48 koordinatalarda. */
const mark = (bracket, band) => `
  <g stroke="${bracket}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <path d="M14 15 5 24l9 9"/><path d="m34 15 9 9-9 9"/>
  </g>
  <path d="M21.2 12c0-2.8 1.3-5 2.8-6.5 1.5 1.5 2.8 3.7 2.8 6.5Z" fill="${TEAL}"/>
  <rect x="19" y="12.5" width="10" height="3" rx="1.5" fill="${TEAL}"/>
  <path d="M20.6 16.5h6.8L29.6 39H18.4Z" fill="${TEAL}"/>
  <path d="M19.8 24h8.4M19 32h10" stroke="${band}" stroke-width="1.8" fill="none"/>
  <rect x="15.5" y="39" width="17" height="3" rx="1.5" fill="${TEAL}"/>`;

const markSvg = (bracket, band) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none">${mark(bracket, band)}</svg>`;

/** Kvadrat ikonka: fon + belgi. `pad` — chetdan bo'sh joy ulushi (maskable uchun kattaroq). */
const iconSvg = (size, { bg = DARK, radius = 0.22, pad = 0.14 } = {}) => {
  const inner = size * (1 - pad * 2);
  const scale = inner / 48;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${size * radius}" fill="${bg}"/>
    <g transform="translate(${size * pad} ${size * pad}) scale(${scale})">${mark("#EEF0F3", bg)}</g>
  </svg>`;
};

const wordmarkSvg = (text, band) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 190 48" fill="none">
  ${mark(text, band)}
  <text x="56" y="33" font-family="'JetBrains Mono', ui-monospace, Menlo, monospace" font-size="27" font-weight="800" letter-spacing="-1.2" fill="${text}">IT<tspan fill="${TEAL}">Xiva</tspan></text>
</svg>`;

const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${DARK}"/>
  <g stroke="#171C25" stroke-width="1">${Array.from({ length: 20 }, (_, i) => `<path d="M${i * 60 + 30} 0V630"/>`).join("")}${Array.from({ length: 11 }, (_, i) => `<path d="M0 ${i * 60 + 15}H1200"/>`).join("")}</g>
  <g transform="translate(90 170) scale(6)">${mark("#EEF0F3", DARK)}</g>
  <text x="430" y="300" font-family="Menlo, 'JetBrains Mono', monospace" font-size="118" font-weight="800" letter-spacing="-5" fill="#EEF0F3">IT<tspan fill="${TEAL}">Xiva</tspan></text>
  <text x="434" y="372" font-family="Helvetica, Arial, sans-serif" font-size="38" fill="#98A0AB">Dasturlash o'quv platformasi</text>
  <text x="434" y="428" font-family="Menlo, monospace" font-size="26" fill="${TEAL}">itxiva.uz</text>
</svg>`;

const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();

/** PNG tasvirlardan .ico konteyner yig'adi */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const entries = images.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size === 256 ? 0 : size, 0);
    e.writeUInt8(size === 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

mkdirSync("public/icons", { recursive: true });
mkdirSync("public/brand", { recursive: true });

// Vektor variantlar (yorug' va qorong'i fon uchun)
writeFileSync("public/brand/mark-on-light.svg", markSvg("#14181F", LIGHT));
writeFileSync("public/brand/mark-on-dark.svg", markSvg("#EEF0F3", DARK));
writeFileSync("public/brand/wordmark-on-light.svg", wordmarkSvg("#14181F", LIGHT));
writeFileSync("public/brand/wordmark-on-dark.svg", wordmarkSvg("#EEF0F3", DARK));
writeFileSync("src/app/icon.svg", iconSvg(64));

// Kichik o'lchamda aniq ko'rinishi uchun favicon'da chet bo'shlig'i kamroq
const small = (s) => png(iconSvg(256, { pad: 0.06, radius: 0.2 }), s);
writeFileSync("src/app/favicon.ico", buildIco([{ size: 16, data: await small(16) }, { size: 32, data: await small(32) }, { size: 48, data: await small(48) }]));
writeFileSync("src/app/apple-icon.png", await png(iconSvg(512, { radius: 0, pad: 0.16 }), 180));
writeFileSync("public/icons/icon-192.png", await png(iconSvg(512), 192));
writeFileSync("public/icons/icon-512.png", await png(iconSvg(512), 512));
writeFileSync("public/icons/icon-maskable-192.png", await png(iconSvg(512, { radius: 0, pad: 0.24 }), 192));
writeFileSync("public/icons/icon-maskable-512.png", await png(iconSvg(512, { radius: 0, pad: 0.24 }), 512));
writeFileSync("src/app/opengraph-image.png", await sharp(Buffer.from(ogSvg)).png().toBuffer());

console.log("Ikonkalar generatsiya qilindi.");
