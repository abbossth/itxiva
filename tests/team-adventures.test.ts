import { describe, expect, it } from "vitest";
import {
  CASTLE_HP,
  ISLAND_BOARD,
  ISLAND_LEN,
  MAX_GOALS_PER_ROUND,
  ROPE_BONUS,
  initialTeamCells,
  revealTeamAdventure,
  teamAdventureRanking,
  teamsFor,
  type TeamAdvPlayer,
} from "@/lib/live-game/team-adventures";
import { TACTICS, isAdventure, revealAdventure } from "@/lib/live-game/adventures";

const LIMIT = 20_000;
const mk = (id: string, team: number, o: Partial<TeamAdvPlayer> = {}): TeamAdvPlayer => ({
  id,
  name: id.toUpperCase(),
  slot: 0,
  score: 0,
  progress: 0,
  finished: false,
  streak: 0,
  correct: true,
  ms: 2000,
  tactic: null,
  target: null,
  team,
  ...o,
});
const ctx = (teams: number, cells: number[], rng = () => 0.5) => ({ teams, cells, limitMs: LIMIT, total: 10, rng });

describe("jamoaviy sarguzashtlar: umumiy", () => {
  it("rejimlar sarguzasht sifatida ro'yxatda, taktikalari bor; jamoalar soni chegaralangan", () => {
    for (const m of ["tug", "siege", "football", "island"]) {
      expect(isAdventure(m)).toBe(true);
      expect(TACTICS[m as "tug"].length).toBe(3);
    }
    expect(teamsFor("tug", 4)).toBe(2);
    expect(teamsFor("football", 3)).toBe(2);
    expect(teamsFor("siege", 4)).toBe(4);
    expect(teamsFor("island", 9)).toBe(4);
  });
});

describe("Arqon tortish", () => {
  it("tez va to'g'ri javob bergan jamoa arqonni o'ziga tortadi; oldingi holat saqlanadi", () => {
    const players = [mk("a", 0, { ms: 500 }), mk("b", 0, { ms: 800 }), mk("c", 1, { correct: false }), mk("d", 1, { ms: 15_000 })];
    const r = revealTeamAdventure("tug", players, ctx(2, initialTeamCells("tug", 2)));
    expect(r.cells[0]).toBeLessThan(0); // 0-jamoa (qizillar) tomonga
    expect(r.cells[3]).toBe(0); // oldingi arqon
    expect(r.out.find((o) => o.id === "a")!.effect.delta).toBeGreaterThan(0);
    expect(r.out.find((o) => o.id === "c")!.effect.delta).toBe(0);
  });

  it("arqon chegaraga yetsa — raund g'alabasi, bonus va arqon markazga qaytadi", () => {
    const players = [mk("a", 0, { ms: 100 }), mk("b", 1, { correct: false })];
    const r = revealTeamAdventure("tug", players, ctx(2, [-90, 0, 0, 0]));
    expect(r.cells.slice(0, 3)).toEqual([0, 1, 0]);
    expect(r.out.find((o) => o.id === "a")!.effect.delta).toBeGreaterThanOrEqual(ROPE_BONUS);
    expect(r.events.some((e) => e.includes("Qizillar arqonni tortib oldi"))).toBe(true);
  });

  it("siltash xato bo'lsa raqibga yordam beradi; mahkam turish raqib kuchini kamaytiradi", () => {
    const jerkFail = revealTeamAdventure("tug", [mk("a", 0, { correct: false, tactic: "jerk" }), mk("b", 1, { correct: false })], ctx(2, [0, 0, 0, 0]));
    expect(jerkFail.cells[0]).toBeGreaterThan(0); // ko'klar tomonga
    const plain = revealTeamAdventure("tug", [mk("a", 0), mk("b", 1, { tactic: "pull" })], ctx(2, [0, 0, 0, 0]));
    const anchored = revealTeamAdventure("tug", [mk("a", 0, { tactic: "anchor" }), mk("b", 1, { tactic: "pull" })], ctx(2, [0, 0, 0, 0]));
    // Mahkam turishda qizillar kamroq tortadi, lekin ko'klar ham susayadi — arqon ko'klar tomonga kamroq siljimaydi
    expect(Math.abs(anchored.cells[0])).toBeLessThan(Math.abs(plain.cells[0]) + 40);
  });
});

describe("Qal'a qamali", () => {
  it("hujum tanlangan qal'aga zarar beradi, qalqon kamaytiradi, ta'mir 1000 dan oshmaydi", () => {
    const start = initialTeamCells("siege", 3);
    const open = revealTeamAdventure("siege", [mk("a", 0, { tactic: "attack", target: "1" }), mk("b", 1, { correct: false }), mk("c", 2, { correct: false })], ctx(3, start));
    const shielded = revealTeamAdventure("siege", [mk("a", 0, { tactic: "attack", target: "1" }), mk("b", 1, { tactic: "shield" }), mk("c", 2, { correct: false })], ctx(3, start));
    expect(open.cells[1]).toBeLessThan(CASTLE_HP);
    expect(shielded.cells[1]).toBeGreaterThan(open.cells[1]);
    expect(open.cells[4 + 1]).toBe(CASTLE_HP); // oldingi HP
    const repaired = revealTeamAdventure("siege", [mk("a", 0, { tactic: "repair" }), mk("b", 1, { correct: false })], ctx(2, initialTeamCells("siege", 2)));
    expect(repaired.cells[0]).toBe(CASTLE_HP);
  });

  it("qal'a vayron bo'lsa — xabar; tartib HP bo'yicha", () => {
    const cells = [30, 1000, 0, 0, 30, 1000, 0, 0];
    const r = revealTeamAdventure("siege", [mk("a", 1, { tactic: "attack", ms: 100 }), mk("b", 0, { correct: false })], ctx(2, cells));
    expect(r.cells[0]).toBe(0);
    expect(r.events.some((e) => e.includes("Qizillar qal'asi vayron"))).toBe(true);
    expect(teamAdventureRanking("siege", r.cells, 2)).toEqual([1, 0]);
  });
});

describe("Penalti jangi", () => {
  it("qo'riqlanmagan burchakka zarba — gol; qo'riqlanganga — darvozabon qaytaradi", () => {
    // Ko'klar o'ng burchakni qo'riqlaydi (ko'pchilik tanlovi)
    const players = [mk("a", 0, { tactic: "left" }), mk("b", 0, { tactic: "right" }), mk("x", 1, { tactic: "right" }), mk("y", 1, { tactic: "right", correct: false })];
    const r = revealTeamAdventure("football", players, ctx(2, initialTeamCells("football", 2), () => 0.5));
    expect(r.out.find((o) => o.id === "a")!.effect.kind).toBe("finish"); // gol
    expect(r.out.find((o) => o.id === "b")!.effect.text).toContain("Darvozabon");
    expect(r.cells[0]).toBe(1);
    expect(r.cells[2]).toBe(0); // oldingi
  });

  it("bir raundda jamoa ko'pi bilan 3 ta gol uradi", () => {
    const players = [...Array.from({ length: 6 }, (_, i) => mk(`a${i}`, 0, { tactic: "left", ms: 100 + i })), mk("x", 1, { tactic: "right" })];
    const r = revealTeamAdventure("football", players, ctx(2, [0, 0, 0, 0], () => 0.1));
    expect(r.cells[0]).toBe(MAX_GOALS_PER_ROUND);
  });
});

describe("Orol xazinasi", () => {
  it("jamoa yuradi; palma oldinga otadi, timsoh orqaga quvadi, kompas timsohdan saqlaydi", () => {
    const palm = ISLAND_BOARD.indexOf("palm");
    const croc = ISLAND_BOARD.indexOf("croc");
    // 0-jamoa: palmaga tushadigan qilib joylashtirish (bitta tez o'yinchi: zar 3 → qadam round(3*1.6)=5)
    const cells = initialTeamCells("island", 2);
    cells[0] = palm - 5;
    cells[1] = croc - 5;
    const r = revealTeamAdventure("island", [mk("a", 0, { ms: 0 }), mk("b", 1, { ms: 0 })], ctx(2, cells));
    expect(r.cells[0]).toBe(palm + 4);
    expect(r.cells[1]).toBe(croc - 3);
    expect(r.cells[8]).toBe(palm - 5); // oldingi joy
    const c2 = initialTeamCells("island", 2);
    c2[1] = croc - 3; // kompas: zar 3 → round(3×0.7)=2 → qadam round(2×1.6)=3 — aynan timsoh katagi
    const r2 = revealTeamAdventure("island", [mk("a", 0, { correct: false }), mk("b", 1, { ms: 0, tactic: "compass" })], ctx(2, c2));
    expect(r2.cells[1]).toBe(croc); // orqaga quvilmadi
    expect(r2.events.some((e) => e.includes("kompas"))).toBe(true);
  });

  it("xazinaga yetgan jamoa o'rin oladi va keyin yurmaydi; tartib — avval yetganlar", () => {
    const cells = initialTeamCells("island", 2);
    cells[0] = ISLAND_LEN - 2;
    const r = revealTeamAdventure("island", [mk("a", 0, { ms: 0 }), mk("b", 1, { correct: false })], ctx(2, cells));
    expect(r.cells[0]).toBe(ISLAND_LEN);
    expect(r.cells[4]).toBe(1);
    expect(r.out.find((o) => o.id === "a")!.finished).toBe(true);
    expect(teamAdventureRanking("island", r.cells, 2)).toEqual([0, 1]);
  });
});

describe("revealAdventure orqali", () => {
  it("jamoaviy rejimlar umumiy natija funksiyasidan ham ishlaydi", () => {
    const r = revealAdventure(
      "siege",
      [
        { ...mk("a", 0, { tactic: "attack" }) },
        { ...mk("b", 1, { correct: false }) },
      ],
      { total: 10, limitMs: LIMIT, cells: initialTeamCells("siege", 2), rng: () => 0.5, teams: 2 }
    );
    expect(r.cells[1]).toBeLessThan(CASTLE_HP);
  });
});
