// "Yashil zona" maydonini chizish (canvas 2D): o'quvchi telefoni va proyektor uchun umumiy.
// Koordinatalar maydon birligida (FIELD.w × FIELD.h), chizishda ekranga moslanadi.

import { FIELD, ROBOT_COLORS, ROBOT_R, STAR_R, type ZoneWave } from "@/lib/live-game/zone";

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
}

export interface DrawState {
  wave: ZoneWave | null;
  /** To'lqin tugashigacha ulush (1 → 0); null — sanoq yoki tugagan */
  timeLeft: number | null;
  lock: boolean;
  stars: ZoneWave["stars"];
  robots: DrawRobot[];
  /** Ism yozuvlari (proyektorda — hammaga, telefonda — yaqinlarga) */
  labels: "all" | "near";
  t: number;
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

export function drawZoneField(ctx: CanvasRenderingContext2D, width: number, height: number, s: DrawState) {
  const k = Math.min(width / FIELD.w, height / FIELD.h);
  const ox = (width - FIELD.w * k) / 2;
  const oy = (height - FIELD.h * k) / 2;
  const X = (x: number) => ox + x * k;
  const Y = (y: number) => oy + y * k;

  ctx.clearRect(0, 0, width, height);
  // Maydon
  const bg = ctx.createLinearGradient(0, oy, 0, oy + FIELD.h * k);
  bg.addColorStop(0, "#071a2b");
  bg.addColorStop(1, "#0b1030");
  ctx.fillStyle = bg;
  ctx.fillRect(ox, oy, FIELD.w * k, FIELD.h * k);
  ctx.strokeStyle = "rgba(56,189,248,0.08)";
  ctx.lineWidth = 1;
  for (let gx = 0; gx <= FIELD.w; gx += 5) {
    ctx.beginPath();
    ctx.moveTo(X(gx), Y(0));
    ctx.lineTo(X(gx), Y(FIELD.h));
    ctx.stroke();
  }
  for (let gy = 0; gy <= FIELD.h; gy += 5) {
    ctx.beginPath();
    ctx.moveTo(X(0), Y(gy));
    ctx.lineTo(X(FIELD.w), Y(gy));
    ctx.stroke();
  }

  // Zona yopilganda tashqarisi qizarib ketadi
  if (s.wave && s.lock) {
    ctx.save();
    ctx.fillStyle = `rgba(239,68,68,${0.28 + Math.sin(s.t * 12) * 0.08})`;
    ctx.beginPath();
    ctx.rect(ox, oy, FIELD.w * k, FIELD.h * k);
    ctx.arc(X(s.wave.cx), Y(s.wave.cy), s.wave.r * k, 0, Math.PI * 2, true);
    ctx.fill("evenodd");
    ctx.restore();
  }

  // Xavfsiz zona
  if (s.wave) {
    const { cx, cy, r } = s.wave;
    const pulse = 1 + Math.sin(s.t * 4) * 0.02;
    const glow = ctx.createRadialGradient(X(cx), Y(cy), 0, X(cx), Y(cy), r * k * 1.25);
    glow.addColorStop(0, "rgba(74,222,128,0.35)");
    glow.addColorStop(0.8, "rgba(34,197,94,0.25)");
    glow.addColorStop(1, "rgba(34,197,94,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(X(cx), Y(cy), r * k * 1.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(2, k * 0.5);
    ctx.strokeStyle = s.lock ? "#bbf7d0" : "#4ade80";
    ctx.setLineDash([k * 2, k * 1.2]);
    ctx.lineDashOffset = -s.t * k * 6;
    ctx.beginPath();
    ctx.arc(X(cx), Y(cy), r * k * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // Qolgan vaqt — zona atrofidagi yoy
    if (s.timeLeft !== null && !s.lock) {
      ctx.lineWidth = Math.max(3, k * 0.8);
      ctx.strokeStyle = s.timeLeft < 0.3 ? "#f87171" : "#fde047";
      ctx.beginPath();
      ctx.arc(X(cx), Y(cy), r * k + k * 1.4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * s.timeLeft);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(220,252,231,0.35)";
    ctx.font = `900 ${Math.max(10, k * 2.4)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("XAVFSIZ", X(cx), Y(cy));
  }

  // Yulduzlar
  for (const st of s.stars) {
    ctx.save();
    ctx.shadowColor = "#facc15";
    ctx.shadowBlur = k * 2;
    ctx.fillStyle = "#fde047";
    starPath(ctx, X(st.x), Y(st.y), STAR_R * k * (1 + Math.sin(s.t * 5 + st.id) * 0.1), s.t + st.id);
    ctx.fill();
    ctx.restore();
  }

  // Robotlar: o'chganlari pastda, o'zi eng ustida. Telefonda ism faqat yaqin turganlarda (maydon kichik)
  const mine = s.robots.find((r) => r.me);
  const labelled = (r: DrawRobot) => s.labels === "all" || r.me || (mine !== undefined && Math.hypot(r.x - mine.x, r.y - mine.y) < 22);
  const order = [...s.robots].sort((a, b) => Number(!a.out) - Number(!b.out) || Number(Boolean(a.me)) - Number(Boolean(b.me)));
  for (const r of order) {
    const x = X(r.x);
    const y = Y(r.y);
    const rad = ROBOT_R * k;
    const color = r.out ? "#475569" : ROBOT_COLORS[r.color % ROBOT_COLORS.length];
    ctx.save();
    ctx.globalAlpha = r.out ? 0.45 : 1;
    if (r.me && !r.out) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = Math.max(2, k * 0.35);
      ctx.beginPath();
      ctx.arc(x, y, rad + k * 0.9 + Math.sin(s.t * 6) * k * 0.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Antenna
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, k * 0.25);
    ctx.beginPath();
    ctx.moveTo(x, y - rad * 0.8);
    ctx.lineTo(x, y - rad * 1.45);
    ctx.stroke();
    ctx.fillStyle = r.out ? "#64748b" : "#fef08a";
    ctx.beginPath();
    ctx.arc(x, y - rad * 1.5, rad * 0.22, 0, Math.PI * 2);
    ctx.fill();
    // Tana
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = r.out ? 0 : k * 1.5;
    ctx.beginPath();
    ctx.roundRect(x - rad, y - rad * 0.85, rad * 2, rad * 1.7, rad * 0.55);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Ko'zlar
    const len = Math.hypot(r.dx ?? 0, r.dy ?? 0) || 1;
    const lx = ((r.dx ?? 0) / len) * rad * 0.18;
    const ly = ((r.dy ?? 0) / len) * rad * 0.18;
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.roundRect(x - rad * 0.75, y - rad * 0.45, rad * 1.5, rad * 0.75, rad * 0.3);
    ctx.fill();
    if (r.out) {
      ctx.strokeStyle = "#f87171";
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
      ctx.fillStyle = "#67e8f9";
      for (const ex of [-0.35, 0.35]) {
        ctx.beginPath();
        ctx.arc(x + rad * ex + lx, y - rad * 0.08 + ly, rad * 0.17, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    // Ism
    if (labelled(r)) {
      ctx.font = `800 ${Math.max(10, k * (r.me ? 2 : 1.7))}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = r.out ? "rgba(148,163,184,0.7)" : "#fff";
      ctx.fillText(r.me ? "Siz" : r.name.length > 12 ? `${r.name.slice(0, 11)}…` : r.name, x, y - rad * 1.85);
    }
  }

  // Chegara
  ctx.strokeStyle = "rgba(74,222,128,0.6)";
  ctx.lineWidth = 2;
  ctx.strokeRect(ox, oy, FIELD.w * k, FIELD.h * k);
}

/** Ekrandagi nuqtani maydon koordinatasiga */
export function toField(width: number, height: number, px: number, py: number): { x: number; y: number } {
  const k = Math.min(width / FIELD.w, height / FIELD.h);
  const ox = (width - FIELD.w * k) / 2;
  const oy = (height - FIELD.h * k) / 2;
  return { x: Math.max(0, Math.min(FIELD.w, (px - ox) / k)), y: Math.max(0, Math.min(FIELD.h, (py - oy) / k)) };
}
