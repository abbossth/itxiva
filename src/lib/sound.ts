// Davomat ekrani uchun qisqa ovozli signal. Audio fayl yo'q — Web Audio API bilan sintez qilinadi.

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
