import { describe, expect, it } from "vitest";
import { computeAwards, gameHasTeams } from "@/lib/live-game/modes";

// Jamoaviy qilib yaratilgan Kiber arena: mukofot jamoaviy — g'olib jamoaning har a'zosiga
describe("jamoaviy Kiber arena taqdirlash", () => {
  const players = [
    { id: "a1", score: 900, eliminated: false, eliminatedAt: null, team: 0, joinedAt: 1 },
    { id: "a2", score: 300, eliminated: false, eliminatedAt: null, team: 0, joinedAt: 2 },
    { id: "b1", score: 1000, eliminated: false, eliminatedAt: null, team: 1, joinedAt: 3 },
    { id: "b2", score: 100, eliminated: false, eliminatedAt: null, team: 1, joinedAt: 4 },
  ];
  it("arena + teamArena — jamoaviy deb hisoblanadi", () => {
    expect(gameHasTeams("arena", { teamArena: true })).toBe(true);
    expect(gameHasTeams("arena", { teamArena: false })).toBe(false);
  });
  it("g'olib jamoa (o'rtacha ochko) a'zolarining hammasi 1-o'rin mukofotini oladi", () => {
    const awards = computeAwards("arena", players, [30, 20, 10], 2, [], true);
    expect(awards.map((a) => a.id).sort()).toEqual(["a1", "a2"]);
    expect(awards.every((a) => a.place === 1 && a.coins === 30)).toBe(true);
  });
  it("yakka arena — avvalgidek 1/2/3-o'rinlar", () => {
    const awards = computeAwards("arena", players, [30, 20, 10], 2, [], false);
    expect(awards.map((a) => [a.id, a.coins])).toEqual([["b1", 30], ["a1", 20], ["a2", 10]]);
  });
});
