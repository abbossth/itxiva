import { getAudioContext } from "@/lib/sound";
import type { ModeTheme } from "./themes";

// Jonli o'yin fon musiqasi: Web Audio'da sintez qilinadigan original kuylar (fayl yo'q, mualliflik huquqi muammosi yo'q).
// Studiya uslubidagi miks: kompressor + limiter, umumiy reverb ("zal"), stereo ping-pong delay, kick ostida boshqa
// cholg'ular pasayadi (sidechain). Cholg'ular: kick (zarb + "klik"), snare va clap, hi-hat (yopiq/ochiq), bas (saw + sub),
// keng pad (detune qilingan saw'lar, stereo), arpedjio, melodiya (vibrato bilan) va qo'ng'iroq (FM).
// Tuzilma — 32 takt: 1–8 yengil (baraban + pad + bas), 9–16 arpedjio qo'shiladi, 17–24 melodiya, 25–32 to'liq;
// har 4-taktning oxirida baraban o'tishi (fill) va keyingi takt boshida tarelka. Faqat proyektorda chalinadi.

export type MusicTrack = "lobby" | "question" | "board" | "victory";

type ChordType = "maj" | "min" | "maj7" | "m7" | "7" | "sus4" | "add9";
interface Chord {
  root: number;
  type: ChordType;
}

interface TrackDef {
  bpm: number;
  /** Major va minor variantdagi akkordlar ketma-ketligi (har takt bitta) */
  major: Chord[];
  minor: Chord[];
  /** Har takt 16 qadam: 1 — zarb, 0 — yo'q (ikki takt uchun 32 qadam bo'lishi mumkin) */
  kick: number[];
  snare: number[];
  clap: number[];
  hat: number[];
  /** Ochiq hi-hat qadamlari */
  openHat: number[];
  /** Bas: qadamdagi oktava siljishi (0 — ildiz, 7 — kvinta, 12 — oktava), null — yo'q */
  bass: (number | null)[];
  /** Arpedjio: akkord tovushi indeksi (0–3; 4+ — keyingi oktava), null — yo'q */
  arp: (number | null)[];
  /** Melodiya (32 qadam = 2 takt): akkord tovushi indeksi, null — yo'q; uzunligi qadamlarda */
  lead: (number | null)[];
  leadLen: number;
  /** Swing (0 — tekis, 0.1–0.2 — "sakrovchi" ritm) */
  swing: number;
  /** Qo'ng'iroq (kutish zalida) */
  bells: boolean;
  level: number;
  /** Doim minor/major (theme'dan qat'i nazar) */
  force?: "major" | "minor";
}

const x = 1;
const _ = 0;
const N = null;

const TRACKS: Record<MusicTrack, TrackDef> = {
  // Kutish zali: yengil, iliq lo-fi groove
  lobby: {
    bpm: 96,
    major: [
      { root: 53, type: "maj7" },
      { root: 52, type: "m7" },
      { root: 50, type: "m7" },
      { root: 48, type: "maj7" },
    ],
    minor: [
      { root: 57, type: "m7" },
      { root: 53, type: "maj7" },
      { root: 48, type: "maj7" },
      { root: 55, type: "7" },
    ],
    kick: [x, _, _, _, _, _, _, x, _, _, x, _, _, _, _, _],
    snare: [_, _, _, _, x, _, _, _, _, _, _, _, x, _, _, _],
    clap: [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    hat: [x, _, x, _, x, _, x, _, x, _, x, _, x, _, x, x],
    openHat: [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    bass: [0, N, N, N, N, N, N, 0, N, N, 7, N, N, N, 12, N],
    arp: [0, N, 2, N, 1, N, 3, N, 2, N, 4, N, 3, N, 1, N],
    lead: [4, N, N, N, 3, N, 2, N, N, N, 1, N, 2, N, N, N, 3, N, N, N, 2, N, 1, N, N, N, 0, N, N, N, N, N],
    leadLen: 3,
    swing: 0.14,
    bells: true,
    level: 0.5,
  },
  // Savol paytida: keskin, oldinga intiluvchi (oxirgi soniyalarda tezlashadi)
  question: {
    bpm: 128,
    major: [
      { root: 50, type: "min" },
      { root: 46, type: "maj" },
      { root: 53, type: "maj" },
      { root: 48, type: "maj" },
    ],
    minor: [
      { root: 50, type: "min" },
      { root: 46, type: "maj" },
      { root: 53, type: "maj" },
      { root: 48, type: "sus4" },
    ],
    kick: [x, _, _, _, x, _, _, _, x, _, _, _, x, _, _, _],
    snare: [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
    clap: [_, _, _, _, x, _, _, _, _, _, _, _, x, _, _, _],
    hat: [_, _, x, _, _, _, x, _, _, _, x, _, _, _, x, _],
    openHat: [_, _, x, _, _, _, x, _, _, _, x, _, _, _, x, _],
    bass: [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 0, 7, 12, 0],
    arp: [0, 1, 2, 4, 2, 1, 0, 1, 2, 4, 5, 4, 2, 1, 2, 3],
    lead: [4, N, N, 5, N, N, 4, N, 3, N, N, N, 2, N, 3, N, 4, N, N, 6, N, N, 5, N, 4, N, N, N, N, N, N, N],
    leadLen: 2,
    swing: 0,
    bells: false,
    level: 0.44,
    force: "minor",
  },
  // Reyting va natija: quvnoq, "funk" ruhida
  board: {
    bpm: 116,
    major: [
      { root: 48, type: "add9" },
      { root: 55, type: "maj" },
      { root: 57, type: "m7" },
      { root: 53, type: "maj7" },
    ],
    minor: [
      { root: 57, type: "m7" },
      { root: 53, type: "maj7" },
      { root: 55, type: "maj" },
      { root: 52, type: "7" },
    ],
    kick: [x, _, _, x, _, _, x, _, _, _, x, _, _, _, _, _],
    snare: [_, _, _, _, x, _, _, _, _, _, _, _, x, _, _, x],
    clap: [_, _, _, _, x, _, _, _, _, _, _, _, x, _, _, _],
    hat: [x, x, x, _, x, x, x, _, x, x, x, _, x, x, x, _],
    openHat: [_, _, _, x, _, _, _, x, _, _, _, x, _, _, _, x],
    bass: [0, N, 0, 12, N, 0, N, 7, 0, N, 0, 12, N, 0, 7, N],
    arp: [0, 2, 1, 3, 2, 4, 3, 2, 0, 2, 1, 3, 4, N, 3, N],
    lead: [2, N, 3, N, 4, N, N, 4, 5, N, 4, N, 3, N, N, N, 2, N, 3, N, 4, N, 6, N, 5, N, 4, N, 3, N, N, N],
    leadLen: 2,
    swing: 0.06,
    bells: false,
    level: 0.5,
  },
  // G'oliblar: tantanali madhiya
  victory: {
    bpm: 112,
    major: [
      { root: 48, type: "maj" },
      { root: 53, type: "maj" },
      { root: 55, type: "sus4" },
      { root: 55, type: "maj" },
    ],
    minor: [
      { root: 48, type: "maj" },
      { root: 53, type: "maj" },
      { root: 55, type: "sus4" },
      { root: 55, type: "maj" },
    ],
    kick: [x, _, _, _, x, _, _, _, x, _, _, _, x, _, x, _],
    snare: [_, _, _, _, x, _, _, _, _, _, _, _, x, _, _, _],
    clap: [_, _, _, _, x, _, _, _, _, _, _, _, x, _, _, _],
    hat: [x, _, x, _, x, _, x, _, x, _, x, _, x, _, x, _],
    openHat: [_, _, _, _, _, _, _, _, _, _, _, _, _, _, _, x],
    bass: [0, N, N, 0, N, N, 7, N, 0, N, N, 0, 12, N, 7, N],
    arp: [0, N, 2, N, 4, N, 2, N, 0, N, 2, N, 4, N, 5, N],
    lead: [4, N, N, 4, 5, N, 6, N, N, N, 6, N, 5, N, 4, N, 5, N, N, 5, 6, N, 7, N, N, N, N, N, N, N, N, N],
    leadLen: 3,
    swing: 0,
    bells: false,
    level: 0.48,
    force: "major",
  },
};

const INTERVALS: Record<ChordType, number[]> = {
  maj: [0, 4, 7, 12],
  min: [0, 3, 7, 12],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  "7": [0, 4, 7, 10],
  sus4: [0, 5, 7, 12],
  add9: [0, 4, 7, 14],
};

const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
/** Akkord tovushi: indeks 0–3, 4+ — keyingi oktavalar */
const tone = (c: Chord, i: number) => c.root + INTERVALS[c.type][((i % 4) + 4) % 4] + Math.floor(i / 4) * 12;

class LiveMusic {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private drums: GainNode | null = null;
  private music: GainNode | null = null;
  private duck: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private delayIn: GainNode | null = null;
  private dl: DelayNode | null = null;
  private dr: DelayNode | null = null;
  private noise: AudioBuffer | null = null;
  private shaper: WaveShaperNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private track: MusicTrack | null = null;
  private step = 0;
  private nextAt = 0;
  private boost = false;
  private enabled = true;
  private theme: ModeTheme["music"] | null = null;
  private def: TrackDef | null = null;
  private chords: Chord[] = [];
  private arpWave: OscillatorType = "triangle";

  /** Rejim uslubi: tonallik, tezlik, tembr (har rejimning o'z kuyi) */
  setTheme(theme: ModeTheme["music"] | null) {
    const same = JSON.stringify(theme) === JSON.stringify(this.theme);
    this.theme = theme;
    if (!same && this.track) {
      const t = this.track;
      this.track = null;
      this.play(t);
    }
  }

  private prepare(def: TrackDef) {
    const th = this.theme;
    const minor = def.force ? def.force === "minor" : Boolean(th?.minor);
    const base = minor ? def.minor : def.major;
    const shift = th ? th.transpose : 0;
    this.chords = base.map((c) => ({ root: c.root + shift, type: c.type }));
    this.arpWave = th?.wave ?? "triangle";
    this.def = { ...def, bpm: Math.round(def.bpm * (th?.tempo ?? 1)) };
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const ctx = getAudioContext();
    if (!ctx) return null;
    this.ctx = ctx;
    // Miks: cholg'ular → (sidechain) → master → kompressor → limiter → chiqish
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.1;
    limiter.connect(ctx.destination);
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -16;
    glue.knee.value = 8;
    glue.ratio.value = 3;
    glue.attack.value = 0.01;
    glue.release.value = 0.18;
    glue.connect(limiter);
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(glue);
    this.drums = ctx.createGain();
    this.drums.gain.value = 0.9;
    this.drums.connect(this.master);
    this.duck = ctx.createGain();
    this.duck.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = 0.85;
    this.music.connect(this.duck);
    // Reverb: so'nib boruvchi stereo shovqin (2,4 s)
    const len = Math.floor(ctx.sampleRate * 2.4);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8);
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    const rvb = ctx.createGain();
    rvb.gain.value = 0.28;
    this.reverb.connect(rvb).connect(this.duck);
    // Stereo ping-pong delay
    this.delayIn = ctx.createGain();
    const dl = ctx.createDelay(2);
    const dr = ctx.createDelay(2);
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const fbTone = ctx.createBiquadFilter();
    fbTone.type = "lowpass";
    fbTone.frequency.value = 3200;
    const pl = ctx.createStereoPanner();
    pl.pan.value = -0.6;
    const pr = ctx.createStereoPanner();
    pr.pan.value = 0.6;
    const ret = ctx.createGain();
    ret.gain.value = 0.22;
    this.delayIn.connect(dl);
    dl.connect(pl).connect(ret);
    dl.connect(dr);
    dr.connect(pr).connect(ret);
    dr.connect(fbTone).connect(fb).connect(dl);
    ret.connect(this.duck);
    dl.delayTime.value = 0.28;
    dr.delayTime.value = 0.28;
    this.dl = dl;
    this.dr = dr;
    // Yengil "issiq" to'yinish (kick va bas uchun)
    this.shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const v = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(v * 1.8) / Math.tanh(1.8);
    }
    this.shaper.curve = curve;
    this.shaper.connect(this.drums);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) this.stop();
  }

  /** Oxirgi soniyalarda tezroq va keskinroq */
  setBoost(on: boolean) {
    this.boost = on;
  }

  play(track: MusicTrack | null) {
    if (!this.enabled || track === null) {
      this.stop();
      return;
    }
    if (track === this.track && this.timer) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    this.prepare(TRACKS[track]);
    const def = this.def!;
    // Silliq o'tish: ovoz pasayib, yangi kuy bilan qayta ko'tariladi
    const now = ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0.0001, now, 0.08);
    this.master.gain.setTargetAtTime(def.level, now + 0.3, 0.35);
    const beat = 60 / def.bpm;
    // Delay — nuqtali sakkizlik (3/16) tempo bo'yicha
    this.dl?.delayTime.setValueAtTime(beat * 0.75, now);
    this.dr?.delayTime.setValueAtTime(beat * 0.75, now);
    this.track = track;
    this.step = 0;
    this.nextAt = now + 0.35;
    if (!this.timer) this.timer = setInterval(() => this.schedule(), 25);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.track = null;
    if (this.ctx && this.master) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0.0001, now, 0.2);
    }
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.track || !this.def) return;
    const def = this.def;
    const bpm = def.bpm * (this.boost ? 1.18 : 1);
    const stepDur = 60 / bpm / 4;
    // Fon tab'da taymer siyraklashadi — orqada qolib ketgan qadamlar tashlab yuboriladi (to'planib chalinmasin)
    if (this.nextAt < ctx.currentTime - 0.2) this.nextAt = ctx.currentTime + 0.05;
    while (this.nextAt < ctx.currentTime + 0.15) {
      const swing = this.step % 2 === 1 ? def.swing * stepDur : 0;
      this.playStep(def, this.step, this.nextAt + swing, stepDur);
      this.step = (this.step + 1) % (32 * 16);
      this.nextAt += stepDur;
    }
  }

  private playStep(def: TrackDef, step: number, t: number, dur: number) {
    const i = step % 16;
    const bar = Math.floor(step / 16);
    const section = Math.floor(bar / 8) % 4; // 0 yengil · 1 +arp · 2 +melodiya · 3 to'liq
    const chord = this.chords[bar % this.chords.length];
    const fillBar = bar % 4 === 3;
    const boost = this.boost;

    // ---- Barabanlar ----
    if (fillBar && i >= 12) {
      // O'tish: snare zarblari kuchayib boradi
      this.snare(t, 0.18 + (i - 12) * 0.08, 0.25);
      if (i === 14 || i === 15) this.snare(t + dur / 2, 0.3, 0.2);
    } else {
      if (def.kick[i] || (boost && i % 4 === 2)) this.kick(t, def.kick[i] ? 1 : 0.6);
      if (def.snare[i]) this.snare(t, 0.32, 0.22);
      if (def.clap[i] && section >= 1) this.clap(t);
    }
    if (bar % 4 === 0 && i === 0 && bar > 0) this.crash(t);
    if (def.hat[i] || (boost && section >= 1)) this.hat(t, i % 4 === 0 ? 0.05 : 0.08, false);
    if (def.openHat[i] && section >= 1) this.hat(t, 0.06, true);

    // ---- Pad (har takt boshida, butun takt davomida) ----
    if (i === 0) this.pad(chord, t, dur * 16, section === 0 ? 0.035 : 0.045);

    // ---- Bas ----
    const b = def.bass[i];
    if (b !== null && b !== undefined) this.bass(midiToHz(chord.root - 12 + b), t, dur * 1.7);

    // ---- Arpedjio (2-bo'limdan) ----
    const a = def.arp[i];
    if (a !== null && a !== undefined && (section >= 1 || this.track === "question")) {
      this.pluck(midiToHz(tone(chord, a) + 12), t, dur * 0.95, this.arpWave, section >= 3 ? 0.05 : 0.04);
    }

    // ---- Melodiya (3-bo'limdan) ----
    const li = (bar % 2) * 16 + i;
    const l = def.lead[li];
    if (l !== null && l !== undefined && section >= 2) this.lead(midiToHz(tone(chord, l) + 12), t, dur * def.leadLen, this.track === "victory");

    // ---- Qo'ng'iroq (kutish zalida, har 2 taktda) ----
    if (def.bells && i % 8 === 0 && bar % 2 === 1) this.bell(midiToHz(tone(chord, 4 + ((bar + i / 8) % 3)) + 12), t);

    // ---- Riser: 8-taktlik bo'lim oxirida ----
    if (bar % 8 === 7 && i === 0) this.riser(t, dur * 16);
  }

  // ---------- Cholg'ular ----------

  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private send(node: AudioNode, reverb = 0, delay = 0) {
    const ctx = this.ctx!;
    if (reverb > 0 && this.reverb) {
      const s = ctx.createGain();
      s.gain.value = reverb;
      node.connect(s).connect(this.reverb);
    }
    if (delay > 0 && this.delayIn) {
      const s = ctx.createGain();
      s.gain.value = delay;
      node.connect(s).connect(this.delayIn);
    }
  }

  private kick(t: number, vel = 1) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(165, t);
    osc.frequency.exponentialRampToValueAtTime(46, t + 0.11);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.95 * vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    osc.connect(g).connect(this.shaper!);
    osc.start(t);
    osc.stop(t + 0.4);
    // "Klik" — zarb aniqroq eshitiladi
    this.noiseHit(t, "highpass", 2500, 0.12 * vel, 0.012, this.drums!);
    // Sidechain: boshqa cholg'ular bir lahza pasayadi — "nafas oluvchi" groove
    if (this.duck) {
      const d = this.duck.gain;
      d.cancelScheduledValues(t);
      d.setValueAtTime(d.value || 1, t);
      d.linearRampToValueAtTime(0.4, t + 0.012);
      d.setTargetAtTime(1, t + 0.04, 0.09);
    }
  }

  private noiseHit(t: number, type: BiquadFilterType, freq: number, level: number, decay: number, dest: AudioNode, q = 0.8) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + decay + 0.02);
    return g;
  }

  private snare(t: number, level: number, decay: number) {
    const ctx = this.ctx!;
    const g = this.noiseHit(t, "bandpass", 1900, level, decay, this.drums!, 0.9);
    this.send(g, 0.35);
    const osc = ctx.createOscillator();
    const og = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(210, t);
    osc.frequency.exponentialRampToValueAtTime(150, t + 0.08);
    this.env(og, t, 0.002, level * 0.8, 0.1);
    osc.connect(og).connect(this.drums!);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  private clap(t: number) {
    for (let k = 0; k < 3; k++) {
      const g = this.noiseHit(t + k * 0.011, "bandpass", 1250, 0.2, k === 2 ? 0.16 : 0.02, this.drums!, 1.2);
      if (k === 2) this.send(g, 0.4);
    }
  }

  private hat(t: number, level: number, open: boolean) {
    const g = this.noiseHit(t, "highpass", 7600, level, open ? 0.24 : 0.035, this.drums!, 0.7);
    if (open) this.send(g, 0.15);
  }

  private crash(t: number) {
    const g = this.noiseHit(t, "highpass", 5200, 0.12, 1.8, this.drums!, 0.5);
    this.send(g, 0.4);
  }

  private riser(t: number, len: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 2.5;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(7000, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + len * 0.95);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(this.music!);
    this.send(g, 0.3);
    src.start(t);
    src.stop(t + len + 0.05);
  }

  private bass(freq: number, t: number, dur: number) {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = 6;
    f.frequency.setValueAtTime(180, t);
    f.frequency.exponentialRampToValueAtTime(1100, t + 0.02);
    f.frequency.exponentialRampToValueAtTime(260, t + Math.min(0.25, dur));
    const g = ctx.createGain();
    this.env(g, t, 0.006, 0.26, dur);
    f.connect(g).connect(this.duck!);
    const saw = ctx.createOscillator();
    saw.type = "sawtooth";
    saw.frequency.value = freq;
    saw.connect(f);
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = freq / 2;
    const sg = ctx.createGain();
    sg.gain.value = 0.9;
    sub.connect(sg).connect(f);
    for (const o of [saw, sub]) {
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  private pad(chord: Chord, t: number, dur: number, level: number) {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.setValueAtTime(700, t);
    f.frequency.linearRampToValueAtTime(1600, t + dur * 0.5);
    f.frequency.linearRampToValueAtTime(900, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(level, t + Math.min(0.45, dur * 0.3));
    g.gain.setValueAtTime(level, t + dur * 0.85);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.25);
    f.connect(g).connect(this.music!);
    this.send(g, 0.45);
    INTERVALS[chord.type].forEach((iv, k) => {
      const freq = midiToHz(chord.root + 12 + iv);
      for (const det of [-9, 9]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = freq;
        o.detune.value = det + (k - 1.5) * 2;
        const p = ctx.createStereoPanner();
        p.pan.value = det < 0 ? -0.55 : 0.55;
        o.connect(p).connect(f);
        o.start(t);
        o.stop(t + dur + 0.3);
      }
    });
  }

  private pluck(freq: number, t: number, dur: number, wave: OscillatorType, level: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = wave;
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = 3;
    f.frequency.setValueAtTime(4200, t);
    f.frequency.exponentialRampToValueAtTime(700, t + dur);
    const g = ctx.createGain();
    this.env(g, t, 0.004, level, dur);
    o.connect(f).connect(g).connect(this.music!);
    this.send(g, 0.15, 0.45);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private lead(freq: number, t: number, dur: number, brass: boolean) {
    const ctx = this.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = 1.5;
    f.frequency.setValueAtTime(brass ? 600 : 1500, t);
    f.frequency.exponentialRampToValueAtTime(brass ? 3600 : 3000, t + 0.06);
    f.frequency.exponentialRampToValueAtTime(brass ? 2200 : 1800, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(brass ? 0.07 : 0.05, t + 0.03);
    g.gain.setValueAtTime(brass ? 0.06 : 0.04, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.12);
    f.connect(g).connect(this.music!);
    this.send(g, 0.3, 0.3);
    // Vibrato
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(freq * 0.006, t + dur * 0.6);
    lfo.connect(lg);
    const oscs: OscillatorNode[] = [];
    for (const [type, det] of [
      ["sawtooth", -5],
      [brass ? "sawtooth" : "square", 5],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = det;
      lg.connect(o.frequency);
      o.connect(f);
      oscs.push(o);
    }
    for (const o of [...oscs, lfo]) {
      o.start(t);
      o.stop(t + dur + 0.15);
    }
  }

  private bell(freq: number, t: number) {
    const ctx = this.ctx!;
    const car = ctx.createOscillator();
    car.frequency.value = freq;
    const mod = ctx.createOscillator();
    mod.frequency.value = freq * 3.5;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(freq * 2, t);
    mg.gain.exponentialRampToValueAtTime(1, t + 1.2);
    mod.connect(mg).connect(car.frequency);
    const g = ctx.createGain();
    this.env(g, t, 0.005, 0.045, 1.6);
    car.connect(g).connect(this.music!);
    this.send(g, 0.5, 0.35);
    for (const o of [car, mod]) {
      o.start(t);
      o.stop(t + 1.7);
    }
  }
}

/** Bitta umumiy pleer (sahifa bo'ylab) */
export const liveMusic = new LiveMusic();
