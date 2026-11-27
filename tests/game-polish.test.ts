import { describe, expect, it } from "vitest";
import { Spring, capDt, clamp01, ease, spring } from "@/lib/game/easing";
import { FloatTextPool, HitStop, ParticlePool, Shake } from "@/lib/game/fx";
import { RigActor, TRANSITIONS, type CharState } from "@/lib/game/rig";
import { RARITIES, SKINS, rarityOf, skinById, skinFx } from "@/lib/game/skins";
import { alpha, theme, tone3 } from "@/lib/game/theme";
import { CHAR_ITEMS, charItem } from "@/lib/character/catalog";

const run = (a: RigActor, seconds: number, moving = false) => {
  for (let t = 0; t < seconds; t += 1 / 60) a.update(1 / 60, { moving });
};

describe("easing", () => {
  it("starts at 0 and ends at 1", () => {
    for (const f of Object.values(ease)) {
      expect(f(0)).toBeCloseTo(0, 5);
      expect(f(1)).toBeCloseTo(1, 5);
    }
  });
  it("outBack overshoots, spring settles", () => {
    expect(Math.max(...Array.from({ length: 50 }, (_, i) => ease.outBack(i / 49)))).toBeGreaterThan(1);
    const v = { v: 0 };
    let x = 0;
    for (let i = 0; i < 600; i++) x = spring(x, 1, v);
    expect(x).toBeCloseTo(1, 3);
    const s = new Spring(0);
    for (let i = 0; i < 300; i++) s.to(5, 1 / 60);
    expect(s.value).toBeCloseTo(5, 2);
  });
  it("caps delta time at 1/30 s", () => {
    expect(capDt(500)).toBeCloseTo(1 / 30);
    expect(capDt(8)).toBeCloseTo(0.008);
    expect(clamp01(-2)).toBe(0);
  });
});

describe("theme", () => {
  it("makes rgba strings and 3-tone shades (shadow darker, light lighter, never pure black/white)", () => {
    expect(alpha("#FFFFFF", 0.5)).toBe("rgba(255,255,255,0.5)");
    const t = tone3(theme.palette.primary);
    const lum = (h: string) => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16);
    expect(lum(t.shadow)).toBeLessThan(lum(t.base));
    expect(lum(t.light)).toBeGreaterThan(lum(t.base));
    expect(t.shadow).not.toBe("#000000");
    expect(t.light).not.toBe("#ffffff");
  });
});

describe("character rig state machine", () => {
  it("only follows allowed transitions (or goes through idle)", () => {
    const a = new RigActor({ seed: 1 });
    expect(a.state).toBe("idle");
    expect(a.request("jump")).toBe(true);
    // jump → celebrate is not allowed and jump is locked for a moment: queued instead
    expect(a.request("celebrate")).toBe(false);
    for (const [from, tos] of Object.entries(TRANSITIONS) as [CharState, CharState[]][]) expect(tos).not.toContain(from);
  });
  it("runs while moving, lands after a jump, returns to idle", () => {
    const a = new RigActor({ seed: 2 });
    run(a, 0.1, true);
    expect(a.state).toBe("run");
    let steps = 0;
    for (let i = 0; i < 60; i++) {
      a.update(1 / 60, { moving: true });
      if (a.stepped) steps++;
    }
    expect(steps).toBeGreaterThan(3);
    run(a, 0.1, false);
    expect(a.state).toBe("idle");
    a.request("jump");
    const seen = new Set<CharState>();
    for (let i = 0; i < 90; i++) {
      a.update(1 / 60, { moving: false });
      seen.add(a.state);
    }
    expect([...seen]).toEqual(expect.arrayContaining(["fall", "land", "idle"]));
  });
  it("celebrates from running (via idle) and hit always interrupts", () => {
    const a = new RigActor({ seed: 3 });
    run(a, 0.2, true);
    expect(a.request("celebrate")).toBe(true);
    expect(a.state).toBe("celebrate");
    expect(a.pose().face).toBe("happy");
    expect(a.request("hit")).toBe(true);
    expect(a.pose().face).toBe("hit");
  });
  it("knock-out falls over and stays down until revived", () => {
    const a = new RigActor({ seed: 4 });
    a.knockOut();
    run(a, 2);
    expect(a.state).toBe("sad");
    expect(a.pose().down).toBeCloseTo(1, 1);
    expect(a.request("celebrate")).toBe(false);
    a.revive();
    expect(a.state).toBe("idle");
  });
  it("squash keeps volume and blinks within 5 s", () => {
    const a = new RigActor({ seed: 5 });
    a.request("jump");
    run(a, 0.05);
    const p = a.pose();
    expect(p.sx * p.sy).toBeGreaterThan(0.9);
    expect(p.sx * p.sy).toBeLessThan(1.1);
    const b = new RigActor({ seed: 6 });
    let blinked = false;
    for (let i = 0; i < 60 * 5.2; i++) {
      b.update(1 / 60, { moving: false });
      if (b.pose().face === "blink") blinked = true;
    }
    expect(blinked).toBe(true);
  });
});

describe("effects", () => {
  it("particle pool never grows past its capacity", () => {
    const pool = new ParticlePool(20);
    for (let i = 0; i < 10; i++) pool.emit(0, 0, { color: "#fff", n: 8 });
    expect(pool.alive).toBeLessThanOrEqual(20);
    pool.step(5);
    expect(pool.alive).toBe(0);
    const texts = new FloatTextPool(3);
    for (let i = 0; i < 6; i++) texts.add(0, 0, "+30", "#fff");
    texts.step(0.1);
  });
  it("hit-stop freezes visual time only for a short moment; shake decays", () => {
    const h = new HitStop();
    h.trigger(500);
    let frozen = 0;
    for (let i = 0; i < 20; i++) if (h.filter(1 / 60) === 0) frozen++;
    expect(frozen).toBeGreaterThan(3);
    expect(frozen).toBeLessThanOrEqual(6);
    const s = new Shake();
    s.add(20);
    for (let i = 0; i < 60; i++) s.step(1 / 60);
    expect(s.x).toBe(0);
  });
});

describe("skins", () => {
  it("has one example skin per rarity, sold as costumes in the catalog", () => {
    expect(RARITIES.map((r) => SKINS.filter((s) => s.rarity === r).length)).toEqual([1, 1, 1, 1]);
    for (const s of SKINS) {
      const it = charItem("costume", s.id);
      expect(it).toMatchObject({ name: s.name, price: s.price, level: s.level });
      expect(rarityOf(it!)).toBe(s.rarity);
    }
    expect(new Set(CHAR_ITEMS.map((i) => `${i.slot}:${i.id}`)).size).toBe(CHAR_ITEMS.length);
  });
  it("legendary has aura and its own celebration; epic has idle particles", () => {
    const legend = SKINS.find((s) => s.rarity === "legendary")!;
    expect(skinFx(legend.id)).toMatchObject({ celebrate: "flex" });
    expect(skinFx(legend.id).aura).toBeTruthy();
    expect(skinFx(SKINS.find((s) => s.rarity === "epic")!.id).particles).toBeTruthy();
    expect(skinFx("none")).toMatchObject({ aura: null, particles: null, celebrate: "cheer" });
    expect(skinById("palvon")?.name).toBe("Xorazm palvoni");
  });
  it("grades other items by price", () => {
    expect(rarityOf({ slot: "hair", id: "short", price: 0 })).toBe("common");
    expect(rarityOf({ slot: "head", id: "crown", price: 22 })).toBe("legendary");
    expect(rarityOf({ slot: "costume", id: "cat", price: 50 })).toBe("common");
  });
});
