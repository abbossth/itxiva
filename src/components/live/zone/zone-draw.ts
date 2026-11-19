// "Yashil zona" maydonini chizish (canvas 2D): o'quvchi telefoni va proyektor uchun umumiy.
// Koordinatalar maydon birligida (FIELD.w × FIELD.h), chizishda ekranga moslanadi.
// Fon bir marta alohida canvas'ga chiziladi (har kadrda emas) — kuchsiz telefonda ham silliq.

import { FIELD, ROBOT_COLORS, ROBOT_R, STAR_R, ZAP_PERIOD_MS, zapActive, type ZoneWave } from "@/lib/live-game/zone";
import type { GameLook } from "@/lib/character/catalog";
import { characterSprite, drawCharacterSprite } from "@/components/character/character-sprite";

export interface DrawRobot {
  id: string;
  name: string;
  x: number;
  y: number;
  color: number;
  out: boolean;
  me?: boolean;
  /** Harakat yo'nalishi (ko'zlar shu tomonga qaraydi) */
  dx?: number;
  dy?: number;
  /** Joy: 0 — zonada emas, z+1 — joyli, -(z+1) — joy yetmadi */
  seat: number;
  stunned?: boolean;
  moving?: boolean;
  /** O'quvchi personaji — bo'lsa robot o'rniga shu chiziladi */
  look?: GameLook | null;
}

export interface DrawState {
  wave: ZoneWave | null;
  /** To'lqin boshidan beri (ms) — zona paydo bo'lishi va elektr tuzoqlar uchun */
  sinceWaveMs: number;
  /** To'lqin tugashigacha ulush (1 → 0); null — sanoq yoki tugagan */
  timeLeft: number | null;
  lock: boolean;
  stars: ZoneWave["stars"];
  robots: DrawRobot[];
  /** Ism yozuvlari (proyektorda — hammaga, telefonda — yaqinlarga) */
  labels: "all" | "near";
  /** O'zi uchun: eng yaqin bo'sh zonaga yo'l ko'rsatkich */
  guide?: { x: number; y: number } | null;
  /** Bosilgan nuqta (telefonda) */
  target?: { x: number; y: number } | null;
  t: number;
  fx: ZoneFx;
}

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number };
type FloatText = { x: number; y: number; text: string; color: string; life: number; max: number };
type Ring = { x: number; y: number; color: string; life: number; max: number; r: number };

/** Effektlar: uchqunlar, yozuvlar, halqalar va robot izlari (maydon birligida) */
export class ZoneFx {
  particles: Particle[] = [];
  texts: FloatText[] = [];
  rings: Ring[] = [];
  trails = new Map<string, { x: number; y: number }[]>();

  burst(x: number, y: number, color: string, n = 16, speed = 18) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.35 + Math.random() * 0.65);
      const max = 0.5 + Math.random() * 0.5;
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: max, max, color, size: 0.35 + Math.random() * 0.5 });
    }
    if (this.particles.length > 500) this.particles.splice(0, this.particles.length - 500);
  }

  text(x: number, y: number, text: string, color: string) {
    this.texts.push({ x, y, text, color, life: 1.2, max: 1.2 });
  }

  ring(x: number, y: number, color: string, r = 6) {
    this.rings.push({ x, y, color, life: 0.6, max: 0.6, r });
  }

  step(dt: number) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - Math.min(1, dt * 3);
      p.vy *= 1 - Math.min(1, dt * 3);
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const t of this.texts) {
      t.life -= dt;
      t.y -= dt * 4;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter((r) => r.life > 0);
  }

  trail(id: string, x: number, y: number, moving: boolean) {
    let arr = this.trails.get(id);
    if (!arr) {
      arr = [];
      this.trails.set(id, arr);
    }
    const last = arr[arr.length - 1];
    if (!moving) {
      if (arr.length > 0) arr.shift();
      return;
    }
    if (!last || Math.hypot(last.x - x, last.y - y) > 0.8) arr.push({ x, y });
    if (arr.length > 7) arr.shift();
  }
}

function starPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

// ---- Fon (keshlanadi) ----
let bgCache: { w: number; h: number; c: HTMLCanvasElement } | null = null;

function background(width: number, height: number): HTMLCanvasElement {
  if (bgCache && bgCache.w === width && bgCache.h === height) return bgCache.c;
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d")!;
  const k = Math.min(width / FIELD.w, height / FIELD.h);
  const ox = (width - FIELD.w * k) / 2;
  const oy = (height - FIELD.h * k) / 2;
  const fw = FIELD.w * k;
  const fh = FIELD.h * k;
  const bg = ctx.createLinearGradient(0, oy, 0, oy + fh);
  bg.addColorStop(0, "#06172a");
  bg.addColorStop(0.5, "#081a33");
  bg.addColorStop(1, "#0b0f2e");
  ctx.fillStyle = bg;
  ctx.fillRect(ox, oy, fw, fh);
  // Olti burchakli pol plitalari
  ctx.strokeStyle = "rgba(56,189,248,0.07)";
  ctx.lineWidth = 1;
  const hs = 4 * k;
  const hw = Math.sqrt(3) * hs;
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, fw, fh);
  ctx.clip();
  for (let row = 0, y = oy; y < oy + fh + hs * 2; row++, y += hs * 1.5) {
    for (let x = ox + (row % 2 ? hw / 2 : 0); x < ox + fw + hw; x += hw) {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        ctx.lineTo(x + Math.cos(a) * hs, y + Math.sin(a) * hs);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  // Chetlari qorong'i (vinetka)
  const vg = ctx.createRadialGradient(ox + fw / 2, oy + fh / 2, Math.min(fw, fh) * 0.3, ox + fw / 2, oy + fh / 2, Math.max(fw, fh) * 0.7);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = vg;
  ctx.fillRect(ox, oy, fw, fh);
  ctx.restore();
  bgCache = { w: width, h: height, c };
  return c;
}

const easeOutBack = (x: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

export function drawZoneField(ctx: CanvasRenderingContext2D, width: number, height: number, s: DrawState) {
  const k = Math.min(width / FIELD.w, height / FIELD.h);
  const ox = (width - FIELD.w * k) / 2;
  const oy = (height - FIELD.h * k) / 2;
  const X = (x: number) => ox + x * k;
  const Y = (y: number) => oy + y * k;
  const fw = FIELD.w * k;
  const fh = FIELD.h * k;

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(background(width, height), 0, 0);

  const wave = s.wave;
  const appear = wave ? Math.min(1, Math.max(0, s.sinceWaveMs / 550)) : 0;
  const scale = wave ? easeOutBack(appear) : 0;
  const seated = wave ? wave.zones.map((_, zi) => s.robots.filter((r) => !r.out && r.seat === zi + 1).length) : [];

  // ---- Tuzoqlar ----
  if (wave) {
    for (const tr of wave.traps) {
      const x = X(tr.x);
      const y = Y(tr.y);
      const r = tr.r * k * scale;
      if (r <= 0) continue;
      if (tr.kind === "slow") {
        // Binafsha loy: to'lqinsimon chekka va pufakchalar
        ctx.save();
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, "rgba(168,85,247,0.55)");
        g.addColorStop(1, "rgba(88,28,135,0.35)");
        ctx.fillStyle = g;
        ctx.beginPath();
        for (let i = 0; i <= 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          const rr = r * (1 + Math.sin(a * 5 + s.t * 2 + tr.id) * 0.06);
          ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(216,180,254,0.5)";
        ctx.lineWidth = Math.max(1, k * 0.2);
        ctx.stroke();
        ctx.fillStyle = "rgba(233,213,255,0.55)";
        for (let b = 0; b < 3; b++) {
          const ph = (s.t * 0.8 + b / 3 + tr.id * 0.37) % 1;
          ctx.beginPath();
          ctx.arc(x + Math.cos(b * 2.1 + tr.id) * r * 0.45, y + Math.sin(b * 2.1 + tr.id) * r * 0.45, k * 0.3 * (0.5 + ph), 0, Math.PI * 2);
          ctx.fill();
        }
        if (r > k * 3) {
          ctx.font = `800 ${Math.max(9, k * 1.4)}px system-ui, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = "rgba(243,232,255,0.65)";
          ctx.fillText("LOY", x, y);
        }
        ctx.restore();
      } else {
        // Elektr pad: yoniq — chaqmoqlar; o'chishiga/yonishiga oz qolganda miltillaydi
        const on = zapActive(tr, s.sinceWaveMs);
        const phase = (s.sinceWaveMs + tr.phase) % ZAP_PERIOD_MS;
        const soon = !on && ZAP_PERIOD_MS - phase < 500;
        ctx.save();
        ctx.fillStyle = on ? "rgba(250,204,21,0.35)" : soon && Math.floor(s.t * 16) % 2 ? "rgba(250,204,21,0.22)" : "rgba(51,65,85,0.6)";
        ctx.strokeStyle = on ? "#fde047" : "rgba(148,163,184,0.7)";
        ctx.lineWidth = Math.max(1.5, k * 0.3);
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i * Math.PI) / 3;
          ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        // Belgisi
        ctx.fillStyle = on ? "#fef08a" : "rgba(203,213,225,0.8)";
        ctx.beginPath();
        const z = r * 0.55;
        ctx.moveTo(x + z * 0.15, y - z);
        ctx.lineTo(x - z * 0.45, y + z * 0.1);
        ctx.lineTo(x - z * 0.02, y + z * 0.1);
        ctx.lineTo(x - z * 0.15, y + z);
        ctx.lineTo(x + z * 0.45, y - z * 0.1);
        ctx.lineTo(x + z * 0.02, y - z * 0.1);
        ctx.closePath();
        ctx.fill();
        if (on) {
          ctx.strokeStyle = "rgba(254,240,138,0.9)";
          ctx.lineWidth = Math.max(1, k * 0.18);
          for (let b = 0; b < 3; b++) {
            const a0 = s.t * 9 + b * 2.1 + Math.sin(s.t * 31 + b) * 0.6;
            ctx.beginPath();
            ctx.moveTo(x + Math.cos(a0) * r * 0.3, y + Math.sin(a0) * r * 0.3);
            for (let j = 1; j <= 3; j++) {
              const rr = r * (0.3 + j * 0.3);
              const aj = a0 + (Math.random() - 0.5) * 0.5;
              ctx.lineTo(x + Math.cos(aj) * rr, y + Math.sin(aj) * rr);
            }
            ctx.stroke();
          }
        }
        ctx.restore();
      }
    }
  }

  // ---- Zona yopilganda tashqarisi qizarib ketadi ----
  if (wave && s.lock) {
    ctx.save();
    ctx.fillStyle = `rgba(239,68,68,${0.3 + Math.sin(s.t * 12) * 0.08})`;
    ctx.beginPath();
    ctx.rect(ox, oy, fw, fh);
    for (const z of wave.zones) {
      ctx.moveTo(X(z.cx) + z.r * k, Y(z.cy));
      ctx.arc(X(z.cx), Y(z.cy), z.r * k, 0, Math.PI * 2, true);
    }
    ctx.fill("evenodd");
    ctx.restore();
  }

  // ---- Xavfsiz zonalar ----
  if (wave) {
    wave.zones.forEach((z, zi) => {
      const x = X(z.cx);
      const y = Y(z.cy);
      const r = z.r * k * scale;
      if (r <= 0) return;
      const full = z.cap > 0 && seated[zi] >= z.cap;
      const pulse = 1 + Math.sin(s.t * 4 + zi) * 0.02;
      // Nur ustuni (paydo bo'lganda yorqinroq)
      const beam = ctx.createRadialGradient(x, y, 0, x, y, r * 1.35);
      const a0 = full ? "rgba(250,204,21,0.32)" : "rgba(74,222,128,0.38)";
      beam.addColorStop(0, appear < 1 ? (full ? "rgba(250,204,21,0.6)" : "rgba(134,239,172,0.7)") : a0);
      beam.addColorStop(0.75, full ? "rgba(234,179,8,0.2)" : "rgba(34,197,94,0.24)");
      beam.addColorStop(1, "rgba(34,197,94,0)");
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.35, 0, Math.PI * 2);
      ctx.fill();
      // Paydo bo'lish to'lqini
      if (appear < 1) {
        ctx.strokeStyle = `rgba(187,247,208,${1 - appear})`;
        ctx.lineWidth = Math.max(2, k * 0.6);
        ctx.beginPath();
        ctx.arc(x, y, z.r * k * (1 + appear * 1.2), 0, Math.PI * 2);
        ctx.stroke();
      }
      // Ichki aylanuvchi halqalar
      ctx.save();
      ctx.lineWidth = Math.max(2, k * 0.5);
      ctx.strokeStyle = s.lock ? "#bbf7d0" : full ? "#facc15" : "#4ade80";
      ctx.setLineDash([k * 2, k * 1.2]);
      ctx.lineDashOffset = -s.t * k * 6 * (zi % 2 ? -1 : 1);
      ctx.beginPath();
      ctx.arc(x, y, r * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = full ? "rgba(250,204,21,0.25)" : "rgba(134,239,172,0.25)";
      ctx.lineWidth = Math.max(1, k * 0.25);
      ctx.beginPath();
      ctx.arc(x, y, r * 0.65, s.t * 1.5, s.t * 1.5 + Math.PI * 1.3);
      ctx.stroke();
      ctx.restore();
      // Qolgan vaqt — zona atrofidagi yoy
      if (s.timeLeft !== null && !s.lock) {
        ctx.lineWidth = Math.max(3, k * 0.8);
        ctx.strokeStyle = s.timeLeft < 0.3 ? "#f87171" : "#fde047";
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(x, y, r + k * 1.4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * s.timeLeft);
        ctx.stroke();
        ctx.lineCap = "butt";
      }
      // Joylar: "3/6" va nuqtachalar
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // Yorliq zona tepasida (robotlar ostida qolib ketmasin)
      const badge = (label: string, bg: string, fg: string) => {
        ctx.font = `900 ${Math.max(11, k * 2.2)}px system-ui, sans-serif`;
        const w = ctx.measureText(label).width + k * 2.4;
        const h = Math.max(16, k * 3.2);
        const by = Math.max(oy + h / 2 + 2, y - r - k * 3.4);
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.roundRect(x - w / 2, by - h / 2, w, h, h / 2);
        ctx.fill();
        ctx.fillStyle = fg;
        ctx.fillText(label, x, by + 1);
      };
      if (z.cap > 0) {
        badge(full ? `TO'LA ${z.cap}/${z.cap}` : `👤 ${seated[zi]}/${z.cap}`, full ? "rgba(234,179,8,0.92)" : "rgba(22,101,52,0.9)", full ? "#1c1917" : "#dcfce7");
        // Nuqtachalar zona chetida
        const n = z.cap;
        const pr = Math.max(1.5, k * 0.45);
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
          const px = x + Math.cos(a) * (r - pr * 2.2);
          const py = y + Math.sin(a) * (r - pr * 2.2);
          ctx.fillStyle = i < seated[zi] ? (full ? "#facc15" : "#4ade80") : "rgba(15,23,42,0.6)";
          ctx.strokeStyle = "rgba(220,252,231,0.6)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(px, py, pr, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      } else {
        badge("HAMMA UCHUN", "rgba(22,101,52,0.9)", "#dcfce7");
      }
    });
  }

  // ---- Yo'l ko'rsatkich (o'zidan eng yaqin bo'sh zonaga) ----
  const mine = s.robots.find((r) => r.me);
  if (s.guide && mine && !mine.out && !s.lock) {
    const d = Math.hypot(s.guide.x - mine.x, s.guide.y - mine.y);
    if (d > 3) {
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = Math.max(1.5, k * 0.3);
      ctx.setLineDash([k * 1, k * 1.2]);
      ctx.lineDashOffset = -s.t * k * 8;
      ctx.beginPath();
      ctx.moveTo(X(mine.x), Y(mine.y));
      ctx.lineTo(X(s.guide.x), Y(s.guide.y));
      ctx.stroke();
      ctx.restore();
    }
  }
  // Bosilgan nuqta
  if (s.target && mine && !mine.out) {
    const pr = (s.t * 2) % 1;
    ctx.strokeStyle = `rgba(255,255,255,${0.8 - pr * 0.6})`;
    ctx.lineWidth = Math.max(1.5, k * 0.25);
    ctx.beginPath();
    ctx.arc(X(s.target.x), Y(s.target.y), k * (0.6 + pr * 1.4), 0, Math.PI * 2);
    ctx.stroke();
  }

  // ---- Yulduzlar ----
  for (const st of s.stars) {
    const x = X(st.x);
    const y = Y(st.y);
    const rr = STAR_R * k * (1 + Math.sin(s.t * 5 + st.id) * 0.12) * scale;
    if (rr <= 0) continue;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rr * 2.2);
    g.addColorStop(0, "rgba(250,204,21,0.45)");
    g.addColorStop(1, "rgba(250,204,21,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rr * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fde047";
    starPath(ctx, x, y, rr, s.t + st.id);
    ctx.fill();
  }

  // ---- Izlar ----
  for (const r of s.robots) {
    s.fx.trail(r.id, r.x, r.y, Boolean(r.moving) && !r.out);
    const tr = s.fx.trails.get(r.id);
    if (!tr || tr.length < 2) continue;
    const color = ROBOT_COLORS[r.color % ROBOT_COLORS.length];
    ctx.fillStyle = color;
    tr.forEach((p, i) => {
      ctx.globalAlpha = (i / tr.length) * 0.35;
      ctx.beginPath();
      ctx.arc(X(p.x), Y(p.y), ROBOT_R * k * (0.25 + (i / tr.length) * 0.4), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  // ---- Robotlar: o'chganlari pastda, o'zi eng ustida. Telefonda ism faqat yaqin turganlarda ----
  const labelled = (r: DrawRobot) => s.labels === "all" || r.me || (mine !== undefined && Math.hypot(r.x - mine.x, r.y - mine.y) < 22);
  const order = [...s.robots].sort((a, b) => Number(!a.out) - Number(!b.out) || Number(Boolean(a.me)) - Number(Boolean(b.me)));
  for (const r of order) {
    const x = X(r.x);
    const y = Y(r.y);
    const rad = ROBOT_R * k;
    const color = r.out ? "#475569" : ROBOT_COLORS[r.color % ROBOT_COLORS.length];
    const bob = r.out ? 0 : Math.sin(s.t * (r.moving ? 14 : 3) + r.color) * rad * (r.moving ? 0.12 : 0.06);
    const sprite = r.look !== undefined ? characterSprite(r.look) : null;
    ctx.save();
    ctx.globalAlpha = r.out ? 0.45 : 1;
    // Soya
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(x, y + rad * 0.95, rad * 0.9, rad * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    // Joy holati: joyli — yashil halqa, joy yetmadi — qizil miltillash
    if (!r.out && r.seat > 0) {
      ctx.strokeStyle = "rgba(74,222,128,0.9)";
      ctx.lineWidth = Math.max(1.5, k * 0.3);
      ctx.beginPath();
      ctx.arc(x, y, rad * 1.45, 0, Math.PI * 2);
      ctx.stroke();
    } else if (!r.out && r.seat < 0) {
      ctx.strokeStyle = Math.floor(s.t * 6) % 2 ? "rgba(248,113,113,0.95)" : "rgba(248,113,113,0.3)";
      ctx.lineWidth = Math.max(1.5, k * 0.3);
      ctx.beginPath();
      ctx.arc(x, y, rad * 1.45, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (r.me && !r.out) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = Math.max(2, k * 0.35);
      ctx.beginPath();
      ctx.arc(x, y, rad + k * 1.1 + Math.sin(s.t * 6) * k * 0.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (sprite) {
      // Personaj: oyoqlari robot o'rnida, yo'nalishiga qarab ko'zgu aksi
      drawCharacterSprite(ctx, sprite, x, y + rad * 1.05, rad * 3.6, { t: s.t, moving: r.moving, faceLeft: (r.dx ?? 0) < -0.05, out: r.out, seed: r.color });
      if (r.stunned && !r.out) {
        ctx.strokeStyle = "#fde047";
        ctx.lineWidth = Math.max(1, k * 0.2);
        for (let b = 0; b < 3; b++) {
          const a = s.t * 12 + b * 2.1;
          ctx.beginPath();
          ctx.moveTo(x + Math.cos(a) * rad * 1.3, y - rad + Math.sin(a) * rad * 1.3);
          ctx.lineTo(x + Math.cos(a + 0.4) * rad * 1.9, y - rad + Math.sin(a + 0.4) * rad * 1.9);
          ctx.stroke();
        }
      }
      ctx.restore();
      if (labelled(r)) {
        ctx.font = `800 ${Math.max(10, k * (r.me ? 2 : 1.7))}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillStyle = r.out ? "rgba(148,163,184,0.7)" : "#fff";
        ctx.strokeStyle = "rgba(2,6,23,0.7)";
        ctx.lineWidth = Math.max(2, k * 0.35);
        const name = r.me ? "Siz" : r.name.length > 12 ? `${r.name.slice(0, 11)}…` : r.name;
        ctx.strokeText(name, x, y - rad * 2.7);
        ctx.fillText(name, x, y - rad * 2.7);
      }
      if (!r.out && r.seat < 0) {
        ctx.font = `900 ${Math.max(10, k * 1.8)}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = "#fca5a5";
        ctx.fillText("joy yo'q!", x, y + rad * 1.3);
      }
      continue;
    }
    ctx.translate(0, -bob);
    // Antenna
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, k * 0.25);
    ctx.beginPath();
    ctx.moveTo(x, y - rad * 0.8);
    ctx.lineTo(x, y - rad * 1.45);
    ctx.stroke();
    ctx.fillStyle = r.out ? "#64748b" : Math.floor(s.t * 3 + r.color) % 2 ? "#fef08a" : "#f87171";
    ctx.beginPath();
    ctx.arc(x, y - rad * 1.5, rad * 0.22, 0, Math.PI * 2);
    ctx.fill();
    // Tana (yorug'lik gradienti bilan)
    const body = ctx.createLinearGradient(x, y - rad, x, y + rad);
    body.addColorStop(0, r.out ? "#64748b" : "#ffffff");
    body.addColorStop(0.25, color);
    body.addColorStop(1, r.out ? "#334155" : color);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.roundRect(x - rad, y - rad * 0.85, rad * 2, rad * 1.7, rad * 0.55);
    ctx.fill();
    // Ko'zlar
    const len = Math.hypot(r.dx ?? 0, r.dy ?? 0) || 1;
    const lx = ((r.dx ?? 0) / len) * rad * 0.18;
    const ly = ((r.dy ?? 0) / len) * rad * 0.18;
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.roundRect(x - rad * 0.75, y - rad * 0.45, rad * 1.5, rad * 0.75, rad * 0.3);
    ctx.fill();
    if (r.out || r.stunned) {
      ctx.strokeStyle = r.out ? "#f87171" : "#fde047";
      ctx.lineWidth = Math.max(1.5, k * 0.25);
      for (const ex of [-0.35, 0.35]) {
        ctx.beginPath();
        ctx.moveTo(x + rad * (ex - 0.15), y - rad * 0.22);
        ctx.lineTo(x + rad * (ex + 0.15), y + rad * 0.12);
        ctx.moveTo(x + rad * (ex + 0.15), y - rad * 0.22);
        ctx.lineTo(x + rad * (ex - 0.15), y + rad * 0.12);
        ctx.stroke();
      }
    } else {
      const blink = Math.floor(s.t * 0.7 + r.color * 0.13) !== Math.floor(s.t * 0.7 + r.color * 0.13 + 0.06);
      ctx.fillStyle = "#67e8f9";
      for (const ex of [-0.35, 0.35]) {
        ctx.beginPath();
        if (blink) ctx.rect(x + rad * ex + lx - rad * 0.17, y - rad * 0.1 + ly, rad * 0.34, rad * 0.06);
        else ctx.arc(x + rad * ex + lx, y - rad * 0.08 + ly, rad * 0.17, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Qotib qolgan — atrofida uchqunlar
    if (r.stunned && !r.out) {
      ctx.strokeStyle = "#fde047";
      ctx.lineWidth = Math.max(1, k * 0.2);
      for (let b = 0; b < 3; b++) {
        const a = s.t * 12 + b * 2.1;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * rad * 1.1, y + Math.sin(a) * rad * 1.1);
        ctx.lineTo(x + Math.cos(a + 0.4) * rad * 1.6, y + Math.sin(a + 0.4) * rad * 1.6);
        ctx.stroke();
      }
    }
    ctx.restore();
    // Ism
    if (labelled(r)) {
      ctx.font = `800 ${Math.max(10, k * (r.me ? 2 : 1.7))}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = r.out ? "rgba(148,163,184,0.7)" : "#fff";
      ctx.strokeStyle = "rgba(2,6,23,0.7)";
      ctx.lineWidth = Math.max(2, k * 0.35);
      const name = r.me ? "Siz" : r.name.length > 12 ? `${r.name.slice(0, 11)}…` : r.name;
      ctx.strokeText(name, x, y - rad * 1.95 - bob);
      ctx.fillText(name, x, y - rad * 1.95 - bob);
    }
    if (!r.out && r.seat < 0) {
      ctx.font = `900 ${Math.max(10, k * 1.8)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#fca5a5";
      ctx.fillText("joy yo'q!", x, y + rad * 1.2);
    }
  }

  // ---- Effektlar ----
  for (const rg of s.fx.rings) {
    const p = 1 - rg.life / rg.max;
    ctx.strokeStyle = rg.color;
    ctx.globalAlpha = 1 - p;
    ctx.lineWidth = Math.max(2, k * 0.5);
    ctx.beginPath();
    ctx.arc(X(rg.x), Y(rg.y), rg.r * k * (0.3 + p), 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const p of s.fx.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(X(p.x), Y(p.y), p.size * k, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const t of s.fx.texts) {
    ctx.globalAlpha = Math.min(1, (t.life / t.max) * 1.5);
    ctx.font = `900 ${Math.max(12, k * 2.4)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.strokeStyle = "rgba(2,6,23,0.8)";
    ctx.lineWidth = Math.max(2, k * 0.4);
    ctx.strokeText(t.text, X(t.x), Y(t.y));
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, X(t.x), Y(t.y));
  }
  ctx.globalAlpha = 1;

  // Chegara
  ctx.strokeStyle = s.lock ? "rgba(248,113,113,0.7)" : "rgba(74,222,128,0.6)";
  ctx.lineWidth = 2;
  ctx.strokeRect(ox, oy, fw, fh);
}

/** Ekrandagi nuqtani maydon koordinatasiga */
export function toField(width: number, height: number, px: number, py: number): { x: number; y: number } {
  const k = Math.min(width / FIELD.w, height / FIELD.h);
  const ox = (width - FIELD.w * k) / 2;
  const oy = (height - FIELD.h * k) / 2;
  return { x: Math.max(0, Math.min(FIELD.w, (px - ox) / k)), y: Math.max(0, Math.min(FIELD.h, (py - oy) / k)) };
}
