// Qisqa ovozli signallar (davomat, salyut). Audio fayl yo'q — Web Audio API bilan sintez qilinadi.

let ctx: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
  return getContext();
}

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

/** Foydalanuvchi harakati ichida chaqiriladi: brauzer to'xtatib qo'ygan audio kontekstni ishga tushiradi */
export function unlockSound(): void {
  const audio = getContext();
  if (audio && audio.state === "suspended") {
    audio.resume().catch(() => {});
  }
}

function playNote(audio: AudioContext, frequency: number, startAt: number, duration: number): void {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.35, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
}

/** O'quvchi davomatdan o'tganda "ding-ding". Bir vaqtda bir nechta o'quvchi qo'shilsa, ketma-ket (ko'pi bilan 3 marta) chalinadi */
export function playCheckInSound(count = 1): void {
  const audio = getContext();
  if (!audio) return;
  if (audio.state === "suspended") {
    audio.resume().catch(() => {});
  }
  const times = Math.max(1, Math.min(3, count));
  for (let i = 0; i < times; i++) {
    const t = audio.currentTime + i * 0.38;
    playNote(audio, 880, t, 0.18);
    playNote(audio, 1318.5, t + 0.12, 0.3);
  }
}

let noiseBuffer: AudioBuffer | null = null;

/** Oq shovqin: salyut "paq" etishi va chirsillashi shundan yasaladi */
function getNoise(audio: AudioContext): AudioBuffer {
  if (!noiseBuffer || noiseBuffer.sampleRate !== audio.sampleRate) {
    noiseBuffer = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

function scheduleFirework(audio: AudioContext, at: number, volume: number): void {
  // 1. Portlash: past chastotali shovqin
  const boomAt = at;
  const boom = audio.createBufferSource();
  boom.buffer = getNoise(audio);
  const boomFilter = audio.createBiquadFilter();
  boomFilter.type = "lowpass";
  boomFilter.frequency.setValueAtTime(2400, boomAt);
  boomFilter.frequency.exponentialRampToValueAtTime(300, boomAt + 0.35);
  const boomGain = audio.createGain();
  boomGain.gain.setValueAtTime(0.5 * volume, boomAt);
  boomGain.gain.exponentialRampToValueAtTime(0.0001, boomAt + 0.45);
  boom.connect(boomFilter).connect(boomGain).connect(audio.destination);
  boom.start(boomAt);
  boom.stop(boomAt + 0.5);

  // 2. Chirsillash: sochilayotgan uchqunlar
  const crackle = audio.createBufferSource();
  crackle.buffer = getNoise(audio);
  const crackleFilter = audio.createBiquadFilter();
  crackleFilter.type = "highpass";
  crackleFilter.frequency.value = 3500;
  const crackleGain = audio.createGain();
  crackleGain.gain.setValueAtTime(0.0001, boomAt);
  for (let i = 0; i < 9; i++) {
    const t = boomAt + 0.12 + i * 0.055 + Math.random() * 0.03;
    crackleGain.gain.setValueAtTime(0.09 * volume * (1 - i / 10), t);
    crackleGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
  }
  crackle.connect(crackleFilter).connect(crackleGain).connect(audio.destination);
  crackle.start(boomAt);
  crackle.stop(boomAt + 0.75);
}

/**
 * Salyut ovozi: portlash va chirsillash. `delays` — har bir otilishgacha soniyalar.
 * Brauzer ovozga faqat foydalanuvchi sahifa bilan ishlagandan keyin ruxsat beradi: sahifa to'g'ridan-to'g'ri
 * ochilgan (yoki yangilangan) bo'lsa, ovoz chiqmaydi — kechikib chalinmasligi uchun shunchaki o'tkazib yuboriladi.
 */
export function playFireworksSound(delays: number[] = [0], volume = 1): void {
  const audio = getContext();
  if (!audio) return;
  const play = () => {
    for (const delay of delays) scheduleFirework(audio, audio.currentTime + Math.max(0, delay), volume);
  };
  if (audio.state === "running") {
    play();
    return;
  }
  let late = false;
  const timer = setTimeout(() => {
    late = true;
  }, 250);
  audio
    .resume()
    .then(() => {
      clearTimeout(timer);
      if (!late) play();
    })
    .catch(() => clearTimeout(timer));
}

// ---- Umumiy "zal": kompressor (baland ovozlar qulog'ni og'ritmasin) va yengil aks-sado (reverb) ----
// Notalar to'g'ridan-to'g'ri va aks-sado orqali chiqadi — ovoz "quruq" emas, to'liqroq va jonliroq eshitiladi.
let bus: { ctx: AudioContext; master: AudioNode; reverb: AudioNode } | null = null;

function fxBus(audio: AudioContext) {
  if (bus && bus.ctx === audio) return bus;
  const comp = audio.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  comp.connect(audio.destination);
  // Aks-sado: so'nib boruvchi shovqindan sun'iy "zal" javobi (1,8 s)
  const len = Math.floor(audio.sampleRate * 1.8);
  const ir = audio.createBuffer(2, len, audio.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  const conv = audio.createConvolver();
  conv.buffer = ir;
  const wet = audio.createGain();
  wet.gain.value = 0.32;
  conv.connect(wet).connect(comp);
  bus = { ctx: audio, master: comp, reverb: conv };
  return bus;
}

/** Ovoz manbasini zalga ulash: quruq + aks-sado ulushi */
function out(audio: AudioContext, node: AudioNode, wet = 0.22) {
  const b = fxBus(audio);
  node.connect(b.master);
  if (wet > 0) {
    const send = audio.createGain();
    send.gain.value = wet;
    node.connect(send).connect(b.reverb);
  }
}

function tone(audio: AudioContext, type: OscillatorType, frequency: number, startAt: number, duration: number, peak: number, wet = 0.2): void {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain);
  out(audio, gain, wet);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.05);
}

/**
 * Mukofot ovozi: o'yindagidek tanga "ting"i va yuqoriga ko'tariluvchi arpeggio.
 * Brauzer ruxsat bermagan bo'lsa (sahifa hali bosilmagan) — jim o'tkazib yuboriladi.
 */
export function playRewardSound(volume = 1): void {
  const audio = getContext();
  if (!audio) return;
  const play = () => {
    const t = audio.currentTime;
    tone(audio, "square", 987.8, t, 0.09, 0.08 * volume);
    tone(audio, "square", 1318.5, t + 0.08, 0.4, 0.08 * volume);
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone(audio, "triangle", f, t + 0.5 + i * 0.075, 0.3, 0.2 * volume));
  };
  if (audio.state === "running") {
    play();
    return;
  }
  audio
    .resume()
    .then(() => {
      if (audio.state === "running") play();
    })
    .catch(() => {});
}

function running(): AudioContext | null {
  const audio = getContext();
  if (!audio) return null;
  if (audio.state === "suspended") audio.resume().catch(() => {});
  return audio;
}

/** Test o'yini: to'g'ri javob — yorqin qo'ng'iroqli major arpedjio, uchqun va yumshoq zarb */
export function playCorrectSound(): void {
  const audio = running();
  if (!audio) return;
  const t = audio.currentTime;
  bellTone(audio, 1046.5, t, 0.7, 0.12);
  bellTone(audio, 1318.5, t + 0.08, 0.7, 0.1);
  bellTone(audio, 1568, t + 0.16, 0.9, 0.11);
  tone(audio, "triangle", 523.25, t, 0.25, 0.12);
  tone(audio, "triangle", 783.99, t + 0.16, 0.4, 0.1);
  sparkle(audio, t + 0.22, 0.05);
  softThump(audio, t, 0.35);
}

/** Test o'yini: xato javob yoki vaqt tugadi — past "bvomp" (pasayuvchi detune qilingan tovush) va zarb */
export function playWrongSound(): void {
  const audio = running();
  if (!audio) return;
  const t = audio.currentTime;
  const f = audio.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(1400, t);
  f.frequency.exponentialRampToValueAtTime(260, t + 0.5);
  const g = audio.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
  f.connect(g);
  out(audio, g, 0.15);
  for (const det of [-14, 14]) {
    const o = audio.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(311, t);
    o.frequency.exponentialRampToValueAtTime(155, t + 0.5);
    o.detune.value = det;
    o.connect(f);
    o.start(t);
    o.stop(t + 0.65);
  }
  softThump(audio, t, 0.5, 70);
}

/** Test o'yini: oxirgi soniyalarda taymer — yog'och "tiq" (woodblock) */
export function playTickSound(): void {
  const audio = running();
  if (!audio) return;
  const t = audio.currentTime;
  const o = audio.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(1900, t);
  o.frequency.exponentialRampToValueAtTime(1300, t + 0.05);
  const g = audio.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.22, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  o.connect(g);
  out(audio, g, 0.12);
  o.start(t);
  o.stop(t + 0.09);
  const n = audio.createBufferSource();
  n.buffer = getNoise(audio);
  const bp = audio.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 3500;
  const ng = audio.createGain();
  ng.gain.setValueAtTime(0.08, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.015);
  n.connect(bp).connect(ng);
  out(audio, ng, 0);
  n.start(t);
  n.stop(t + 0.02);
}

/** Reyting: qatorlar surilganda "whoosh" — filtrlangan shovqin chapdan o'ngga o'tadi */
export function playWhoosh(volume = 0.5): void {
  const audio = running();
  if (!audio) return;
  const t = audio.currentTime;
  const src = audio.createBufferSource();
  src.buffer = getNoise(audio);
  const filter = audio.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.4;
  filter.frequency.setValueAtTime(350, t);
  filter.frequency.exponentialRampToValueAtTime(3600, t + 0.32);
  filter.frequency.exponentialRampToValueAtTime(1200, t + 0.5);
  const pan = audio.createStereoPanner();
  pan.pan.setValueAtTime(-0.8, t);
  pan.pan.linearRampToValueAtTime(0.8, t + 0.5);
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.42 * volume, t + 0.16);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
  src.connect(filter).connect(pan).connect(gain);
  out(audio, gain, 0.25);
  src.start(t);
  src.stop(t + 0.6);
}

/** Reyting: kimdir o'rin ko'targanda — ko'tariluvchi qo'ng'iroq va uchqun */
export function playRankUp(): void {
  const audio = running();
  if (!audio) return;
  const t = audio.currentTime;
  bellTone(audio, 880, t, 0.5, 0.09);
  bellTone(audio, 1318.5, t + 0.07, 0.6, 0.09);
  sparkle(audio, t + 0.12, 0.035);
}

/** G'oliblar e'loni oldidan baraban sadosi (`seconds` davomida kuchayib boradi) */
export function playDrumroll(seconds = 1.6): void {
  const audio = running();
  if (!audio) return;
  const t0 = audio.currentTime;
  const hits = Math.round(seconds * 22);
  for (let i = 0; i < hits; i++) {
    const t = t0 + (i / hits) * seconds;
    const src = audio.createBufferSource();
    src.buffer = getNoise(audio);
    const filter = audio.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1800;
    const gain = audio.createGain();
    const level = 0.08 + 0.22 * (i / hits);
    gain.gain.setValueAtTime(level, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(filter).connect(gain);
    out(audio, gain, 0.3);
    src.start(t);
    src.stop(t + 0.06);
  }
  // Oxirida zarbli "bum"
  const end = t0 + seconds;
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.frequency.setValueAtTime(140, end);
  osc.frequency.exponentialRampToValueAtTime(45, end + 0.35);
  g.gain.setValueAtTime(0.6, end);
  g.gain.exponentialRampToValueAtTime(0.0001, end + 0.45);
  osc.connect(g);
  out(audio, g, 0.35);
  osc.start(end);
  osc.stop(end + 0.5);
}

/** Yetakchi almashdi yoki 1-o'rin e'loni — mis cholg'u fanfarasi, timpani va tarelka (`grand` — kattaroq, final uchun) */
export function playFanfare(grand = false): void {
  const audio = running();
  if (!audio) return;
  const t = audio.currentTime + 0.02;
  const notes: [number, number, number][] = grand
    ? [
        [523.25, 0, 0.16],
        [659.25, 0.16, 0.16],
        [783.99, 0.32, 0.16],
        [1046.5, 0.5, 0.9],
      ]
    : [
        [587.33, 0, 0.12],
        [739.99, 0.12, 0.12],
        [880, 0.24, 0.5],
      ];
  for (const [f, at, dur] of notes) brass(audio, f, t + at, dur, grand ? 0.1 : 0.08);
  const chordAt = grand ? 0.5 : 0.24;
  for (const f of grand ? [261.63, 329.63, 392] : [293.66, 369.99, 440]) brass(audio, f, t + chordAt, grand ? 1 : 0.55, 0.05);
  timpani(audio, t + chordAt, grand ? 65.4 : 73.4, grand ? 0.8 : 0.55);
  cymbal(audio, t + chordAt, grand ? 0.22 : 0.12, grand ? 2 : 1.2);
  sparkle(audio, t + chordAt + 0.1, 0.05);
}

/** Arena: lazer otishi (qisqa, baland) */
export function playShot(): void {
  const audio = running();
  if (!audio) return;
  const t = audio.currentTime;
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(1400, t);
  osc.frequency.exponentialRampToValueAtTime(300, t + 0.08);
  g.gain.setValueAtTime(0.05, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  osc.connect(g).connect(audio.destination);
  osc.start(t);
  osc.stop(t + 0.1);
}

/** Arena: portlash */
export function playBoom(): void {
  const audio = running();
  if (!audio) return;
  const t = audio.currentTime;
  const src = audio.createBufferSource();
  src.buffer = getNoise(audio);
  const f = audio.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.setValueAtTime(1800, t);
  f.frequency.exponentialRampToValueAtTime(120, t + 0.4);
  const g = audio.createGain();
  g.gain.setValueAtTime(0.35, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  src.connect(f).connect(g).connect(audio.destination);
  src.start(t);
  src.stop(t + 0.5);
}

/** Arena: urildi */
export function playHurt(): void {
  const audio = running();
  if (!audio) return;
  const t = audio.currentTime;
  tone(audio, "sawtooth", 180, t, 0.18, 0.12);
  tone(audio, "sawtooth", 120, t + 0.05, 0.2, 0.1);
}

/** Rejim introsi: har rejimga o'z tonalligi va tembridagi qisqa jingl (arpedjio + mis akkord + timpani) */
export function playModeJingle(transpose = 0, wave: OscillatorType = "square", minor = false): void {
  const audio = running();
  if (!audio) return;
  const t = audio.currentTime + 0.05;
  const root = 261.63 * Math.pow(2, transpose / 12);
  const third = minor ? 3 : 4;
  const steps = [0, third, 7, 12, third + 12];
  steps.forEach((st, i) => tone(audio, wave, root * Math.pow(2, st / 12), t + i * 0.1, 0.18, 0.05, 0.35));
  steps.forEach((st, i) => bellTone(audio, root * 2 * Math.pow(2, st / 12), t + i * 0.1, 0.4, 0.035));
  for (const st of [0, third, 7, 12]) brass(audio, root * Math.pow(2, st / 12), t + 0.55, 0.9, 0.045);
  timpani(audio, t + 0.55, root / 4, 0.7);
  cymbal(audio, t + 0.55, 0.14, 1.4);
}

/** "Boshlash" bosilganda: ko'tariluvchi shovqin (riser), keyin kuchli zarba — timpani, tarelka va mis akkord */
export function playGameStart(): void {
  const audio = running();
  if (!audio) return;
  const t = audio.currentTime;
  const src = audio.createBufferSource();
  src.buffer = getNoise(audio);
  src.loop = true;
  const f = audio.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 3;
  f.frequency.setValueAtTime(300, t);
  f.frequency.exponentialRampToValueAtTime(7000, t + 0.85);
  const g = audio.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.3, t + 0.8);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
  src.connect(f).connect(g);
  out(audio, g, 0.3);
  src.start(t);
  src.stop(t + 0.95);
  const hit = t + 0.86;
  timpani(audio, hit, 55, 1);
  softThump(audio, hit, 0.9, 50);
  cymbal(audio, hit, 0.3, 2.4);
  for (const fr of [261.63, 329.63, 392, 523.25]) brass(audio, fr, hit, 1.1, 0.06);
  sparkle(audio, hit + 0.15, 0.06);
}

// ---- "Yashil zona" ovozlari ----

/** Yangi zona(lar) yondi: yaltiroq ko'tariluvchi arpedjio + yengil "whoosh" */
export function playZoneAppear(count = 1): void {
  const audio = running();
  if (!audio) return;
  const t = audio.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
  notes.forEach((f, i) => tone(audio, "triangle", f, t + i * 0.06, 0.22, 0.12));
  for (let k = 1; k < Math.min(3, count); k++) tone(audio, "sine", 1567.98 + k * 200, t + 0.32 + k * 0.1, 0.25, 0.08);
  playWhoosh(0.25);
}

/** Zonada joy olindi: "klik" + yorqin "ding" */
export function playSeatTaken(): void {
  const audio = running();
  if (!audio) return;
  const t = audio.currentTime;
  tone(audio, "square", 1800, t, 0.03, 0.05);
  tone(audio, "triangle", 1046.5, t + 0.03, 0.12, 0.2);
  tone(audio, "triangle", 1567.98, t + 0.1, 0.22, 0.18);
}

/** Zona to'la — joy yo'q: ikki marta past "bip-bip" */
export function playZoneFull(): void {
  const audio = running();
  if (!audio) return;
  const t = audio.currentTime;
  tone(audio, "square", 330, t, 0.1, 0.07);
  tone(audio, "square", 262, t + 0.13, 0.16, 0.07);
}

/** Zona yopildi: pasayuvchi "energiya o'chdi" va zarba */
export function playZoneClose(): void {
  const audio = running();
  if (!audio) return;
  const t = audio.currentTime;
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(880, t);
  osc.frequency.exponentialRampToValueAtTime(70, t + 0.45);
  g.gain.setValueAtTime(0.09, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  osc.connect(g).connect(audio.destination);
  osc.start(t);
  osc.stop(t + 0.55);
  const k = audio.createOscillator();
  const kg = audio.createGain();
  k.frequency.setValueAtTime(150, t + 0.05);
  k.frequency.exponentialRampToValueAtTime(40, t + 0.4);
  kg.gain.setValueAtTime(0.5, t + 0.05);
  kg.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  k.connect(kg).connect(audio.destination);
  k.start(t + 0.05);
  k.stop(t + 0.5);
}

/** Elektr tuzoq urdi: chirsillagan "zzt" */
export function playZap(): void {
  const audio = running();
  if (!audio) return;
  const t = audio.currentTime;
  const src = audio.createBufferSource();
  src.buffer = getNoise(audio);
  const f = audio.createBiquadFilter();
  f.type = "highpass";
  f.frequency.value = 2500;
  const g = audio.createGain();
  g.gain.setValueAtTime(0.0001, t);
  for (let i = 0; i < 6; i++) {
    g.gain.setValueAtTime(i % 2 === 0 ? 0.28 : 0.04, t + i * 0.04);
  }
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  src.connect(f).connect(g).connect(audio.destination);
  src.start(t);
  src.stop(t + 0.32);
  tone(audio, "square", 110, t, 0.25, 0.08);
}

/** Loyga tushdi: past "blup" */
export function playSplash(): void {
  const audio = running();
  if (!audio) return;
  const t = audio.currentTime;
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(420, t);
  osc.frequency.exponentialRampToValueAtTime(120, t + 0.18);
  g.gain.setValueAtTime(0.25, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  osc.connect(g).connect(audio.destination);
  osc.start(t);
  osc.stop(t + 0.25);
}

/** Yulduz yig'ildi: tanga kabi ikki "ting" */
export function playStarPickup(): void {
  const audio = running();
  if (!audio) return;
  const t = audio.currentTime;
  tone(audio, "square", 987.77, t, 0.07, 0.07);
  tone(audio, "square", 1318.5, t + 0.06, 0.2, 0.07);
}

/** To'lqindan omon qolindi: quvnoq akkord */
export function playSurvive(): void {
  const audio = running();
  if (!audio) return;
  const t = audio.currentTime;
  [659.25, 830.61, 987.77, 1318.5].forEach((f, i) => tone(audio, "triangle", f, t + i * 0.07, 0.3, 0.16));
  tone(audio, "sine", 1975.5, t + 0.3, 0.35, 0.08);
}

/** Robot o'chdi: "elektr qisqa tutashuvi" + pasayuvchi ovoz */
export function playShutdown(): void {
  const audio = running();
  if (!audio) return;
  const t = audio.currentTime;
  playZap();
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(600, t + 0.1);
  osc.frequency.exponentialRampToValueAtTime(60, t + 0.9);
  g.gain.setValueAtTime(0.2, t + 0.1);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
  osc.connect(g).connect(audio.destination);
  osc.start(t + 0.1);
  osc.stop(t + 1);
}

/** Oxirgi soniyalar: yurak urishi kabi past "dum-dum" */
export function playHeartbeat(): void {
  const audio = running();
  if (!audio) return;
  const t = audio.currentTime;
  for (const [at, f] of [
    [0, 90],
    [0.16, 70],
  ] as const) {
    const osc = audio.createOscillator();
    const g = audio.createGain();
    osc.frequency.setValueAtTime(f, t + at);
    osc.frequency.exponentialRampToValueAtTime(40, t + at + 0.14);
    g.gain.setValueAtTime(0.55, t + at);
    g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.16);
    osc.connect(g).connect(audio.destination);
    osc.start(t + at);
    osc.stop(t + at + 0.2);
  }
}


// ---- Shohsupa va tantana: boy ovozlar (timpani, mis cholg'u, tarelka, olqish) ----

/** Timpani zarbasi: past nota, tez pasayadi, uzoq so'nadi */
function timpani(audio: AudioContext, at: number, freq = 98, level = 0.7) {
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq * 1.6, at);
  osc.frequency.exponentialRampToValueAtTime(freq, at + 0.08);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(level, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 1.3);
  osc.connect(g);
  out(audio, g, 0.35);
  osc.start(at);
  osc.stop(at + 1.4);
  // Zarb "shitirlashi"
  const n = audio.createBufferSource();
  n.buffer = getNoise(audio);
  const f = audio.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 900;
  const ng = audio.createGain();
  ng.gain.setValueAtTime(level * 0.35, at);
  ng.gain.exponentialRampToValueAtTime(0.0001, at + 0.15);
  n.connect(f).connect(ng);
  out(audio, ng, 0.2);
  n.start(at);
  n.stop(at + 0.2);
}

/** Tarelka (cymbal): yuqori chastotali shovqin, uzoq so'nadi */
function cymbal(audio: AudioContext, at: number, level = 0.35, len = 2.2) {
  const n = audio.createBufferSource();
  n.buffer = getNoise(audio);
  n.loop = true;
  const hp = audio.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 5200;
  const bp = audio.createBiquadFilter();
  bp.type = "peaking";
  bp.frequency.value = 9000;
  bp.gain.value = 8;
  const g = audio.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(level, at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, at + len);
  n.connect(hp).connect(bp).connect(g);
  out(audio, g, 0.4);
  n.start(at);
  n.stop(at + len + 0.1);
}

/** Mis cholg'u (brass): ikki biroz farqli sawtooth, filtri "ochiladi" — karnay ovoziga o'xshaydi */
function brass(audio: AudioContext, freq: number, at: number, dur: number, level = 0.12) {
  const f = audio.createBiquadFilter();
  f.type = "lowpass";
  f.Q.value = 2;
  f.frequency.setValueAtTime(400, at);
  f.frequency.exponentialRampToValueAtTime(Math.min(6000, freq * 6), at + 0.08);
  f.frequency.exponentialRampToValueAtTime(Math.min(3000, freq * 3), at + dur);
  const g = audio.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(level, at + 0.04);
  g.gain.setValueAtTime(level * 0.85, at + Math.max(0.05, dur - 0.12));
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur + 0.15);
  f.connect(g);
  out(audio, g, 0.3);
  for (const det of [-6, 6]) {
    const o = audio.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = freq;
    o.detune.value = det;
    o.connect(f);
    o.start(at);
    o.stop(at + dur + 0.2);
  }
}

/** Qo'ng'iroqcha yaltirashi (uchqunlar) */
function sparkle(audio: AudioContext, at: number, level = 0.08) {
  [2093, 2637, 3136, 4186, 3520].forEach((fr, i) => tone(audio, "sine", fr, at + i * 0.045, 0.5, level, 0.5));
}

/** Olqishlar va olomon shovqini: tasodifiy qarsaklar + "uuu" shovqini (`seconds` davomida, kuchayib so'nadi) */
export function playApplause(seconds = 3, intensity = 1): void {
  const audio = running();
  if (!audio) return;
  const t0 = audio.currentTime;
  const claps = Math.round(seconds * 38 * intensity);
  for (let i = 0; i < claps; i++) {
    const at = t0 + Math.random() * seconds;
    const env = Math.sin(((at - t0) / seconds) * Math.PI);
    const src = audio.createBufferSource();
    src.buffer = getNoise(audio);
    const bp = audio.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900 + Math.random() * 1700;
    bp.Q.value = 1.4;
    const g = audio.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.05 + 0.12 * env * intensity, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
    src.connect(bp).connect(g);
    out(audio, g, 0.35);
    src.start(at, Math.random() * 0.5);
    src.stop(at + 0.08);
  }
  // Olomon "uuu"
  const crowd = audio.createBufferSource();
  crowd.buffer = getNoise(audio);
  crowd.loop = true;
  const lp = audio.createBiquadFilter();
  lp.type = "bandpass";
  lp.frequency.value = 520;
  lp.Q.value = 0.8;
  const cg = audio.createGain();
  cg.gain.setValueAtTime(0.0001, t0);
  cg.gain.exponentialRampToValueAtTime(0.07 * intensity, t0 + seconds * 0.3);
  cg.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
  crowd.connect(lp).connect(cg);
  out(audio, cg, 0.3);
  crowd.start(t0);
  crowd.stop(t0 + seconds + 0.1);
}

/**
 * Shohsupada o'rin ochildi: 3-o'rin — timpani va kichik akkord; 2-o'rin — kattaroq; 1-o'rin — tarelka, mis fanfarasi,
 * timpani va olqishlar. Baraban sadosidan keyin chalinadi.
 */
export function playPodiumReveal(place: 1 | 2 | 3): void {
  const audio = running();
  if (!audio) return;
  const t = audio.currentTime + 0.02;
  if (place === 3) {
    timpani(audio, t, 110, 0.6);
    cymbal(audio, t, 0.14, 1.2);
    [392, 493.88, 587.33].forEach((f) => brass(audio, f, t + 0.02, 0.5, 0.06));
    sparkle(audio, t + 0.2, 0.05);
    playApplause(1.6, 0.5);
    return;
  }
  if (place === 2) {
    timpani(audio, t, 98, 0.7);
    timpani(audio, t + 0.18, 130.8, 0.5);
    cymbal(audio, t, 0.2, 1.6);
    [440, 554.37, 659.25].forEach((f) => brass(audio, f, t + 0.02, 0.7, 0.07));
    sparkle(audio, t + 0.25, 0.06);
    playApplause(2.2, 0.7);
    return;
  }
  // 1-o'rin: katta tantana
  timpani(audio, t, 87.3, 0.9);
  timpani(audio, t + 0.12, 87.3, 0.6);
  cymbal(audio, t, 0.32, 2.6);
  const melody: [number, number, number][] = [
    [523.25, 0, 0.16],
    [659.25, 0.16, 0.16],
    [783.99, 0.32, 0.16],
    [1046.5, 0.5, 1.2],
  ];
  for (const [f, at, dur] of melody) brass(audio, f, t + at, dur, 0.11);
  for (const f of [261.63, 329.63, 392, 523.25]) brass(audio, f, t + 0.5, 1.3, 0.07);
  timpani(audio, t + 0.5, 65.4, 0.9);
  sparkle(audio, t + 0.55, 0.08);
  sparkle(audio, t + 1.0, 0.06);
  playApplause(4, 1);
}

/** Shohsupa sahnasi ochilganda: "sirli" past akkord va tovushning ko'tarilishi */
export function playPodiumIntro(): void {
  const audio = running();
  if (!audio) return;
  const t = audio.currentTime;
  for (const f of [130.81, 155.56, 196]) brass(audio, f, t, 1.4, 0.04);
  timpani(audio, t, 65.4, 0.5);
  sparkle(audio, t + 0.6, 0.04);
}


// ---- Yordamchi tovushlar (yuqoridagi effektlar uchun) ----

/** Qo'ng'iroq (FM): toza, yaltiroq nota */
function bellTone(audio: AudioContext, freq: number, at: number, dur: number, level: number) {
  const car = audio.createOscillator();
  car.frequency.value = freq;
  const mod = audio.createOscillator();
  mod.frequency.value = freq * 2.01;
  const mg = audio.createGain();
  mg.gain.setValueAtTime(freq * 1.2, at);
  mg.gain.exponentialRampToValueAtTime(1, at + dur);
  mod.connect(mg).connect(car.frequency);
  const g = audio.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(level, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  car.connect(g);
  out(audio, g, 0.35);
  for (const o of [car, mod]) {
    o.start(at);
    o.stop(at + dur + 0.05);
  }
}

/** Yumshoq past zarb (tovushga "og'irlik" beradi) */
function softThump(audio: AudioContext, at: number, level = 0.4, freq = 90) {
  const o = audio.createOscillator();
  o.frequency.setValueAtTime(freq * 1.8, at);
  o.frequency.exponentialRampToValueAtTime(freq, at + 0.08);
  const g = audio.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(level, at + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
  o.connect(g);
  out(audio, g, 0.1);
  o.start(at);
  o.stop(at + 0.32);
}
