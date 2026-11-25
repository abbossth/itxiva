import { describe, expect, it } from "vitest";
import { ARENA_MAPS as MAPS_BY_ID, ZONE_DAMAGE_MS, ZONE_FINAL_R, ZONE_KILLER, outsideZone, zoneAt, zoneStep } from "@/lib/live-game/pvp";
import { PvpRoom } from "@/lib/live-game/pvp-room";

const ARENA_MAPS = Object.values(MAPS_BY_ID);
const START = 1_700_000_000_000;
const END = START + 120_000;

describe("toraluvchi zona", () => {
  it("boshida butun xaritani qoplaydi, bosqichma-bosqich torayadi va oxirida kichik doira qoladi", () => {
    for (const map of ARENA_MAPS) {
      const z0 = zoneAt(map, START, END, START);
      for (const [x, y] of [[0, 0], [map.w, 0], [0, map.h], [map.w, map.h]]) expect(outsideZone(z0, x, y)).toBe(false);
      expect(z0.shrinking).toBe(false);
      let prev = z0.r;
      for (let t = 0; t <= 120_000; t += 2000) {
        const z = zoneAt(map, START, END, START + t);
        expect(z.r).toBeLessThanOrEqual(prev + 1e-6); // hech qachon kattalashmaydi
        // Keyingi doira hozirgisining ichida
        expect(Math.hypot(z.tx - z.x, z.ty - z.y) + z.tr).toBeLessThanOrEqual(z.r + 1);
        prev = z.r;
      }
      const last = zoneAt(map, START, END, END);
      expect(last.r).toBeCloseTo(ZONE_FINAL_R);
      expect(last.nextMs).toBe(0);
    }
  });

  it("bir xil jang uchun hamma joyda bir xil (vaqtdan aniq hisoblanadi)", () => {
    const map = ARENA_MAPS[0];
    expect(zoneAt(map, START, END, START + 70_000)).toEqual(zoneAt(map, START, END, START + 70_000));
  });

  it("tashqarida: avval hisob boshlanadi, keyin har 2,5 s da zarar; ichkariga kirsa — nolga", () => {
    let st = zoneStep(0, true, 1000);
    expect(st).toEqual({ since: 1000, damage: false });
    st = zoneStep(st.since, true, 1000 + ZONE_DAMAGE_MS - 1);
    expect(st.damage).toBe(false);
    st = zoneStep(st.since, true, 1000 + ZONE_DAMAGE_MS);
    expect(st).toEqual({ since: 1000 + ZONE_DAMAGE_MS, damage: true });
    expect(zoneStep(st.since, false, 9000)).toEqual({ since: 0, damage: false });
  });

  it("real vaqt xonasi: zonadan tashqarida qolgan o'yinchi jon yo'qotadi va zona yiqitadi", () => {
    const map = ARENA_MAPS[0];
    const room = new PvpRoom("g1", 1, START, END, () => 0.5, map.id);
    const zEnd = zoneAt(map, START, END, START + 110_000);
    // Doiradan eng uzoq burchak
    const far = [[30, 30], [map.w - 30, 30], [30, map.h - 30], [map.w - 30, map.h - 30]].sort(
      (a, b) => Math.hypot(b[0] - zEnd.x, b[1] - zEnd.y) - Math.hypot(a[0] - zEnd.x, a[1] - zEnd.y)
    )[0];
    room.join({ p: "a", n: "Ali", skin: "bolt", weapon: "Lazer-1", cooldown: 0.36, lives: 2, maxLives: 2, x: far[0], y: far[1], shieldUntil: 0 });
    room.join({ p: "b", n: "Vali", skin: "rex", weapon: "Lazer-1", cooldown: 0.36, lives: 2, maxLives: 2, x: zEnd.x, y: zEnd.y, shieldUntil: 0 });
    // Boshida — hamma ichkarida
    room.step(START + 1000);
    expect(room.players.get("a")!.lives).toBe(2);
    for (let t = 110_000; t <= 110_000 + ZONE_DAMAGE_MS * 2; t += 250) room.step(START + t);
    const a = room.players.get("a")!;
    expect(a).toMatchObject({ lives: 0, out: true, killedBy: ZONE_KILLER });
    expect(room.players.get("b")!.lives).toBe(2); // doira ichida
    expect(room.feed.at(-1)).toMatchObject({ kind: "kill", a: ZONE_KILLER, b: "Ali" });
    expect(JSON.parse(room.frame(START + 110_000, "b", { pickups: 0, feed: 0 })).z).toHaveLength(8);
  });
});
