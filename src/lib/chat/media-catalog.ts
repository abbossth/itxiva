// Chat media catalogs: animated premium stickers, our own GIF pack, emoji keyword search.
// Messages store only the id; unknown ids are rejected. Pure module (browser, server, tests).

/** Animated premium stickers (rendered by components/chat/animated-sticker.tsx) */
export const PREMIUM_STICKERS = [
  { id: "a:fire", emoji: "🔥", name: "Olov", anim: "flame" },
  { id: "a:heart", emoji: "❤️", name: "Yurak", anim: "beat" },
  { id: "a:party", emoji: "🥳", name: "Bayram", anim: "party" },
  { id: "a:laugh", emoji: "😂", name: "Kulgi", anim: "shake" },
  { id: "a:like", emoji: "👍", name: "Zo'r", anim: "pop" },
  { id: "a:rocket", emoji: "🚀", name: "Raketa", anim: "launch" },
  { id: "a:star", emoji: "🌟", name: "Yulduz", anim: "spin" },
  { id: "a:100", emoji: "💯", name: "Yuz ball", anim: "pulse" },
  { id: "a:trophy", emoji: "🏆", name: "Kubok", anim: "shine" },
  { id: "a:clap", emoji: "👏", name: "Qarsak", anim: "clap" },
  { id: "a:cool", emoji: "😎", name: "Salqin", anim: "slide" },
  { id: "a:think", emoji: "🤔", name: "O'ylash", anim: "tilt" },
  { id: "a:wow", emoji: "🤩", name: "Voy-bo'!", anim: "party" },
  { id: "a:cry", emoji: "😭", name: "Yig'i", anim: "drip" },
  { id: "a:brain", emoji: "🧠", name: "Aql", anim: "pulse" },
  { id: "a:robot", emoji: "🤖", name: "Robot", anim: "wave" },
] as const;

export type PremiumStickerId = (typeof PREMIUM_STICKERS)[number]["id"];
const PREMIUM_IDS = new Set<string>(PREMIUM_STICKERS.map((s) => s.id));
export const isPremiumSticker = (s: unknown): s is PremiumStickerId => typeof s === "string" && PREMIUM_IDS.has(s);
export const premiumSticker = (id: string) => PREMIUM_STICKERS.find((s) => s.id === id);

/**
 * Our GIF pack. "char" GIFs show the SENDER's own 3D character doing a move with a caption;
 * "scene" GIFs are animated illustrations. Premium GIFs need IT Xiva Premium.
 */
export const GIFS = [
  { id: "g:hello", kind: "char", row: "celebrate", caption: "Salom!", premium: false },
  { id: "g:yes", kind: "char", row: "jump", caption: "Ura!", premium: false },
  { id: "g:go", kind: "char", row: "run", caption: "Ketdik!", premium: false },
  { id: "g:hmm", kind: "char", row: "think", caption: "Hmm…", premium: false },
  { id: "g:sad", kind: "char", row: "sad", caption: "Afsus…", premium: false },
  { id: "g:oops", kind: "char", row: "hit", caption: "Voy!", premium: false },
  { id: "g:bravo", kind: "scene", scene: "fireworks", caption: "Barakalla!", premium: false },
  { id: "g:thanks", kind: "scene", scene: "hearts", caption: "Rahmat!", premium: false },
  { id: "g:idea", kind: "scene", scene: "bulb", caption: "Tushundim!", premium: false },
  { id: "g:sleep", kind: "scene", scene: "sleep", caption: "Uyqum keldi…", premium: false },
  { id: "g:win", kind: "scene", scene: "trophy", caption: "G'alaba!", premium: true },
  { id: "g:launch", kind: "scene", scene: "rocket", caption: "Oldinga!", premium: true },
  { id: "g:dance", kind: "char", row: "run", caption: "Raqs!", premium: true, party: true },
  { id: "g:champ", kind: "char", row: "celebrate", caption: "Chempion!", premium: true, party: true },
] as const;

export type GifId = (typeof GIFS)[number]["id"];
const GIF_IDS = new Set<string>(GIFS.map((g) => g.id));
export const isGif = (s: unknown): s is GifId => typeof s === "string" && GIF_IDS.has(s);
export const gifOf = (id: string) => GIFS.find((g) => g.id === id);

/** Emoji with Uzbek and English keywords for ":word" suggestions */
const EMOJI_WORDS: [string, string][] = [
  ["😀", "kul kulgi tabassum smile happy xursand"],
  ["😂", "kulgi kuldim haha lol yig'lab kul laugh"],
  ["🤣", "qotib kuldim rofl haha"],
  ["😊", "xursand quvonch shirin blush happy"],
  ["😍", "sevaman yoqdi love heart eyes"],
  ["🥰", "mehr sevgi love cute"],
  ["😎", "salqin zo'r cool"],
  ["🤩", "voy ajoyib wow star"],
  ["🥳", "bayram tug'ilgan party"],
  ["😢", "xafa yig'i sad"],
  ["😭", "yig'lash yig'i cry"],
  ["😡", "jahl g'azab angry"],
  ["😱", "qo'rqdim voy shok scream"],
  ["🤔", "o'yla o'ylash hmm think"],
  ["😴", "uyqu charchadim sleep"],
  ["🙃", "teskari hazil upside"],
  ["😅", "uyaldim terladim sweat"],
  ["🤯", "miya portladi shok mind"],
  ["🫡", "salom salut hurmat salute"],
  ["🙏", "rahmat iltimos duo thanks please"],
  ["👍", "ha zo'r yaxshi ok like yes"],
  ["👎", "yo'q yomon dislike no"],
  ["👏", "qarsak barakalla bravo clap"],
  ["👋", "salom xayr hello bye wave"],
  ["🤝", "kelishdik qo'l deal"],
  ["💪", "kuch kuchli strong muscle"],
  ["✌️", "tinchlik peace"],
  ["🫶", "yurak sevgi love"],
  ["❤️", "yurak sevgi love heart qizil"],
  ["💔", "singan yurak broken"],
  ["🔥", "olov zo'r fire hot"],
  ["⭐", "yulduz star"],
  ["🌟", "yulduz porloq star"],
  ["✨", "sehr yaltiroq sparkle"],
  ["💯", "yuz a'lo mukammal hundred perfect"],
  ["✅", "to'g'ri bajarildi done check"],
  ["❌", "xato noto'g'ri wrong no"],
  ["❓", "savol question"],
  ["❗", "muhim diqqat important"],
  ["💡", "g'oya fikr tushundim idea"],
  ["🎉", "tabrik bayram congrats party"],
  ["🎂", "tort tug'ilgan cake birthday"],
  ["🎁", "sovg'a gift"],
  ["🏆", "kubok g'alaba chempion trophy win"],
  ["🥇", "birinchi oltin medal first gold"],
  ["🎯", "nishon maqsad target"],
  ["📚", "kitob dars o'qish book study"],
  ["📖", "kitob o'qish read"],
  ["✏️", "qalam yozish pencil"],
  ["📝", "uy vazifa yozish homework note"],
  ["🧠", "miya aql brain smart"],
  ["💻", "kompyuter dastur kod laptop code"],
  ["⌨️", "klaviatura keyboard"],
  ["🐍", "python ilon snake"],
  ["🤖", "robot"],
  ["🚀", "raketa ketdik tez rocket"],
  ["⚡", "chaqmoq tez energy fast"],
  ["⏰", "soat vaqt time alarm"],
  ["⌛", "kutish vaqt wait"],
  ["📅", "sana kalendar date"],
  ["🏫", "maktab school"],
  ["🎮", "o'yin game"],
  ["⚽", "futbol to'p football"],
  ["🏀", "basketbol basketball"],
  ["🎵", "musiqa qo'shiq music song"],
  ["🎨", "rasm san'at art"],
  ["📸", "rasm foto photo"],
  ["🍕", "pitsa pizza"],
  ["🍔", "burger"],
  ["🍉", "tarvuz qovun watermelon"],
  ["🍎", "olma apple"],
  ["☕", "choy qahva coffee tea"],
  ["🍵", "choy tea"],
  ["🍰", "shirinlik cake"],
  ["🌞", "quyosh sun"],
  ["🌧️", "yomg'ir rain"],
  ["❄️", "qor sovuq snow cold"],
  ["🌈", "kamalak rainbow"],
  ["🐱", "mushuk cat"],
  ["🐶", "it kuchuk dog"],
  ["🦊", "tulki fox"],
  ["🐼", "panda"],
  ["🦁", "sher lion"],
  ["🐉", "ajdar dragon"],
  ["🦄", "yolg'iz shoxli unicorn"],
  ["👀", "qarayapman ko'z eyes look"],
  ["🙈", "uyat ko'rmadim maymun monkey"],
  ["💤", "uyqu zzz sleep"],
  ["💀", "o'ldim kulgidan skull dead"],
  ["😇", "farishta yaxshi angel"],
  ["🤗", "quchoq hug"],
  ["😋", "mazali yum tasty"],
  ["🤫", "jim sir secret"],
  ["🥺", "iltimos please"],
  ["😬", "noqulay awkward"],
  ["🤓", "bilimdon a'lochi nerd"],
  ["💎", "olmos qimmat diamond"],
  ["👑", "toj shoh king crown"],
  ["🪙", "coin tanga pul coin"],
  ["💰", "pul boylik money"],
];

const norm = (s: string) => s.toLowerCase().replace(/[ʻʼ‘’`]/g, "'");

/** Emoji matching a word prefix (":kul" → 😀 😂 🤣), best first */
export function searchEmoji(q: string, limit = 8): string[] {
  const w = norm(q.trim());
  if (!w) return [];
  const scored: { e: string; s: number }[] = [];
  for (const [e, words] of EMOJI_WORDS) {
    let best = 0;
    for (const word of norm(words).split(" ")) {
      if (word === w) best = Math.max(best, 3);
      else if (word.startsWith(w)) best = Math.max(best, 2);
      else if (w.length >= 3 && word.includes(w)) best = Math.max(best, 1);
    }
    if (best) scored.push({ e, s: best });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.e);
}
