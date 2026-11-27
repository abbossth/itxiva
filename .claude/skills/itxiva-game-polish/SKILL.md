---
name: itxiva-game-polish
description: Use when improving ITXiva browser games: redesigning characters, animations, skins, game elements, effects and UI so they look and feel professional instead of simple.
---

# ITXiva Game Polish

Goal: take simple ITXiva mini-games (made for students aged ~10-17, Uzbek UI) and make their characters, motion, skins and elements look like a professionally designed casual game — without breaking game logic or performance.

The user (Abbos) speaks Uzbek. Talk to him in Uzbek; keep code, identifiers and comments in English. All player-facing text in the game stays in Uzbek (Latin script).

## 0. Workflow (always follow in order)

1. **Audit first, change nothing.** Find every game in the repo (search for `canvas`, `requestAnimationFrame`, `phaser`, `pixi`, `game`, `o'yin`, `player`, `sprite`). For each game write a short table: file, render tech (DOM/CSS, SVG, Canvas 2D, Phaser, PixiJS, Three.js), characters, current animations, weak points.
2. **Detect the stack** (Next.js/React, Tailwind, framer-motion, etc. from `package.json`). Reuse what exists. Only add a dependency if it clearly pays off (e.g. `framer-motion` for DOM games, `gsap` for complex timelines). Ask before adding anything heavy.
3. **Propose a style direction** in 3-5 lines (palette, outline style, proportions, mood) and wait for approval before mass changes. One shared style for all ITXiva games.
4. **Work one game at a time**: art -> animation states -> juice/effects -> skins -> UI -> performance check.
5. **Verify**: run the dev server/build, play the game path, check console errors, check 60fps on mobile size (375px) and desktop, check `prefers-reduced-motion`.
6. **Report** in Uzbek: what changed, which files, what to test.

Never rewrite game rules, scoring, coin rewards or API calls unless asked. Polish is visual and feel only.

## 1. Shared visual style (ITXiva design language)

Create `game/theme.ts` (or the repo's equivalent) and use it everywhere — no hard-coded colors in game files.

```ts
export const theme = {
  outline: '#1E1B4B',        // dark indigo, never pure black
  outlineWidth: 3,           // scale with character size (~4% of height)
  palette: {
    primary: '#6366F1', primaryDark: '#4338CA', primaryLight: '#A5B4FC',
    accent: '#F59E0B', success: '#22C55E', danger: '#EF4444',
    skin: ['#FFD7B5', '#F1B98C', '#C68B59', '#8D5524'],
    bg: ['#EEF2FF', '#E0E7FF'],
  },
  shadow: 'rgba(30,27,75,0.25)',
  radius: 16,
  font: "'Nunito', 'Inter', system-ui, sans-serif",
};
```

Rules:
- **Shapes over details**: strong readable silhouette at 48px. Test by filling the character solid black — it must still be recognizable.
- **Proportions**: chibi/cartoon — head ≈ 40-45% of body height, big eyes, short limbs. Friendly for kids.
- **3-tone shading** per color: base, shadow (darker + slightly more saturated, hue shifted toward blue/purple), highlight (lighter, hue shifted toward yellow). Never shade with plain black/white.
- **Consistent outline** color and width across all characters and items.
- **Ground contact**: every character/item gets a soft elliptical shadow that shrinks when it jumps.
- **Light from top-left** for every asset.
- Backgrounds lower contrast and saturation than characters, so gameplay pops. Use 2-3 parallax layers when the game scrolls.

## 2. Characters as layered rigs (preferred: SVG or Canvas parts)

Do not draw characters as one flat shape or a single emoji. Build them from named parts so they can animate and accept skins:

```
character
├── shadow
├── body (torso)
├── legL, legR
├── armL, armR
├── head
│   ├── face (eyes, pupils, eyelids, mouth, cheeks)
│   └── hair / hat slot
└── accessory slots: back, hand, head, face, aura
```

Each part has a pivot point (shoulder, hip, neck) so it rotates naturally. In SVG use `<g>` per part with `transform-origin` set to the pivot; in Canvas keep a part list with `{x, y, rot, scaleX, scaleY, pivot}` and draw with save/translate/rotate/restore.

Face makes the character alive — always include:
- Blinking every 2-5 s (random), 120 ms.
- Pupils that look toward the target/cursor/next obstacle.
- Mouth/eye expressions per state: idle, happy, focused, surprised, hurt, sad, win.

If the user wants raster art instead, generate a consistent sprite sheet spec (frame size, frames per state, padding) and load it via a texture atlas; never mix wildly different art styles.

## 3. Animation system

### 3.1 State machine
Every character uses an explicit state machine, not scattered booleans:

```ts
type CharState = 'idle' | 'run' | 'jump' | 'fall' | 'land' | 'hit' | 'celebrate' | 'think' | 'sad';

const transitions: Record<CharState, CharState[]> = {
  idle: ['run', 'jump', 'hit', 'celebrate', 'think', 'sad'],
  run: ['idle', 'jump', 'hit'],
  jump: ['fall', 'hit'],
  fall: ['land', 'hit'],
  land: ['idle', 'run'],
  hit: ['idle'],
  celebrate: ['idle'],
  think: ['idle', 'celebrate', 'sad'],
  sad: ['idle'],
};
```

For quiz-style games (most ITXiva games): correct answer -> `celebrate`, wrong -> `hit`/`sad`, waiting -> `think`, idle long time -> small fidget animation.

### 3.2 Apply the animation principles
- **Squash & stretch**: jump take-off stretch (scaleY 1.15, scaleX 0.9), landing squash (scaleY 0.8, scaleX 1.15), keep volume (scaleX ≈ 1/scaleY).
- **Anticipation**: 80-120 ms crouch before jump/attack.
- **Follow-through & overlap**: hair, ears, tails, capes lag behind body by 1-3 frames (spring).
- **Easing**: never linear for character motion. Use the shared easing set below.
- **Arcs**: limbs and thrown objects move on arcs, not straight lines.
- **Secondary motion**: idle breathing (body scaleY 1 -> 1.03, 2 s loop), slight head bob.
- **Timing**: UI feedback 100-200 ms, character actions 200-400 ms, celebrations 600-1200 ms.

```ts
export const ease = {
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outElastic: (t: number) => t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1,
};

// damped spring for follow-through parts
export function spring(cur: number, target: number, vel: { v: number }, k = 120, d = 14, dt = 1 / 60) {
  const f = -k * (cur - target) - d * vel.v;
  vel.v += f * dt;
  return cur + vel.v * dt;
}
```

### 3.3 Game loop rules
- One `requestAnimationFrame` loop per game; use **delta time** (`dt` capped at 1/30 s) so speed is equal on 60 Hz and 120 Hz screens.
- Separate `update(dt)` from `render()`.
- Pause the loop on `visibilitychange` hidden.
- DOM games: animate only `transform` and `opacity`; add `will-change` only on actively animating nodes.

## 4. Game feel ("juice")

Add these where they fit, subtly — kids' game, not a casino:
- **Hit-stop**: freeze 60-90 ms on impact or correct answer.
- **Screen shake**: small (2-6 px), decaying, only on big events; respect reduced motion.
- **Particles**: confetti/stars on correct answer, dust puffs on land/run, sparkles on coin pickup. Object-pooled, max ~150 alive.
- **Coin feedback**: coin flies along an arc to the coin counter, counter bumps (scale 1.2 -> 1 outBack) and number counts up.
- **Floating text**: "+10", "Zo'r!", "Barakalla!", "Ajoyib!" rising and fading.
- **Combo/streak**: growing streak indicator with color shift (3, 5, 10 correct).
- **Buttons**: hover lift, press squash (scale 0.95), release overshoot; disabled state clearly gray.
- **Transitions**: screens slide/scale with easing, never instant swaps.
- **Sound hooks**: expose `playSfx('correct' | 'wrong' | 'coin' | 'jump' | 'click' | 'win')` with a global mute toggle saved in localStorage (try/catch). Do not autoplay music.

## 5. Skin system (data-driven, ready for the coin shop)

Skins are data, not code forks. Create `game/skins.ts`:

```ts
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface Skin {
  id: string;
  name: string;            // Uzbek, e.g. "Kosmonavt", "Ninja", "Xorazm palvoni"
  rarity: Rarity;
  price: number;           // ITXiva coins
  palette: Partial<{ body: string; bodyShadow: string; limbs: string; hair: string; eyes: string }>;
  parts?: Partial<{ head: string; back: string; hand: string; face: string; aura: string }>; // accessory ids
  effects?: { trail?: string; idleParticles?: string; celebrate?: string };
}
```

Rules:
- Rendering reads colors via CSS variables (SVG) or the palette object (Canvas), so one rig renders all skins.
- Rarity visual language: common = recolor; rare = recolor + accessory; epic = accessory + idle particles; legendary = unique accessory + aura + custom celebrate animation.
- Rarity frame colors: common gray `#94A3B8`, rare blue `#3B82F6`, epic purple `#A855F7`, legendary gold `#F59E0B` with animated shine.
- Include local-flavor skins students will love (e.g. Xorazm palvoni, Ichan qal'a qo'riqchisi, dutor ustasi, kosmonavt, robot, ninja, futbolchi) — respectful, no copyrighted characters, no brand logos.
- Build a **skin preview** component (rotating idle + celebrate demo) reusable in the shop page.
- Equip/ownership state comes from the existing backend; if none exists, define the interface and ask before creating API/DB changes.

## 6. Game elements & UI

- Items, obstacles, collectibles use the same outline/shading rules as characters, and all collectibles idle-animate (bob 4 px, 1.5 s, slight rotation or shine sweep).
- HUD: score, coins, timer, lives in rounded panels with soft shadow; timer turns orange at 30%, red and pulses at 10%.
- Question cards (quiz games): card enters with outBack scale, answers stagger in 50 ms apart; correct = green glow + check pop; wrong = red shake (3 cycles, 300 ms) and correct answer highlighted.
- Results screen: stars (1-3) appear one by one with sound + particles, character in `celebrate` or `sad`, clear buttons "Qayta o'ynash" / "Davom etish".
- Touch targets ≥ 44 px; works with keyboard (Enter/Space/arrows) as well.

## 7. Performance & accessibility checklist

- [ ] Stable 60fps on a mid-range Android at 375px width (test with CPU throttling 4x).
- [ ] Canvas sized with `devicePixelRatio` (cap at 2) so art is sharp, not blurry.
- [ ] Static parts pre-rendered to offscreen canvas / cached; particles pooled; no per-frame allocations in hot loops.
- [ ] Images in a single atlas or inline SVG; lazy-load per game.
- [ ] `prefers-reduced-motion`: disable shake, reduce particles, keep state feedback (color/icon).
- [ ] Color is never the only signal (add icons ✓/✗).
- [ ] No console errors; build passes; game logic and coin rewards unchanged.

## 8. Definition of done (per game)

1. Characters are layered rigs with face expressions and at least: idle (breathing + blink), action, success, fail states.
2. All motion uses easing and delta time; squash/stretch and anticipation on main actions.
3. Feedback for every player action within 100 ms (visual + sound hook).
4. Skins render through the shared skin system; at least 1 skin per rarity as examples.
5. Shared theme used, no hard-coded colors.
6. Checklist in section 7 passes.
7. Short Uzbek summary to the user with before/after description and files changed.
