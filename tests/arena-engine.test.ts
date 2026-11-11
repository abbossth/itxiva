import { describe, expect, it } from "vitest";
import {
  ARENA_TOTAL_DRONES,
  WALLS,
  arenaBonus,
  arenaLoadout,
  createArena,
  resolveCircle,
  stepArena,
  type ArenaInput,
} from "@/lib/live-game/arena-engine";

const idle: ArenaInput = { mx: 0, my: 0, aimX: null, aimY: null, fire: false };
const run = (s: ReturnType<typeof createArena>, input: ArenaInput, seconds: number) => {
  const ev: string[] = [];
  for (let t = 0; t < seconds; t += 1 / 60) ev.push(...stepArena(s, input, 1 / 60));
  return ev;
};

describe("arena dvigateli", () => {
  it("yuklama va bonus: to'g'ri javoblar o'q va zirhga aylanadi, bonus 1300 bilan chegaralangan", () => {
    expect(arenaLoadout(0)).toEqual({ ammo: 15, armor: 0 });
    expect(arenaLoadout(4)).toEqual({ ammo: 55, armor: 60 });
    expect(arenaLoadout(20).armor).toBe(150);
    expect(arenaBonus(10, 1, false)).toBe(300);
    expect(arenaBonus(ARENA_TOTAL_DRONES, 3, true)).toBe(1300);
    expect(arenaBonus(999, 9, true)).toBe(1300);
    expect(arenaBonus(5, 2, true)).toBe(300); // 3 to'lqinsiz "tugatdi" hisoblanmaydi
  });

  it("devor va chegaradan o'tib bo'lmaydi", () => {
    const w = WALLS[0];
    const p = resolveCircle(w.x + w.w / 2, w.y + 5, 18);
    expect(p.y).toBeLessThanOrEqual(w.y - 18 + 0.001);
    expect(resolveCircle(-50, 5000, 18)).toEqual({ x: 18, y: 900 - 18 });
    const s = createArena({ ammo: 10, armor: 0 });
    run(s, { ...idle, mx: 0, my: 1 }, 2);
    expect(s.player.y).toBe(900 - 18);
  });

  it("o'q sarflanadi, tugasa otilmaydi; otilgan o'q dronni yo'q qiladi va kill sanaladi", () => {
    const s = createArena({ ammo: 3, armor: 0 }, 7);
    // Bitta skautni o'yinchi oldiga qo'yamiz
    s.queue = [];
    s.spawnIn = 99;
    s.drones.push({ id: 99, kind: "scout", x: s.player.x, y: s.player.y - 150, hp: 1, flash: 0 });
    const ev = run(s, { ...idle, fire: true, aimX: s.player.x, aimY: s.player.y - 150 }, 1);
    expect(ev).toContain("kill");
    expect(s.kills).toBe(1);
    expect(s.player.ammo).toBe(0);
    expect(ev).toContain("empty");
  });

  it("dron urilsa avval zirh, keyin sog'liq kamayadi; sog'liq tugasa — o'yin tugaydi", () => {
    const s = createArena({ ammo: 0, armor: 10 }, 3);
    s.queue = [];
    s.spawnIn = 99;
    s.drones.push({ id: 1, kind: "tank", x: s.player.x, y: s.player.y - 40, hp: 5, flash: 0 });
    run(s, idle, 0.2);
    expect(s.player.armor).toBe(0);
    expect(s.player.hp).toBe(100 - (24 - 10));
    const ev = run(s, idle, 30);
    expect(s.dead).toBe(true);
    expect(ev).toContain("dead");
  });

  it("hamma dronni yo'q qilsa to'lqinlar o'tadi va oxirida g'alaba", () => {
    const s = createArena({ ammo: 999, armor: 0 }, 11);
    const ev: string[] = [];
    for (let i = 0; i < 60 * 120 && !s.won && !s.dead; i++) {
      // Har kadrda tirik dronlarni "yo'q qilamiz" — to'lqin mantiqini tekshirish uchun
      for (const d of s.drones) d.hp = 0;
      s.kills += s.drones.length;
      s.drones = [];
      ev.push(...stepArena(s, idle, 1 / 60));
    }
    expect(s.won).toBe(true);
    expect(s.wavesCleared).toBe(3);
    expect(ev.filter((e) => e === "wave")).toHaveLength(2);
    expect(s.kills).toBe(ARENA_TOTAL_DRONES);
  });
});
