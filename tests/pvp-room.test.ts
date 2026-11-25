import { describe, expect, it } from "vitest";
import { PvpRoom, decodeRoomMessage, newClientState } from "@/lib/live-game/pvp-room";
import { signTicket, verifyTicket, hmacSign, hmacVerify, type ArenaTicket } from "@/lib/live-game/arena-token";
import { BLEED_MS, DOWN_HP, HIT_GRACE_MS, PICKUP_EVERY_MS, REVIVE_HP, REVIVE_MS } from "@/lib/live-game/pvp";

const START = 1_000_000;
// 48 HP: Lazer-1 (16 zarar) bilan aynan 3 o'qda yiqiladi
const join = (room: PvpRoom, p: string, x: number, y: number, lives = 48) =>
  room.join({ p, n: p.toUpperCase(), skin: "bolt", weapon: "Lazer-1", cooldown: 0.36, lives, maxLives: lives, x, y, shieldUntil: START + 3000 });

describe("real vaqt xonasi", () => {
  it("o'q tekkanini tekshiradi: himoya, takror o'q, daxlsizlik, masofa; 3 o'qda chiqadi", () => {
    const room = new PvpRoom("g", 2, START, START + 45_000, () => 0.5);
    join(room, "ali", 200, 150);
    join(room, "vali", 600, 150);
    const hit = (now: number, id: number, x = 230) => room.input("ali", { x: 200, y: 150, shots: [{ id, x, y: 150, a: 0 }], hits: [{ target: "vali", shot: id }] }, now);
    // Boshlanishdagi himoya
    hit(START + 1000, 1);
    expect(room.players.get("vali")!.lives).toBe(48);
    hit(START + 3500, 2);
    expect(room.players.get("vali")!.lives).toBe(32);
    // O'sha o'q qayta hisoblanmaydi, daxlsizlik ichida ham o'tmaydi
    room.input("ali", { hits: [{ target: "vali", shot: 2 }] }, START + 4100);
    hit(START + 3500 + HIT_GRACE_MS - 50, 3);
    expect(room.players.get("vali")!.lives).toBe(32);
    // Otilmagan o'q va juda uzoqdagi nishon
    room.input("ali", { hits: [{ target: "vali", shot: 77 }] }, START + 5000);
    room.input("ali", { x: 2300, y: 1300, shots: [{ id: 4, x: 2300, y: 1300, a: 0 }], hits: [{ target: "vali", shot: 4 }] }, START + 5000);
    expect(room.players.get("vali")!.lives).toBe(32);
    hit(START + 6000, 5);
    expect(room.killsDirty).toBe(false);
    hit(START + 7000, 6);
    const v = room.players.get("vali")!;
    expect(v).toMatchObject({ lives: 0, out: true, killedBy: "ALI" });
    expect(room.players.get("ali")).toMatchObject({ kills: 1, hits: 3 });
    expect(room.killsDirty).toBe(true);
    expect(room.feed.at(-1)).toMatchObject({ kind: "kill", a: "ALI", b: "VALI" });
    // Chiqqan o'yinchi harakatlanmaydi
    room.input("vali", { x: 900, y: 900 }, START + 8000);
    expect(v.x).toBe(600);
    expect(room.alive()).toBe(1);
    const res = room.results();
    expect(res).toMatchObject({ g: "g", r: 2 });
    expect(res.players.find((p) => p.id === "vali")).toMatchObject({ out: true, lives: 0, hitsTaken: 3 });
  });

  it("sovg'ani birinchi yetib kelgan oladi, vaqt o'tib yangisi chiqadi; qayta ulanganda holat saqlanadi", () => {
    const room = new PvpRoom("g", 4, START, START + 120_000, () => 0.1);
    // Klassik xaritaning markaziy sovg'asi (1500, 875)
    join(room, "ali", 1500, 875);
    join(room, "vali", 1510, 875);
    room.input("ali", { x: 1500, y: 875, claim: 1 }, START + 100);
    room.input("vali", { x: 1510, y: 875, claim: 1 }, START + 110);
    expect(room.players.get("ali")!.claimed).toBe("triple");
    expect(room.players.get("vali")!.claimed).toBe(null);
    expect(room.players.get("ali")!.until.triple).toBeGreaterThan(START + 100);
    // Uzoqdan olib bo'lmaydi
    room.input("vali", { x: 200, y: 150, claim: 2 }, START + 200);
    expect(room.pickups.some((k) => k.id === 2)).toBe(true);
    const n = room.pickups.length;
    room.step(START + PICKUP_EVERY_MS);
    expect(room.pickups.length).toBe(n + 1);
    // Qayta ulanish
    const again = join(room, "ali", 0, 0);
    expect(again.x).toBe(1500);
    expect(room.players.size).toBe(2);
  });

  it("ixcham kadr brauzerda to'liq dunyoga aylanadi; yangi o'qlar bir marta yuboriladi", () => {
    const room = new PvpRoom("g", 4, START, START + 120_000);
    join(room, "ali", 300, 300);
    join(room, "vali", 900, 300);
    const now = START + 4000;
    room.input("vali", { x: 905, y: 301, a: 1.5, shots: [{ id: 9, x: 920, y: 301, a: 1.5 }] }, now);
    const st = newClientState();
    expect(decodeRoomMessage(room.rosterMessage(), st, "ali", null)).toBe(null);
    const sent = { pickups: 0, feed: -1 };
    const d = decodeRoomMessage(room.frame(now + 20, "ali", sent), st, "ali", { weapon: "Lazer-1", cooldown: 0.36, name: "ALI", skin: "bolt" })!;
    expect(d.world.peers.map((p) => [p.name, p.isMe])).toEqual([
      ["ALI", true],
      ["VALI", false],
    ]);
    const vali = d.world.peers.find((p) => p.name === "VALI")!;
    expect(vali).toMatchObject({ x: 905, y: 301, a: 1.5, lives: 48 });
    expect(vali.shots).toEqual([{ id: 9, x: 920, y: 301, a: 1.5, age: 20 }]);
    expect(d.world.pickups).toHaveLength(3);
    expect(d.me).toMatchObject({ lives: 48, out: false, weapon: "Lazer-1" });
    expect(d.world.remainingMs).toBe(120_000 - 4020);
    room.flush();
    const d2 = decodeRoomMessage(room.frame(now + 80, "ali", { pickups: room.pickupsVer, feed: room.feedVer }), st, "ali", null)!;
    expect(d2.world.peers.find((p) => p.name === "VALI")!.shots).toEqual([]);
    // Sovg'alar o'zgarmagan bo'lsa ham oxirgisi eslab qolinadi
    expect(d2.world.pickups).toHaveLength(3);
  });
});

describe("jamoaviy xona", () => {
  it("jamoadoshga o'q tegmaydi, raqibga tegadi; ro'yxat jamoani brauzerga yetkazadi", () => {
    const room = new PvpRoom("g", 4, START, START + 120_000, () => 0.5);
    room.join({ p: "ali", n: "ALI", skin: "bolt", weapon: "Lazer-1", cooldown: 0.36, lives: 48, maxLives: 100, x: 200, y: 150, shieldUntil: 0, team: 0 });
    room.join({ p: "olim", n: "OLIM", skin: "rex", weapon: "Lazer-1", cooldown: 0.36, lives: 48, maxLives: 100, x: 400, y: 150, shieldUntil: 0, team: 0 });
    room.join({ p: "vali", n: "VALI", skin: "nova", weapon: "Lazer-1", cooldown: 0.36, lives: 48, maxLives: 100, x: 600, y: 150, shieldUntil: 0, team: 1 });
    room.input("ali", { x: 200, y: 150, shots: [{ id: 1, x: 230, y: 150, a: 0 }], hits: [{ target: "olim", shot: 1 }] }, START + 1000);
    expect(room.players.get("olim")!.lives).toBe(48);
    room.input("ali", { x: 200, y: 150, shots: [{ id: 2, x: 230, y: 150, a: 0 }], hits: [{ target: "vali", shot: 2 }] }, START + 2000);
    expect(room.players.get("vali")!.lives).toBe(32);
    const st = newClientState();
    decodeRoomMessage(room.rosterMessage(), st, "ali", null);
    const d = decodeRoomMessage(room.frame(START + 2100, "ali", { pickups: 0, feed: 0 }), st, "ali", { weapon: "Lazer-1", cooldown: 0.36, name: "ALI", skin: "bolt" })!;
    expect(d.world.peers.map((p) => [p.id, p.team])).toEqual([
      ["ali", 0],
      ["olim", 0],
      ["vali", 1],
    ]);
  });
});

describe("bilet va imzo", () => {
  const t: ArenaTicket = { g: "g1", r: 2, role: "player", p: "p1", n: "Ali", skin: "bolt", lives: 3, maxLives: 3, weapon: "Lazer-1", cooldown: 0.36, x: 1, y: 2, shieldUntil: 0, st: 1, en: 2, exp: Date.now() + 60_000 };
  it("to'g'ri bilet o'qiladi, buzilgan yoki muddati o'tgani rad etiladi", async () => {
    const tok = await signTicket("s3cret", t);
    expect(await verifyTicket("s3cret", tok)).toMatchObject({ g: "g1", p: "p1", role: "player" });
    expect(await verifyTicket("boshqa", tok)).toBe(null);
    const [body, sig] = tok.split(".");
    const forged = Buffer.from(JSON.stringify({ ...t, role: "watch" })).toString("base64url");
    expect(await verifyTicket("s3cret", `${forged}.${sig}`)).toBe(null);
    expect(await verifyTicket("s3cret", `${body}.x${sig}`)).toBe(null);
    expect(await verifyTicket("s3cret", await signTicket("s3cret", { ...t, exp: Date.now() - 1 }))).toBe(null);
    expect(await verifyTicket("s3cret", "")).toBe(null);
  });
  it("natija imzosi", async () => {
    const sig = await hmacSign("k", '{"a":1}');
    expect(await hmacVerify("k", '{"a":1}', sig)).toBe(true);
    expect(await hmacVerify("k", '{"a":2}', sig)).toBe(false);
  });
});

describe("xaritalar va reaksiyalar", () => {
  it("har xaritada paydo bo'lish, sovg'a, teleport va baza joylari devor ichida emas va xarita ichida", async () => {
    const { ARENA_MAPS, MAP_IDS, inWall } = await import("@/lib/live-game/pvp");
    expect(MAP_IDS).toHaveLength(4);
    for (const id of MAP_IDS) {
      const m = ARENA_MAPS[id];
      expect(m.w).toBeGreaterThanOrEqual(3000);
      const pts = [...m.spawns, ...m.pickups, ...m.bases, ...m.teleports.flatMap((t) => [t.a, t.b])];
      for (const p of pts) {
        expect(inWall(p.x, p.y, m), `${id}: ${p.x},${p.y}`).toBe(false);
        expect(p.x > 0 && p.x < m.w && p.y > 0 && p.y < m.h).toBe(true);
      }
      expect(m.pickups.length).toBeGreaterThanOrEqual(3);
      expect(m.spawns.length).toBe(16);
    }
  });

  it("ovoz natijasi: eng ko'p ovoz; teng yoki ovoz yo'q — ular orasidan", async () => {
    const { pickMap } = await import("@/lib/live-game/pvp");
    expect(pickMap(["ice", "ice", "forest", "hack"])).toBe("ice");
    expect(pickMap(["ice", "forest"], () => 0)).toBe("ice");
    expect(pickMap(["ice", "forest"], () => 0.99)).toBe("forest");
    expect(pickMap([], () => 0)).toBe("neon");
  });

  it("xona tanlangan xaritada: sovg'alar va chegaralar shu xaritaniki; reaksiya boshqalarga yetadi", async () => {
    const { ARENA_MAPS } = await import("@/lib/live-game/pvp");
    const room = new PvpRoom("g", 1, START, START + 120_000, () => 0.5, "space");
    expect(room.map.id).toBe("space");
    expect(room.pickups[0]).toMatchObject({ x: ARENA_MAPS.space.pickups[0].x, y: ARENA_MAPS.space.pickups[0].y });
    join(room, "ali", 300, 300);
    join(room, "vali", 3100, 1700);
    // Katta xaritaning chetiga yurish mumkin (klassik xaritadan tashqarida)
    room.input("vali", { x: 3150, y: 1750 }, START + 100);
    expect(room.players.get("vali")!.x).toBe(3150);
    room.input("ali", { x: 300, y: 300, em: 2 }, START + 200);
    room.input("ali", { x: 300, y: 300, em: 9 }, START + 1200);
    const st = newClientState();
    decodeRoomMessage(room.rosterMessage(), st, "vali", null);
    const d = decodeRoomMessage(room.frame(START + 300, "vali", { pickups: 0, feed: 0 }), st, "vali", { weapon: "Lazer-1", cooldown: 0.36, name: "VALI", skin: "bolt" })!;
    expect(d.world.map).toBe("space");
    expect(d.world.peers.find((p) => p.id === "ali")?.emote).toBe(2);
    // 2,5 s dan keyin reaksiya yo'qoladi
    const later = decodeRoomMessage(room.frame(START + 3000, "vali", { pickups: 0, feed: 0 }), st, "vali", { weapon: "Lazer-1", cooldown: 0.36, name: "VALI", skin: "bolt" })!;
    expect(later.world.peers.find((p) => p.id === "ali")?.emote).toBe(-1);
  });
});

describe("jamoaviy xona: yiqilish va qutqarish", () => {
  const setup = () => {
    const room = new PvpRoom("g", 4, START, START + 120_000, () => 0.5);
    const mk = (p: string, x: number, team: number, lives = 48) =>
      room.join({ p, n: p.toUpperCase(), skin: "bolt", weapon: "Lazer-1", cooldown: 0.36, lives, maxLives: 100, x, y: 300, shieldUntil: 0, team });
    mk("ali", 300, 0);
    mk("olim", 340, 0, 20);
    mk("vali", 700, 1);
    let sid = 1;
    const shoot = (from: string, to: string, now: number) => {
      const f = room.players.get(from)!;
      room.input(from, { x: f.x, y: f.y, shots: [{ id: sid, x: f.x, y: 300, a: 0 }], hits: [{ target: to, shot: sid }] }, now);
      sid++;
    };
    return { room, shoot };
  };

  it("HP 10 ga tushsa yiqiladi: ota olmaydi; raqib qutqara olmaydi; jamoadosh 3 s bosib tursa 50 HP bilan turadi, o'q tegsa — qaytadan", () => {
    const { room, shoot } = setup();
    shoot("vali", "olim", START + 1000);
    const olim = room.players.get("olim")!;
    expect(olim).toMatchObject({ downed: true, out: false, lives: DOWN_HP });
    expect(room.feed.at(-1)).toMatchObject({ kind: "down", a: "VALI", b: "OLIM" });
    // Yiqilgan ota olmaydi
    shoot("olim", "vali", START + 1100);
    expect(room.players.get("vali")!.lives).toBe(48);
    // Raqib qutqara olmaydi
    room.input("vali", { x: 360, y: 300, rv: "olim" }, START + 1200);
    room.input("vali", { x: 360, y: 300, rv: "olim" }, START + 1200 + REVIVE_MS);
    expect(olim.downed).toBe(true);
    // Ali boshlaydi, o'q yeydi — qaytadan
    room.input("ali", { x: 300, y: 300, rv: "olim" }, START + 2000);
    shoot("vali", "ali", START + 3000);
    room.input("ali", { x: 300, y: 300, rv: "olim" }, START + 2000 + REVIVE_MS);
    expect(olim.downed).toBe(true);
    room.input("ali", { x: 300, y: 300, rv: "olim" }, START + 5000 + REVIVE_MS + 1);
    expect(olim).toMatchObject({ downed: false, out: false, lives: REVIVE_HP, revives: 1 });
    expect(room.feed.at(-1)).toMatchObject({ kind: "revive", a: "ALI", b: "OLIM" });
  });

  it("qutqarilmasa HP har soniyada kamayadi va chiqadi — kill yiqitganga; kadrda yiqilgani va qutqarish % ko'rinadi", () => {
    const { room, shoot } = setup();
    shoot("vali", "olim", START + 1000);
    room.input("ali", { x: 300, y: 300, rv: "olim" }, START + 1100);
    const st = newClientState();
    decodeRoomMessage(room.rosterMessage(), st, "olim", null);
    const d = decodeRoomMessage(room.frame(START + 1100 + REVIVE_MS / 2, "olim", { pickups: 0, feed: 0 }), st, "olim", { weapon: "Lazer-1", cooldown: 0.36, name: "OLIM", skin: "bolt" })!;
    expect(d.world.peers.find((p) => p.id === "olim")).toMatchObject({ downed: true, revive: 50 });
    expect(d.me).toMatchObject({ downed: true, lives: DOWN_HP });
    room.input("ali", { x: 900, y: 300 }, START + 1200); // ketib qoldi
    room.step(START + 1000 + BLEED_MS * 5);
    expect(room.players.get("olim")!.lives).toBe(DOWN_HP - 5);
    room.step(START + 1000 + BLEED_MS * DOWN_HP);
    expect(room.players.get("olim")).toMatchObject({ out: true, downed: false, killedBy: "VALI" });
    expect(room.players.get("vali")!.kills).toBe(1);
  });

  it("jamoasida tik turgan qolmasa — yiqilmaydi, chiqadi; yiqilganlar ham chiqadi", () => {
    const { room, shoot } = setup();
    shoot("vali", "olim", START + 1000); // olim yiqildi (ali tik)
    room.players.get("ali")!.lives = 10;
    shoot("vali", "ali", START + 2000); // ali: jamoada tik turgan yo'q — darhol chiqadi
    expect(room.players.get("ali")).toMatchObject({ out: true, killedBy: "VALI" });
    room.step(START + 2100);
    expect(room.players.get("olim")).toMatchObject({ out: true, killedBy: "VALI" });
    expect(room.players.get("vali")!.kills).toBe(2);
  });
});
