import { describe, expect, it } from "vitest";
import { byScore, type BoardRow } from "@/components/live/arena/arena-scoreboard";

const row = (name: string, kills: number, deaths: number, out = false): BoardRow => ({ id: name, name, kills, deaths, lives: 3 - deaths, maxLives: 3, out, team: -1, isMe: false, look: null });

describe("Arena statistikasi tartibi", () => {
  it("ko'p kill oldinda; teng bo'lsa — kam o'lim, keyin tiriklar, keyin ism", () => {
    const rows = [row("Vali", 2, 1), row("Ali", 2, 1), row("Sardor", 5, 3, true), row("Madina", 2, 0), row("Bobur", 2, 3, true), row("Jasur", 0, 0)];
    expect([...rows].sort(byScore).map((r) => r.name)).toEqual(["Sardor", "Madina", "Ali", "Vali", "Bobur", "Jasur"]);
  });
});
