import { getAudioContext } from "@/lib/sound";

// Jonli o'yin fon musiqasi: Web Audio'da sintez qilinadigan original kuylar (fayl yo'q, mualliflik huquqi muammosi yo'q).
// Kichik 16 qadamli sekvenser: baraban (shovqin va sinus), bas, arpedjio. Faqat proyektorda chalinadi.

export type MusicTrack = "lobby" | "question" | "board" | "victory";

interface TrackDef {
  bpm: number;
  /** Har takt uchun akkord (MIDI ildiz va lad: minor/major) */
  chords: { root: number; minor: boolean }[];
  kick: number[];
  snare: number[];
  hat: number[];
  /** Bas: qadamlar (16 lik), qiymat — akkord notasining oktava siljishi; null — yo'q */
  bass: (number | null)[];
  /** Arpedjio: akkord tovushlari indeksi (0–3), null — yo'q */
  arp: (number | null)[];
  arpWave: OscillatorType;
  level: number;
}

const x = 1;
const _ = 0;

const TRACKS: Record<MusicTrack, TrackDef> = {
  // Yengil groove: kutish zali
  lobby: {
    bpm: 98,
    chords: [
      { root: 57, minor: true },
      { root: 53, minor: false },
      { root: 48, minor: false },
      { root: 55, minor: false },
    ],
    kick: [x, _, _, _, _, _, x, _, x, _, _, _, _, _, _, _],
    snare: [_, _, _, _, x, _, _, _, _, _, _, _, x, _, _, _],
    hat: [_, _, x, _, _, _, x, _, _, _, x, _, _, _, x, x],
    bass: [0, null, null, 0, null, null, 0, null, 0, null, null, 0, null, 12, null, null],
    arp: [0, null, 1, null, 2, null, 1, null, 3, null, 2, null, 1, null, 2, null],
    arpWave: "triangle",
    level: 0.55,
  },
  // Keskin: savol paytida (oxirgi soniyalarda tezlashadi)
  question: {
    bpm: 126,
    chords: [
      { root: 50, minor: true },
      { root: 50, minor: true },
      { root: 46, minor: false },
      { root: 48, minor: false },
    ],
    kick: [x, _, _, _, x, _, _, _, x, _, _, _, x, _, _, _],
    snare: [_, _, _, _, _, _, _, _, _, _, _, _, x, _, _, x],
    hat: [x, x, x, x, x, x, x, x, x, x, x, x, x, x, x, x],
    bass: [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 0, 7, 12, 0],
    arp: [0, 2, 1, 3, 0, 2, 1, 3, 0, 2, 1, 3, 0, 2, 3, 1],
    arpWave: "square",
    level: 0.42,
  },
  // Quvnoq: reyting va natija
  board: {
    bpm: 118,
    chords: [
      { root: 48, minor: false },
      { root: 55, minor: false },
      { root: 57, minor: true },
      { root: 53, minor: false },
    ],
    kick: [x, _, _, _, x, _, _, _, x, _, _, _, x, _, x, _],
    snare: [_, _, _, _, x, _, _, _, _, _, _, _, x, _, _, _],
    hat: [_, _, x, _, _, _, x, _, _, _, x, _, _, _, x, _],
    bass: [0, null, 0, 12, null, 0, null, 7, 0, null, 0, 12, null, 0, 7, null],
    arp: [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 3, null, 2, null],
    arpWave: "triangle",
    level: 0.5,
  },
  // Tantanali: g'oliblar
  victory: {
    bpm: 108,
    chords: [
      { root: 48, minor: false },
      { root: 53, minor: false },
      { root: 55, minor: false },
      { root: 48, minor: false },
    ],
    kick: [x, _, _, _, _, _, _, _, x, _, x, _, _, _, _, _],
    snare: [_, _, _, _, x, _, _, x, _, _, _, _, x, _, x, x],
    hat: [x, _, x, _, x, _, x, _, x, _, x, _, x, _, x, _],
    bass: [0, null, null, null, 7, null, null, null, 0, null, 12, null, 7, null, null, null],
    arp: [0, 1, 2, 3, 3, 2, 1, 2, 0, 2, 3, 3, 2, null, 3, null],
    arpWave: "sawtooth",
    level: 0.48,
  },
};

const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const chordNotes = (root: number, minor: boolean) => [root, root + (minor ? 3 : 4), root + 7, root + 12];

class LiveMusic {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private track: MusicTrack | null = null;
  private step = 0;
  private nextAt = 0;
  private boost = false;
  private enabled = true;

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const ctx = getAudioContext();
    if (!ctx) return null;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (!on) this.stop();
  }

  /** Oxirgi soniyalarda tezroq */
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
    const def = TRACKS[track];
    // Silliq o'tish: ovoz pasayib, yangi kuy bilan qayta ko'tariladi
    const now = ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(0.0001, now, 0.08);
    this.master.gain.setTargetAtTime(def.level * 0.35, now + 0.25, 0.3);
    this.track = track;
    this.step = 0;
    this.nextAt = now + 0.3;
    if (!this.timer) this.timer = setInterval(() => this.schedule(), 25);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.track = null;
    if (this.ctx && this.master) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0.0001, now, 0.15);
    }
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.track) return;
    const def = TRACKS[this.track];
    const bpm = def.bpm * (this.boost ? 1.25 : 1);
    const stepDur = 60 / bpm / 4;
    while (this.nextAt < ctx.currentTime + 0.12) {
      this.playStep(def, this.step, this.nextAt, stepDur);
      this.step = (this.step + 1) % 64;
      this.nextAt += stepDur;
    }
  }

  private playStep(def: TrackDef, step: number, t: number, dur: number) {
    const i = step % 16;
    const chord = def.chords[Math.floor(step / 16) % def.chords.length];
    const notes = chordNotes(chord.root, chord.minor);
    if (def.kick[i]) this.kick(t);
    if (def.snare[i]) this.snare(t);
    if (def.hat[i]) this.hat(t, i % 4 === 2 ? 0.07 : 0.04);
    const b = def.bass[i];
    if (b !== null && b !== undefined) this.synth(midiToHz(chord.root - 12 + b), t, dur * 1.6, "triangle", 0.22, 900);
    const a = def.arp[i];
    if (a !== null && a !== undefined) this.synth(midiToHz(notes[a] + 12), t, dur * 0.9, def.arpWave, 0.06, 2600);
  }

  private synth(freq: number, t: number, dur: number, wave: OscillatorType, level: number, cutoff: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = wave;
    osc.frequency.value = freq;
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(level, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(filter).connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private kick(t: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(g).connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  private noiseHit(t: number, type: BiquadFilterType, freq: number, level: number, decay: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t);
    src.stop(t + decay + 0.02);
  }

  private snare(t: number) {
    this.noiseHit(t, "bandpass", 1700, 0.35, 0.14);
  }

  private hat(t: number, level: number) {
    this.noiseHit(t, "highpass", 7000, level, 0.04);
  }
}

/** Bitta umumiy pleer (sahifa bo'ylab) */
export const liveMusic = new LiveMusic();
