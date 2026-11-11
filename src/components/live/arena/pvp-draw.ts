// "Kiber jang" chizmalari (canvas): xarita, qahramonlar, o'qlar, sovg'alar. O'quvchi va proyektor bir xil ko'radi.

import { BUSHES, MAP_H, MAP_W, PLAYER_R, POWERS, PVP_WALLS, TELEPORTS, TELEPORT_R, skinOf, type PowerKind, type Shot } from "@/lib/live-game/pvp";

export const PEER_COLORS = ["#f472b6", "#a78bfa", "#fb923c", "#4ade80", "#facc15", "#60a5fa", "#f87171", "#2dd4bf", "#e879f9", "#a3e635"];

/** Bazalar (burchaklar) rangi */
const BASES = [
  { x: 240, y: 240, c: "34,211,238" },
  { x: 2160, y: 240, c: "244,114,182" },
  { x: 240, y: 1160, c: "163,230,53" },
  { x: 2160, y: 1160, c: "245,158,11" },
];

/** Qo'zg'almas pol: fon, bazalar, plitkalar, yo'laklar, chegara (bir marta chiziladi) */
function drawFloorStatic(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#0b1226";
  ctx.fillRect(0, 0, MAP_W, MAP_H);
  for (const b of BASES) {
    const g = ctx.createRadialGradient(b.x, b.y, 10, b.x, b.y, 420);
    g.addColorStop(0, `rgba(${b.c},0.20)`);
    g.addColorStop(1, `rgba(${b.c},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(b.x - 420, b.y - 420, 840, 840);
  }
  ctx.strokeStyle = "rgba(99,102,241,0.10)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= MAP_W; x += 80) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, MAP_H);
  }
  for (let y = 0; y <= MAP_H; y += 80) {
    ctx.moveTo(0, y);
    ctx.lineTo(MAP_W, y);
  }
  ctx.stroke();
  ctx.strokeStyle = "rgba(56,189,248,0.10)";
  ctx.lineWidth = 26;
  ctx.beginPath();
  ctx.moveTo(240, 700);
  ctx.lineTo(MAP_W - 240, 700);
  ctx.moveTo(1200, 160);
  ctx.lineTo(1200, MAP_H - 160);
  ctx.stroke();
  ctx.save();
  ctx.shadowColor = "#a855f7";
  ctx.shadowBlur = 24;
  ctx.strokeStyle = "rgba(192,132,252,0.95)";
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, MAP_W - 8, MAP_H - 8);
  ctx.restore();
}

/** Harakatlanuvchi qism: markaz pulsi va teleportlar */
function drawFloorLive(ctx: CanvasRenderingContext2D, t: number) {
  const pulse = 0.16 + Math.sin(t * 2) * 0.05;
  ctx.fillStyle = `rgba(168,85,247,${pulse})`;
  ctx.beginPath();
  ctx.arc(MAP_W / 2, MAP_H / 2, 150 + Math.sin(t * 2) * 10, 0, Math.PI * 2);
  ctx.fill();
  for (const tp of TELEPORTS) {
    for (const p of [tp.a, tp.b]) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.strokeStyle = tp.color;
      ctx.lineWidth = 5;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(0, 0, TELEPORT_R - i * 9, t * (2 + i) + i, t * (2 + i) + i + Math.PI * 1.3);
        ctx.stroke();
      }
      ctx.fillStyle = tp.color;
      ctx.globalAlpha = 0.25 + Math.sin(t * 5) * 0.1;
      ctx.beginPath();
      ctx.arc(0, 0, TELEPORT_R - 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

/** Xaritaning qo'zg'almas qatlamlari oldindan chiziladi: har kadrda faqat tayyor rasm qo'yiladi (telefonda tez) */
export interface MapLayers {
  base: HTMLCanvasElement;
  top: HTMLCanvasElement;
}
const LAYER_Q = 0.7;
export function makeMapLayers(): MapLayers {
  const mk = () => {
    const c = document.createElement("canvas");
    c.width = Math.round(MAP_W * LAYER_Q);
    c.height = Math.round(MAP_H * LAYER_Q);
    const x = c.getContext("2d")!;
    x.scale(LAYER_Q, LAYER_Q);
    return { c, x };
  };
  const base = mk();
  drawFloorStatic(base.x);
  drawWalls(base.x);
  const top = mk();
  drawBushes(top.x, 0);
  return { base: base.c, top: top.c };
}

export function drawFloor(ctx: CanvasRenderingContext2D, t: number, layers?: MapLayers) {
  ctx.fillStyle = "#070b18";
  ctx.fillRect(-600, -600, MAP_W + 1200, MAP_H + 1200);
  if (layers) ctx.drawImage(layers.base, 0, 0, MAP_W, MAP_H);
  else {
    drawFloorStatic(ctx);
    drawWalls(ctx);
  }
  drawFloorLive(ctx, t);
}

export function drawTop(ctx: CanvasRenderingContext2D, t: number, layers?: MapLayers) {
  if (layers) ctx.drawImage(layers.top, 0, 0, MAP_W, MAP_H);
  else drawBushes(ctx, t);
}

export function drawWalls(ctx: CanvasRenderingContext2D) {
  ctx.save();
  for (const w of PVP_WALLS) {
    const box = w.w === w.h;
    ctx.fillStyle = box ? "#1b2440" : "#121a33";
    ctx.shadowColor = box ? "#f59e0b" : "#38bdf8";
    ctx.shadowBlur = 16;
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = box ? "rgba(251,191,36,0.9)" : "rgba(56,189,248,0.9)";
    ctx.lineWidth = 4;
    ctx.strokeRect(w.x + 2, w.y + 2, w.w - 4, w.h - 4);
    if (box) {
      // Quti: diagonal chiziqlar
      ctx.strokeStyle = "rgba(251,191,36,0.35)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(w.x + 8, w.y + 8);
      ctx.lineTo(w.x + w.w - 8, w.y + w.h - 8);
      ctx.moveTo(w.x + w.w - 8, w.y + 8);
      ctx.lineTo(w.x + 8, w.y + w.h - 8);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawBushes(ctx: CanvasRenderingContext2D, t: number) {
  ctx.save();
  for (const b of BUSHES) {
    const n = Math.round((b.w * b.h) / 2600);
    for (let i = 0; i < n; i++) {
      const fx = ((i * 73) % 97) / 97;
      const fy = ((i * 41) % 89) / 89;
      const x = b.x + 18 + fx * (b.w - 36);
      const y = b.y + 18 + fy * (b.h - 36);
      const r = 26 + ((i * 13) % 14) + Math.sin(t * 2 + i) * 1.5;
      ctx.fillStyle = i % 3 === 0 ? "rgba(34,197,94,0.92)" : i % 3 === 1 ? "rgba(22,163,74,0.92)" : "rgba(21,128,61,0.94)";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function drawPickup(ctx: CanvasRenderingContext2D, p: { x: number; y: number; kind: PowerKind }, t: number) {
  const def = POWERS[p.kind];
  const bob = Math.sin(t * 4 + p.x) * 4;
  ctx.save();
  ctx.translate(p.x, p.y + bob);
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = def.color;
  ctx.beginPath();
  ctx.arc(0, 0, 36, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(2,6,23,0.85)";
  ctx.beginPath();
  ctx.arc(0, 0, 25, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = def.color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 25, t * 3, t * 3 + Math.PI * 1.6);
  ctx.stroke();
  ctx.font = "26px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = def.color;
  ctx.fillText(def.icon, 0, 2);
  ctx.restore();
}

export function drawShot(ctx: CanvasRenderingContext2D, s: Shot, color: string) {
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(s.x, s.y);
  ctx.lineTo(s.x - s.vx * 0.03, s.y - s.vy * 0.03);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 5;
  ctx.stroke();
}

export interface RobotLook {
  x: number;
  y: number;
  a: number;
  skin: string;
  shield?: boolean;
  powers?: PowerKind[];
  /** Zarba olgan zahoti oq chaqnaydi */
  flash?: boolean;
  /** Butada (yarim shaffof) */
  ghost?: boolean;
  out?: boolean;
  moving?: boolean;
  /** Kattalashtirish (proyektorda butun xarita kichik ko'rinadi) */
  size?: number;
}

export function drawRobot(ctx: CanvasRenderingContext2D, r: RobotLook, t: number) {
  const skin = skinOf(r.skin);
  const R = PLAYER_R;
  ctx.save();
  ctx.translate(r.x, r.y);
  if (r.size && r.size !== 1) ctx.scale(r.size, r.size);
  ctx.globalAlpha = r.out ? 0.3 : r.ghost ? 0.45 : 1;
  // Tezlik izi
  if (r.powers?.includes("speed") && !r.out) {
    ctx.fillStyle = "rgba(250,204,21,0.35)";
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(-Math.cos(r.a) * i * 12, -Math.sin(r.a) * i * 12, R - i * 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Soya
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(4, R * 0.9, R * 0.9, R * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(r.a);
  // Oyoqlar (yurganda qadam tashlaydi)
  const step = r.moving ? Math.sin(t * 18) * 5 : 0;
  ctx.fillStyle = skin.accent;
  ctx.fillRect(-R * 0.6 + step, -R - 4, R * 0.9, 8);
  ctx.fillRect(-R * 0.6 - step, R - 4, R * 0.9, 8);
  // Qurol stvoli
  const triple = r.powers?.includes("triple");
  const rapid = r.powers?.includes("rapid");
  ctx.fillStyle = rapid ? "#fb923c" : "#334155";
  if (triple) {
    ctx.save();
    for (const da of [-0.35, 0, 0.35]) {
      ctx.save();
      ctx.rotate(da);
      ctx.fillRect(R - 6, -4, 20, 8);
      ctx.restore();
    }
    ctx.restore();
  } else ctx.fillRect(R - 6, -5, 22, 10);
  // Tana
  ctx.fillStyle = r.flash ? "#ffffff" : r.out ? "#475569" : skin.body;
  ctx.beginPath();
  if (skin.shape === "square") ctx.roundRect(-R, -R, R * 2, R * 2, 8);
  else if (skin.shape === "hex") {
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      ctx.lineTo(Math.cos(ang) * (R + 2), Math.sin(ang) * (R + 2));
    }
    ctx.closePath();
  } else ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = skin.accent;
  ctx.lineWidth = 3;
  ctx.stroke();
  // Visor va ko'zlar
  ctx.fillStyle = "#0b1020";
  ctx.beginPath();
  ctx.roundRect(R * 0.05, -R * 0.55, R * 0.75, R * 1.1, 6);
  ctx.fill();
  const blink = Math.sin(t * 3 + r.x) > 0.97 ? 0.2 : 1;
  ctx.fillStyle = r.out ? "#64748b" : "#e0f2fe";
  ctx.beginPath();
  ctx.ellipse(R * 0.5, -R * 0.25, 3.5, 4.5 * blink, 0, 0, Math.PI * 2);
  ctx.ellipse(R * 0.5, R * 0.25, 3.5, 4.5 * blink, 0, 0, Math.PI * 2);
  ctx.fill();
  // Antenna
  ctx.strokeStyle = skin.accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-R * 0.4, 0);
  ctx.lineTo(-R - 6, Math.sin(t * 6) * 4);
  ctx.stroke();
  ctx.fillStyle = r.out ? "#64748b" : "#f43f5e";
  ctx.beginPath();
  ctx.arc(-R - 6, Math.sin(t * 6) * 4, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(-r.a);
  // Qalqon pufagi
  if (r.shield && !r.out) {
    ctx.strokeStyle = `rgba(56,189,248,${0.6 + Math.sin(t * 8) * 0.25})`;
    ctx.fillStyle = "rgba(56,189,248,0.12)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, R + 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** Ism va jonlar (yuraklar) qahramon tepasida */
export function nameTag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, lives: number, maxLives: number, size = 1) {
  ctx.save();
  if (size !== 1) {
    ctx.translate(x, y);
    ctx.scale(size, size);
    ctx.translate(-x, -y);
  }
  ctx.font = "bold 20px ui-sans-serif, system-ui, sans-serif";
  const label = text.length > 16 ? `${text.slice(0, 15)}…` : text;
  const w = ctx.measureText(label).width + 18;
  ctx.fillStyle = "rgba(2,6,23,0.78)";
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - 30, w, 26, 9);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x, y - 17);
  // Yuraklar
  const n = Math.max(maxLives, lives);
  const gap = 15;
  const start = x - ((n - 1) * gap) / 2;
  ctx.font = "13px system-ui, sans-serif";
  for (let i = 0; i < n; i++) {
    ctx.globalAlpha = i < lives ? 1 : 0.25;
    ctx.fillStyle = i < lives ? "#f43f5e" : "#94a3b8";
    ctx.fillText("❤", start + i * gap, y + 6);
  }
  ctx.restore();
}

export function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PEER_COLORS[h % PEER_COLORS.length];
}

export interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export function burst(list: Spark[], x: number, y: number, color: string, n = 14) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 80 + Math.random() * 300;
    list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + Math.random() * 0.45, color });
  }
}

export function stepSparks(list: Spark[], dt: number) {
  for (const p of list) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.9;
    p.vy *= 0.9;
    p.life -= dt;
  }
  for (let i = list.length - 1; i >= 0; i--) if (list[i].life <= 0) list.splice(i, 1);
}

export function drawSparks(ctx: CanvasRenderingContext2D, list: Spark[]) {
  for (const p of list) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2.5));
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
  }
  ctx.globalAlpha = 1;
}

/** Server bergan "boshqalarning o'qlari": har birini bir marta, yoshiga qarab oldinga surib qo'shamiz */
export function spawnForeignShots(
  into: Shot[],
  seen: Map<string, number>,
  peers: { id: string; shots: { id: number; x: number; y: number; a: number; age: number }[] }[],
  now: number,
  speed: number,
  range: number
) {
  for (const p of peers) {
    for (const s of p.shots) {
      const key = `${p.id}:${s.id}`;
      if (seen.has(key)) continue;
      seen.set(key, now);
      // Uchib bo'lgan masofasi uzoq bo'lsa — ko'rsatmaymiz; aks holda boshidan uchiramiz (devordan o'tib ketmasin)
      if ((s.age / 1000) * speed > range * 0.8) continue;
      into.push({ id: s.id, owner: p.id, x: s.x, y: s.y, vx: Math.cos(s.a) * speed, vy: Math.sin(s.a) * speed, dist: 0 });
    }
  }
  if (seen.size > 600) for (const [k, at] of seen) if (now - at > 3000) seen.delete(k);
}
