// Raqiblarni silliq ko'rsatish: har birining oxirgi holatlari buferda, ekran ularni biroz orqada (delay ms) chizadi
// va ikki ma'lum holat orasini to'ldiradi. Yangi ma'lumot kechiksa — oxirgi tezlik bilan qisqa davom ettiradi.
// Natija: tarmoq notekis bo'lsa ham raqib sakramaydi, bir tekis yuradi.

interface Sample {
  t: number;
  x: number;
  y: number;
  a: number;
}

const MAX_EXTRAPOLATE_MS = 250;
const TELEPORT_PX = 400;

export class Smoother {
  private buf = new Map<string, Sample[]>();

  constructor(private delay: number) {}

  setDelay(ms: number) {
    this.delay = ms;
  }

  /** Yangi holat (t — qabul qilingan vaqt, performance.now) */
  push(id: string, t: number, x: number, y: number, a: number) {
    let arr = this.buf.get(id);
    if (!arr) {
      arr = [];
      this.buf.set(id, arr);
    }
    const last = arr[arr.length - 1];
    // Teleport yoki uzoq uzilish — eski yo'lni chizmaymiz, darhol yangi joyda
    if (last && Math.hypot(x - last.x, y - last.y) > TELEPORT_PX) arr.length = 0;
    if (last && t <= last.t) return;
    arr.push({ t, x, y, a });
    if (arr.length > 16) arr.splice(0, arr.length - 16);
  }

  /** Ekranda chiziladigan joy */
  sample(id: string, now: number): { x: number; y: number; a: number; moving: boolean } | null {
    const arr = this.buf.get(id);
    if (!arr || arr.length === 0) return null;
    const rt = now - this.delay;
    if (arr.length === 1 || rt <= arr[0].t) return { ...arr[0], moving: false };
    for (let i = arr.length - 2; i >= 0; i--) {
      const p = arr[i];
      const q = arr[i + 1];
      if (p.t <= rt && rt <= q.t) {
        const f = (rt - p.t) / Math.max(1, q.t - p.t);
        const da = Math.atan2(Math.sin(q.a - p.a), Math.cos(q.a - p.a));
        const speed = Math.hypot(q.x - p.x, q.y - p.y) / Math.max(1, q.t - p.t);
        return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f, a: p.a + da * f, moving: speed > 0.03 };
      }
    }
    // Eng yangisidan ham oldinda: oxirgi tezlik bilan biroz davom (keyin to'xtaydi)
    const q = arr[arr.length - 1];
    const p = arr[arr.length - 2];
    const dt = Math.max(1, q.t - p.t);
    const ext = Math.min(rt - q.t, MAX_EXTRAPOLATE_MS);
    const vx = (q.x - p.x) / dt;
    const vy = (q.y - p.y) / dt;
    return { x: q.x + vx * ext, y: q.y + vy * ext, a: q.a, moving: ext < MAX_EXTRAPOLATE_MS && Math.hypot(vx, vy) > 0.03 };
  }

  /** Ro'yxatda yo'qlarni o'chirish */
  keep(ids: Set<string>) {
    for (const id of [...this.buf.keys()]) if (!ids.has(id)) this.buf.delete(id);
  }
}
