// "Kiber arena" — jonli o'yin oxiridagi otishmali mini-o'yin dvigateli (yuqoridan ko'rinish, original dizayn).
// Sof mantiq: holat + kiritish + vaqt → yangi holat va hodisalar. Chizish va ovoz komponentda.
// O'yinchi — visorli dumaloq robot, dushmanlar — dronlar. To'g'ri javoblar o'q va zirhga aylanadi.

export const ARENA_W = 1600;
export const ARENA_H = 900;
export const ARENA_SECONDS = 90;
export const ARENA_INTRO_S = 4;

export type DroneKind = "scout" | "grunt" | "tank";

export const DRONE: Record<DroneKind, { r: number; speed: number; hp: number; dmg: number; color: string }> = {
  scout: { r: 14, speed: 190, hp: 1, dmg: 8, color: "#22d3ee" },
  grunt: { r: 20, speed: 120, hp: 2, dmg: 14, color: "#f472b6" },
  tank: { r: 30, speed: 70, hp: 5, dmg: 24, color: "#f59e0b" },
};

/** To'lqinlar: qaysi dronlardan nechta */
export const WAVES: { kind: DroneKind; count: number }[][] = [
  [
    { kind: "scout", count: 6 },
    { kind: "grunt", count: 2 },
  ],
  [
    { kind: "grunt", count: 8 },
    { kind: "scout", count: 3 },
  ],
  [
    { kind: "grunt", count: 6 },
    { kind: "tank", count: 3 },
    { kind: "scout", count: 4 },
  ],
];
export const ARENA_TOTAL_DRONES = WAVES.flat().reduce((s, w) => s + w.count, 0);

/** Original xarita: markazda va yon tomonlarda to'siqlar */
export const WALLS: Rect[] = [
  { x: 720, y: 380, w: 160, h: 140 },
  { x: 300, y: 180, w: 220, h: 40 },
  { x: 1080, y: 180, w: 220, h: 40 },
  { x: 300, y: 680, w: 220, h: 40 },
  { x: 1080, y: 680, w: 220, h: 40 },
  { x: 180, y: 380, w: 40, h: 140 },
  { x: 1380, y: 380, w: 40, h: 140 },
];

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Drone {
  id: number;
  kind: DroneKind;
  x: number;
  y: number;
  hp: number;
  /** Urilganda qisqa yaltirash */
  flash: number;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export interface Pickup {
  id: number;
  kind: "ammo" | "health";
  x: number;
  y: number;
  life: number;
}

export interface ArenaState {
  t: number;
  player: { x: number; y: number; r: number; hp: number; armor: number; ammo: number; angle: number; cooldown: number; hurt: number };
  drones: Drone[];
  bullets: Bullet[];
  pickups: Pickup[];
  /** Joriy to'lqin (0 dan) va undan hali chiqmagan dronlar */
  wave: number;
  queue: DroneKind[];
  spawnIn: number;
  /** To'lqinlar orasidagi tanaffus */
  breakIn: number;
  kills: number;
  wavesCleared: number;
  won: boolean;
  dead: boolean;
  nextId: number;
  /** Sinovlar uchun aniq tasodif */
  seed: number;
}

export interface ArenaInput {
  /** Harakat yo'nalishi (-1..1) */
  mx: number;
  my: number;
  /** Nishon nuqtasi (dunyo koordinatalari); null — avtomatik eng yaqin dron */
  aimX: number | null;
  aimY: number | null;
  fire: boolean;
}

export type ArenaEvent = "shot" | "hit" | "kill" | "hurt" | "wave" | "pickup" | "win" | "dead" | "empty";

const PLAYER_SPEED = 260;
const BULLET_SPEED = 950;
const FIRE_COOLDOWN = 0.2;
const SPAWN_GAP = 0.55;
const WAVE_BREAK = 2.2;

/** Oddiy deterministik tasodif (mulberry32) */
function rand(s: ArenaState): number {
  s.seed = (s.seed + 0x6d2b79f5) | 0;
  let t = s.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function queueFor(wave: number, s: ArenaState): DroneKind[] {
  const list = WAVES[wave].flatMap((w) => Array.from({ length: w.count }, () => w.kind));
  // Aralashtirish
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

/** Yuklama: to'g'ri javoblar soniga qarab */
export function arenaLoadout(correct: number): { ammo: number; armor: number } {
  const c = Math.max(0, Math.floor(correct));
  return { ammo: 25 + c * 12, armor: Math.min(150, c * 15) };
}

/** Bonus ochko: dron × 20 + to'lqin × 100 + hammasini tugatsa 500, ko'pi bilan 1300 */
export function arenaBonus(kills: number, waves: number, finished: boolean): number {
  const k = Math.max(0, Math.min(kills, ARENA_TOTAL_DRONES));
  const w = Math.max(0, Math.min(waves, WAVES.length));
  return Math.min(1300, k * 20 + w * 100 + (finished && w === WAVES.length ? 500 : 0));
}

export function createArena(loadout: { ammo: number; armor: number }, seed = 1): ArenaState {
  const s: ArenaState = {
    t: 0,
    player: { x: ARENA_W / 2, y: ARENA_H - 120, r: 18, hp: 100, armor: loadout.armor, ammo: loadout.ammo, angle: -Math.PI / 2, cooldown: 0, hurt: 0 },
    drones: [],
    bullets: [],
    pickups: [],
    wave: 0,
    queue: [],
    spawnIn: 0.6,
    breakIn: 0,
    kills: 0,
    wavesCleared: 0,
    won: false,
    dead: false,
    nextId: 1,
    seed,
  };
  s.queue = queueFor(0, s);
  return s;
}

function collideRect(x: number, y: number, r: number, rect: Rect): { x: number; y: number } | null {
  const cx = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const cy = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  const dx = x - cx;
  const dy = y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  const d = Math.sqrt(d2);
  if (d === 0) {
    // Markaz to'siq ichida — eng yaqin chetga chiqariladi
    const left = x - rect.x;
    const right = rect.x + rect.w - x;
    const top = y - rect.y;
    const bottom = rect.y + rect.h - y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) return { x: rect.x - r, y };
    if (m === right) return { x: rect.x + rect.w + r, y };
    if (m === top) return { x, y: rect.y - r };
    return { x, y: rect.y + rect.h + r };
  }
  return { x: cx + (dx / d) * r, y: cy + (dy / d) * r };
}

/** Doira devor va chegaralardan tashqariga chiqariladi */
export function resolveCircle(x: number, y: number, r: number): { x: number; y: number } {
  let p = { x: Math.max(r, Math.min(ARENA_W - r, x)), y: Math.max(r, Math.min(ARENA_H - r, y)) };
  for (const w of WALLS) {
    const c = collideRect(p.x, p.y, r, w);
    if (c) p = c;
  }
  return p;
}

const insideWall = (x: number, y: number) => WALLS.some((w) => x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h);

function spawnDrone(s: ArenaState, kind: DroneKind) {
  // Chetlardan biridan, o'yinchidan uzoqroqda
  const side = Math.floor(rand(s) * 4);
  const r = DRONE[kind].r;
  const along = rand(s);
  const x = side === 0 ? r : side === 1 ? ARENA_W - r : along * ARENA_W;
  const y = side === 2 ? r : side === 3 ? ARENA_H - r : along * ARENA_H;
  const p = resolveCircle(x, y, r);
  s.drones.push({ id: s.nextId++, kind, x: p.x, y: p.y, hp: DRONE[kind].hp, flash: 0 });
}

/** Avtomatik nishon: eng yaqin dron (sensorli ekran) */
export function nearestDrone(s: ArenaState): Drone | null {
  let best: Drone | null = null;
  let bd = Infinity;
  for (const d of s.drones) {
    const dd = (d.x - s.player.x) ** 2 + (d.y - s.player.y) ** 2;
    if (dd < bd) {
      bd = dd;
      best = d;
    }
  }
  return best;
}

/** Bir qadam (dt soniya). Hodisalar ovoz va effekt uchun qaytariladi */
export function stepArena(s: ArenaState, input: ArenaInput, dtRaw: number): ArenaEvent[] {
  const ev: ArenaEvent[] = [];
  if (s.won || s.dead) return ev;
  const dt = Math.min(dtRaw, 0.05);
  s.t += dt;
  const p = s.player;
  p.cooldown = Math.max(0, p.cooldown - dt);
  p.hurt = Math.max(0, p.hurt - dt);

  // Harakat
  const len = Math.hypot(input.mx, input.my);
  if (len > 0.01) {
    const k = Math.min(1, len) / len;
    const np = resolveCircle(p.x + input.mx * k * PLAYER_SPEED * dt, p.y + input.my * k * PLAYER_SPEED * dt, p.r);
    p.x = np.x;
    p.y = np.y;
  }

  // Nishon
  let ax = input.aimX;
  let ay = input.aimY;
  if (ax === null || ay === null) {
    const n = nearestDrone(s);
    if (n) {
      ax = n.x;
      ay = n.y;
    }
  }
  if (ax !== null && ay !== null) p.angle = Math.atan2(ay - p.y, ax - p.x);

  // Otish
  if (input.fire && p.cooldown <= 0) {
    if (p.ammo > 0) {
      p.ammo--;
      p.cooldown = FIRE_COOLDOWN;
      s.bullets.push({ x: p.x + Math.cos(p.angle) * (p.r + 6), y: p.y + Math.sin(p.angle) * (p.r + 6), vx: Math.cos(p.angle) * BULLET_SPEED, vy: Math.sin(p.angle) * BULLET_SPEED, life: 1.2 });
      ev.push("shot");
    } else {
      p.cooldown = 0.4;
      ev.push("empty");
    }
  }

  // O'qlar
  for (const b of s.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.x < 0 || b.y < 0 || b.x > ARENA_W || b.y > ARENA_H || insideWall(b.x, b.y)) b.life = 0;
    if (b.life <= 0) continue;
    for (const d of s.drones) {
      if (d.hp <= 0) continue;
      if ((b.x - d.x) ** 2 + (b.y - d.y) ** 2 <= (DRONE[d.kind].r + 4) ** 2) {
        d.hp--;
        d.flash = 0.1;
        b.life = 0;
        ev.push("hit");
        if (d.hp <= 0) {
          s.kills++;
          ev.push("kill");
          const roll = rand(s);
          if (roll < 0.22) s.pickups.push({ id: s.nextId++, kind: "ammo", x: d.x, y: d.y, life: 10 });
          else if (roll < 0.32) s.pickups.push({ id: s.nextId++, kind: "health", x: d.x, y: d.y, life: 10 });
        }
        break;
      }
    }
  }
  s.bullets = s.bullets.filter((b) => b.life > 0);
  s.drones = s.drones.filter((d) => d.hp > 0);

  // Dronlar: o'yinchiga intiladi, to'siqlarni aylanib o'tadi (to'qnashuvda sirpanadi)
  for (const d of s.drones) {
    d.flash = Math.max(0, d.flash - dt);
    const def = DRONE[d.kind];
    const dx = p.x - d.x;
    const dy = p.y - d.y;
    const dist = Math.hypot(dx, dy) || 1;
    // Bir-biridan biroz uzoqlashish — to'planib qolmasin
    let sx = 0;
    let sy = 0;
    for (const o of s.drones) {
      if (o === d) continue;
      const ox = d.x - o.x;
      const oy = d.y - o.y;
      const od = Math.hypot(ox, oy);
      const min = def.r + DRONE[o.kind].r;
      if (od > 0 && od < min) {
        sx += (ox / od) * (min - od);
        sy += (oy / od) * (min - od);
      }
    }
    const np = resolveCircle(d.x + (dx / dist) * def.speed * dt + sx * 0.5, d.y + (dy / dist) * def.speed * dt + sy * 0.5, def.r);
    d.x = np.x;
    d.y = np.y;
    if (dist < def.r + p.r && p.hurt <= 0) {
      // Avval zirh, keyin sog'liq
      let dmg = def.dmg;
      const absorbed = Math.min(p.armor, dmg);
      p.armor -= absorbed;
      dmg -= absorbed;
      p.hp = Math.max(0, p.hp - dmg);
      p.hurt = 0.6;
      ev.push("hurt");
      // Urib orqaga sakraydi
      const back = resolveCircle(d.x - (dx / dist) * 60, d.y - (dy / dist) * 60, def.r);
      d.x = back.x;
      d.y = back.y;
    }
  }

  // Qutilar
  for (const k of s.pickups) {
    k.life -= dt;
    if ((k.x - p.x) ** 2 + (k.y - p.y) ** 2 <= (p.r + 16) ** 2) {
      if (k.kind === "ammo") p.ammo += 8;
      else p.hp = Math.min(100, p.hp + 25);
      k.life = 0;
      ev.push("pickup");
    }
  }
  s.pickups = s.pickups.filter((k) => k.life > 0);

  if (p.hp <= 0) {
    s.dead = true;
    ev.push("dead");
    return ev;
  }

  // To'lqinlar
  if (s.breakIn > 0) {
    s.breakIn -= dt;
    if (s.breakIn <= 0) {
      s.wave++;
      s.queue = queueFor(s.wave, s);
      s.spawnIn = 0.3;
      ev.push("wave");
    }
  } else if (s.queue.length > 0) {
    s.spawnIn -= dt;
    if (s.spawnIn <= 0) {
      spawnDrone(s, s.queue.shift()!);
      s.spawnIn = SPAWN_GAP;
    }
  } else if (s.drones.length === 0) {
    s.wavesCleared = s.wave + 1;
    if (s.wave + 1 >= WAVES.length) {
      s.won = true;
      ev.push("win");
    } else {
      s.breakIn = WAVE_BREAK;
    }
  }
  return ev;
}
