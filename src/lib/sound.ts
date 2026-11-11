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

function tone(audio: AudioContext, type: OscillatorType, frequency: number, startAt: number, duration: number, peak: number): void {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain).connect(audio.destination);
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

/** Test o'yini: to'g'ri javob — ko'tariluvchi uch nota */
export function playCorrectSound(): void {
  const audio = running();
  if (!audio) return;
  const t = audio.currentTime;
  tone(audio, "triangle", 659.25, t, 0.14, 0.25);
  tone(audio, "triangle", 830.6, t + 0.09, 0.14, 0.25);
  tone(audio, "triangle", 987.8, t + 0.18, 0.32, 0.3);
}

/** Test o'yini: xato javob yoki vaqt tugadi — pasayuvchi past ovoz */
export function playWrongSound(): void {
  const audio = running();
  if (!audio) return;
  const t = audio.currentTime;
  tone(audio, "sawtooth", 220, t, 0.18, 0.12);
  tone(audio, "sawtooth", 164.8, t + 0.16, 0.34, 0.12);
}

/** Test o'yini: oxirgi soniyalarda taymer "tiq" etadi */
export function playTickSound(): void {
  const audio = running();
  if (!audio) return;
  tone(audio, "square", 1200, audio.currentTime, 0.05, 0.06);
}

/** Reyting: qatorlar surilganda "whoosh" (filtrlangan shovqin) */
export function playWhoosh(volume = 0.5): void {
  const audio = running();
  if (!audio) return;
  const t = audio.currentTime;
  const src = audio.createBufferSource();
  src.buffer = getNoise(audio);
  const filter = audio.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.2;
  filter.frequency.setValueAtTime(400, t);
  filter.frequency.exponentialRampToValueAtTime(3200, t + 0.35);
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.4 * volume, t + 0.12);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
  src.connect(filter).connect(gain).connect(audio.destination);
  src.start(t);
  src.stop(t + 0.5);
}

/** Reyting: kimdir o'rin ko'targanda — qisqa ko'tariluvchi "ding" */
export function playRankUp(): void {
  const audio = running();
  if (!audio) return;
  const t = audio.currentTime;
  tone(audio, "triangle", 880, t, 0.12, 0.18);
  tone(audio, "triangle", 1318.5, t + 0.07, 0.22, 0.18);
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
    src.connect(filter).connect(gain).connect(audio.destination);
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
  osc.connect(g).connect(audio.destination);
  osc.start(end);
  osc.stop(end + 0.5);
}

/** Yetakchi almashdi yoki 1-o'rin e'loni — tantanali fanfara (`grand` — kattaroq, final uchun) */
export function playFanfare(grand = false): void {
  const audio = running();
  if (!audio) return;
  const t = audio.currentTime;
  const notes = grand
    ? [
        [523.25, 0, 0.18],
        [659.25, 0.16, 0.18],
        [783.99, 0.32, 0.18],
        [1046.5, 0.5, 0.7],
        [783.99, 0.5, 0.7],
        [659.25, 0.5, 0.7],
      ]
    : [
        [587.33, 0, 0.12],
        [739.99, 0.1, 0.12],
        [880, 0.2, 0.4],
      ];
  for (const [f, at, dur] of notes) {
    tone(audio, "sawtooth", f, t + at, dur, grand ? 0.09 : 0.07);
    tone(audio, "triangle", f * 2, t + at, dur, 0.05);
  }
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

/** Rejim introsi: har rejimga o'z tonalligi va tembridagi qisqa jingl (ko'tariluvchi arpedjio + akkord) */
export function playModeJingle(transpose = 0, wave: OscillatorType = "square", minor = false): void {
  const audio = running();
  if (!audio) return;
  const t = audio.currentTime + 0.05;
  const root = 261.63 * Math.pow(2, transpose / 12);
  const third = minor ? 3 : 4;
  const steps = [0, third, 7, 12, third + 12];
  steps.forEach((st, i) => tone(audio, wave, root * Math.pow(2, st / 12), t + i * 0.11, 0.16, 0.06));
  for (const st of [0, third, 7, 12]) tone(audio, "triangle", root * Math.pow(2, st / 12), t + 0.62, 0.9, 0.05);
  // Baraban zarbasi
  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.frequency.setValueAtTime(140, t + 0.62);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.8);
  g.gain.setValueAtTime(0.6, t + 0.62);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
  osc.connect(g).connect(audio.destination);
  osc.start(t + 0.62);
  osc.stop(t + 0.95);
}

/** "Boshlash" bosilganda: ko'tariluvchi shovqin (riser) va kuchli zarba */
export function playGameStart(): void {
  const audio = running();
  if (!audio) return;
  const t = audio.currentTime;
  // Riser: shovqin filtri yuqoriga ko'tariladi
  const len = Math.floor(audio.sampleRate * 0.9);
  const buf = audio.createBuffer(1, len, audio.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = audio.createBufferSource();
  src.buffer = buf;
  const f = audio.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 3;
  f.frequency.setValueAtTime(300, t);
  f.frequency.exponentialRampToValueAtTime(6000, t + 0.8);
  const g = audio.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.35, t + 0.75);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
  src.connect(f).connect(g).connect(audio.destination);
  src.start(t);
  src.stop(t + 0.92);
  // Zarba: past baraban + akkord
  const hit = t + 0.82;
  const osc = audio.createOscillator();
  const og = audio.createGain();
  osc.frequency.setValueAtTime(160, hit);
  osc.frequency.exponentialRampToValueAtTime(40, hit + 0.35);
  og.gain.setValueAtTime(0.9, hit);
  og.gain.exponentialRampToValueAtTime(0.0001, hit + 0.5);
  osc.connect(og).connect(audio.destination);
  osc.start(hit);
  osc.stop(hit + 0.55);
  for (const fr of [261.63, 329.63, 392, 523.25]) tone(audio, "sawtooth", fr, hit, 0.6, 0.05);
}
