// "Kiber jang" chizmalari (canvas): xarita, qahramonlar, o'qlar, sovg'alar. O'quvchi va proyektor bir xil ko'radi.

import { DEFAULT_MAP, EMOTES, PLAYER_R, POWERS, TELEPORT_R, skinOf, type ArenaMap, type PowerKind, type Shot } from "@/lib/live-game/pvp";

export const PEER_COLORS = ["#f472b6", "#a78bfa", "#fb923c", "#4ade80", "#facc15", "#60a5fa", "#f87171", "#2dd4bf", "#e879f9", "#a3e635"];

/** Qo'zg'almas pol: fon, bazalar, plitkalar, yo'laklar, chegara (bir marta chiziladi) */
function drawFloorStatic(ctx: CanvasRenderingContext2D, map: ArenaMap) {
  const { w: W, h: H, theme } = map;
  ctx.fillStyle = theme.floor;
  ctx.fillRect(0, 0, W, H);
  // Yulduzlar (kosmik xarita)
  if (theme.stars) {
    for (let i = 0; i < 260; i++) {
      const x = (i * 7919) % W;
      const y = (i * 104729) % H;
      ctx.fillStyle = `rgba(255,255,255,${0.15 + ((i * 37) % 60) / 100})`;
      ctx.fillRect(x, y, i % 9 === 0 ? 3 : 2, i % 9 === 0 ? 3 : 2);
    }
  }
  map.bases.forEach((b, i) => {
    const c = theme.bases[i % theme.bases.length];
    const g = ctx.createRadialGradient(b.x, b.y, 10, b.x, b.y, 460);
    g.addColorStop(0, `rgba(${c},0.22)`);
    g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(b.x - 460, b.y - 460, 920, 920);
  });
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 80) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
  }
  for (let y = 0; y <= H; y += 80) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();
  // Asosiy yo'laklar (markazdan o'tuvchi xoch)
  ctx.strokeStyle = `rgba(${theme.wallEdge},0.08)`;
  ctx.lineWidth = 30;
  ctx.beginPath();
  ctx.moveTo(240, H / 2);
  ctx.lineTo(W - 240, H / 2);
  ctx.moveTo(W / 2, 160);
  ctx.lineTo(W / 2, H - 160);
  ctx.stroke();
  // Tezlik yo'laklari: o'qchali chiziqlar
  for (const p of map.pads) {
    ctx.fillStyle = `rgba(${theme.pad},0.14)`;
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = `rgba(${theme.pad},0.55)`;
    ctx.lineWidth = 3;
    ctx.strokeRect(p.x + 1.5, p.y + 1.5, p.w - 3, p.h - 3);
    ctx.fillStyle = `rgba(${theme.pad},0.45)`;
    const horiz = p.w >= p.h;
    const n = Math.floor((horiz ? p.w : p.h) / 60);
    for (let i = 0; i < n; i++) {
      ctx.save();
      ctx.translate(horiz ? p.x + 30 + i * 60 : p.x + p.w / 2, horiz ? p.y + p.h / 2 : p.y + 30 + i * 60);
      if (!horiz) ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(-10, -12);
      ctx.lineTo(6, 0);
      ctx.lineTo(-10, 12);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.save();
  ctx.shadowColor = `rgb(${theme.edge})`;
  ctx.shadowBlur = 24;
  ctx.strokeStyle = `rgba(${theme.edge},0.95)`;
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, W - 8, H - 8);
  ctx.restore();
}

/** Harakatlanuvchi qism: markaz pulsi, teleportlar va tezlik yo'laklari yaltirashi */
function drawFloorLive(ctx: CanvasRenderingContext2D, t: number, map: ArenaMap) {
  const pulse = 0.14 + Math.sin(t * 2) * 0.05;
  ctx.fillStyle = `rgba(${map.theme.edge},${pulse})`;
  ctx.beginPath();
  ctx.arc(map.w / 2, map.h / 2, 160 + Math.sin(t * 2) * 10, 0, Math.PI * 2);
  ctx.fill();
  for (const p of map.pads) {
    const horiz = p.w >= p.h;
    const k = (t * 0.9) % 1;
    ctx.fillStyle = `rgba(${map.theme.pad},0.35)`;
    if (horiz) ctx.fillRect(p.x + k * (p.w - 40), p.y, 40, p.h);
    else ctx.fillRect(p.x, p.y + k * (p.h - 40), p.w, 40);
  }
  for (const tp of map.teleports) {
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
  map: ArenaMap;
}
const LAYER_Q = 0.6;
export function makeMapLayers(map: ArenaMap = DEFAULT_MAP, q = LAYER_Q): MapLayers {
  const mk = () => {
    const c = document.createElement("canvas");
    c.width = Math.round(map.w * q);
    c.height = Math.round(map.h * q);
    const x = c.getContext("2d")!;
    x.scale(q, q);
    return { c, x };
  };
  const base = mk();
  drawFloorStatic(base.x, map);
  drawWalls(base.x, map);
  const top = mk();
  drawBushes(top.x, 0, map);
  return { base: base.c, top: top.c, map };
}

export function drawFloor(ctx: CanvasRenderingContext2D, t: number, layers: MapLayers) {
  const map = layers.map;
  ctx.fillStyle = "#05070f";
  ctx.fillRect(-800, -800, map.w + 1600, map.h + 1600);
  ctx.drawImage(layers.base, 0, 0, map.w, map.h);
  drawFloorLive(ctx, t, map);
}

export function drawTop(ctx: CanvasRenderingContext2D, _t: number, layers: MapLayers) {
  ctx.drawImage(layers.top, 0, 0, layers.map.w, layers.map.h);
}

/** Ovoz berish kartasi uchun: butun xarita kichik rasmda */
export function drawMapPreview(canvas: HTMLCanvasElement, map: ArenaMap) {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(r.width * dpr));
  canvas.height = Math.max(1, Math.round(r.height * dpr));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const k = Math.min(canvas.width / map.w, canvas.height / map.h);
  ctx.setTransform(k, 0, 0, k, (canvas.width - map.w * k) / 2, (canvas.height - map.h * k) / 2);
  drawFloorStatic(ctx, map);
  drawWalls(ctx, map);
  drawFloorLive(ctx, 0.6, map);
  drawBushes(ctx, 0, map);
}

export function drawWalls(ctx: CanvasRenderingContext2D, map: ArenaMap = DEFAULT_MAP) {
  const th = map.theme;
  ctx.save();
  for (const w of map.walls) {
    const box = w.w === w.h;
    ctx.fillStyle = box ? th.box : th.wall;
    ctx.shadowColor = `rgb(${box ? th.boxEdge : th.wallEdge})`;
    ctx.shadowBlur = 16;
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(${box ? th.boxEdge : th.wallEdge},0.9)`;
    ctx.lineWidth = 4;
    ctx.strokeRect(w.x + 2, w.y + 2, w.w - 4, w.h - 4);
    if (box) {
      // Quti: diagonal chiziqlar
      ctx.strokeStyle = `rgba(${th.boxEdge},0.35)`;
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

export function drawBushes(ctx: CanvasRenderingContext2D, t: number, map: ArenaMap = DEFAULT_MAP) {
  const colors = map.theme.bush;
  ctx.save();
  for (const b of map.bushes) {
    const n = Math.round((b.w * b.h) / 2600);
    for (let i = 0; i < n; i++) {
      const fx = ((i * 73) % 97) / 97;
      const fy = ((i * 41) % 89) / 89;
      const x = b.x + 18 + fx * (b.w - 36);
      const y = b.y + 18 + fy * (b.h - 36);
      const r = 26 + ((i * 13) % 14) + Math.sin(t * 2 + i) * 1.5;
      ctx.fillStyle = colors[i % 3];
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
  /** Jamoaviy arenada jamoa rangidagi halqa */
  ring?: string | null;
  /** Hozirgina o'q uzdi (stvol uchida olov) */
  fired?: boolean;
  /** Sakrash (dash) davomida — orqasida iz */
  dash?: boolean;
}

export function drawRobot(ctx: CanvasRenderingContext2D, r: RobotLook, t: number) {
  const skin = skinOf(r.skin);
  const R = PLAYER_R;
  ctx.save();
  ctx.translate(r.x, r.y);
  if (r.size && r.size !== 1) ctx.scale(r.size, r.size);
  ctx.globalAlpha = r.out ? 0.3 : r.ghost ? 0.45 : 1;
  // Sakrash izi
  if (r.dash && !r.out) {
    ctx.fillStyle = skin.body;
    for (let i = 1; i <= 4; i++) {
      ctx.globalAlpha = 0.28 - i * 0.05;
      ctx.beginPath();
      ctx.arc(-Math.cos(r.a) * i * 16, -Math.sin(r.a) * i * 16, R - i * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = r.ghost ? 0.45 : 1;
  }
  // Jonli harakat: turganda "nafas oladi", yurganda qadamga qarab silkinadi
  const seed = (r.x * 0.013 + r.y * 0.007) % 6.28;
  const bob = r.out ? 0 : r.moving ? -Math.abs(Math.sin(t * 16)) * 3 : Math.sin(t * 2.6 + seed) * 1.4;
  const breathe = r.out ? 1 : 1 + Math.sin(t * 2.6 + seed) * 0.03;
  // Tezlik izi
  if (r.powers?.includes("speed") && !r.out) {
    ctx.fillStyle = "rgba(250,204,21,0.35)";
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(-Math.cos(r.a) * i * 12, -Math.sin(r.a) * i * 12, R - i * 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Jamoa halqasi (yerda)
  if (r.ring && !r.out) {
    ctx.strokeStyle = r.ring;
    ctx.lineWidth = 5;
    ctx.globalAlpha *= 0.9;
    ctx.beginPath();
    ctx.arc(0, 0, R + 9, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = r.ghost ? 0.45 : 1;
  }
  // Soya
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(4, R * 0.9, R * 0.9, R * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.translate(0, bob);
  ctx.scale(breathe, breathe);
  ctx.rotate(r.a);
  // Yurganda tana biroz egiladi
  if (r.moving && !r.out) ctx.rotate(Math.sin(t * 16) * 0.06);
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
  // Otganda stvol uchida olov
  if (r.fired && !r.out) {
    ctx.save();
    ctx.translate(R + 20, 0);
    ctx.fillStyle = "rgba(253,224,71,0.95)";
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const rr = i % 2 === 0 ? 14 : 6;
      ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
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
  if (r.out) {
    // Yiqilgan: ✕ ko'zlar
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (const ey of [-R * 0.25, R * 0.25]) {
      ctx.moveTo(R * 0.5 - 4, ey - 4);
      ctx.lineTo(R * 0.5 + 4, ey + 4);
      ctx.moveTo(R * 0.5 + 4, ey - 4);
      ctx.lineTo(R * 0.5 - 4, ey + 4);
    }
    ctx.stroke();
  } else {
    // Ko'z qisish (har qahramon o'z vaqtida) va oldinga qaragan qorachiq
    const blink = Math.sin(t * 1.7 + seed * 3) > 0.985 ? 0.15 : 1;
    ctx.fillStyle = r.flash ? "#fecaca" : "#e0f2fe";
    ctx.beginPath();
    ctx.ellipse(R * 0.5, -R * 0.25, 4, 5 * blink, 0, 0, Math.PI * 2);
    ctx.ellipse(R * 0.5, R * 0.25, 4, 5 * blink, 0, 0, Math.PI * 2);
    ctx.fill();
    if (blink > 0.5) {
      ctx.fillStyle = "#0b1020";
      ctx.beginPath();
      ctx.arc(R * 0.5 + 1.8, -R * 0.25, 1.8, 0, Math.PI * 2);
      ctx.arc(R * 0.5 + 1.8, R * 0.25, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
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

/** Emoji-reaksiya pufakchasi (ism ustida) */
export function drawEmote(ctx: CanvasRenderingContext2D, emote: number, x: number, y: number, t: number, size = 1) {
  const e = EMOTES[emote];
  if (!e) return;
  ctx.save();
  ctx.translate(x, y + Math.sin(t * 6) * 3);
  ctx.scale(size, size);
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath();
  ctx.roundRect(-26, -26, 52, 46, 16);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-7, 19);
  ctx.lineTo(0, 30);
  ctx.lineTo(7, 19);
  ctx.closePath();
  ctx.fill();
  ctx.font = "30px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(e, 0, -2);
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
