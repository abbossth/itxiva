// Qisqa ovozli signallar (davomat, salyut). Audio fayl yo'q — Web Audio API bilan sintez qilinadi.

let ctx: AudioContext | null = null;

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
  // 1. Hushtak: yuqoriga ko'tarilayotgan raketa
  const whistle = audio.createOscillator();
  const whistleGain = audio.createGain();
  whistle.type = "sine";
  whistle.frequency.setValueAtTime(500, at);
  whistle.frequency.exponentialRampToValueAtTime(1500, at + 0.22);
  whistleGain.gain.setValueAtTime(0.0001, at);
  whistleGain.gain.exponentialRampToValueAtTime(0.05 * volume, at + 0.05);
  whistleGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.24);
  whistle.connect(whistleGain).connect(audio.destination);
  whistle.start(at);
  whistle.stop(at + 0.26);

  // 2. Portlash: past chastotali shovqin + qisqa "gup"
  const boomAt = at + 0.24;
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

  const thump = audio.createOscillator();
  const thumpGain = audio.createGain();
  thump.type = "sine";
  thump.frequency.setValueAtTime(140, boomAt);
  thump.frequency.exponentialRampToValueAtTime(45, boomAt + 0.25);
  thumpGain.gain.setValueAtTime(0.45 * volume, boomAt);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, boomAt + 0.3);
  thump.connect(thumpGain).connect(audio.destination);
  thump.start(boomAt);
  thump.stop(boomAt + 0.32);

  // 3. Chirsillash: sochilayotgan uchqunlar
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
 * Salyut ovozi: hushtak, portlash va chirsillash. `delays` — har bir otilishgacha soniyalar.
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
