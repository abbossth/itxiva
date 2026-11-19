// O'zbekcha saralash: server (Node) va brauzer bir xil natija beradi. `localeCompare("uz")` ICU versiyasiga
// bog'liq — Node "Oʻ, Gʻ, Sh, Ch" ni alifbodagidek Z dan keyin qo'yadi, Chrome esa yo'q: ro'yxat tartibi
// sahifa yuklanganda sakrardi va React "hydration" xatosi berardi. Bu yerda tartib qo'lda belgilangan.
// Bu fayl brauzer va server uchun umumiy.

const ALPHABET = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z", "o'", "g'", "sh", "ch"];
const RANK = new Map(ALPHABET.map((l, i) => [l, i + 1]));
const APOS = /[‘’ʻʼ`´]/g;

type Token = number | [number];

function tokens(s: string): Token[] {
  const t = s.normalize("NFC").toLowerCase().replace(APOS, "'");
  const out: Token[] = [];
  for (let i = 0; i < t.length; ) {
    const c = t[i];
    if (c >= "0" && c <= "9") {
      let j = i;
      while (j < t.length && t[j] >= "0" && t[j] <= "9") j++;
      // Son — bitta belgi sifatida (2 < 10), harflardan oldin
      out.push([Number(t.slice(i, j))]);
      i = j;
      continue;
    }
    const two = t.slice(i, i + 2);
    if (two === "o'" || two === "g'" || two === "sh" || two === "ch") {
      out.push(RANK.get(two)!);
      i += 2;
      continue;
    }
    if (c === "'" || c === " " || c === "-" || c === ".") {
      // Ajratuvchilar: so'z chegarasi hammadan oldin
      if (c !== "'") out.push(0);
      i++;
      continue;
    }
    out.push(RANK.get(c) ?? 1000 + (c.codePointAt(0) ?? 0));
    i++;
  }
  return out;
}

/** Ikki matnni o'zbek alifbosi bo'yicha taqqoslash (katta-kichik harf farqsiz, sonlar son sifatida) */
export function compareUz(a: string, b: string): number {
  const x = tokens(a ?? "");
  const y = tokens(b ?? "");
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const p = x[i];
    const q = y[i];
    const pn = Array.isArray(p);
    const qn = Array.isArray(q);
    if (pn && qn) {
      if (p[0] !== q[0]) return p[0] - q[0];
    } else if (pn !== qn) return pn ? -1 : 1;
    else if (p !== q) return (p as number) - (q as number);
  }
  if (x.length !== y.length) return x.length - y.length;
  return a < b ? -1 : a > b ? 1 : 0;
}
