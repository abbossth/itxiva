// Jonli o'yin ovozli suhbati: mikrofon kadrlarini 48 kHz, 20 ms (960 namuna) bo'laklarga bo'lib, ovoz darajasi bilan yuboradi.
// Ovoz hech qayerga yozilmaydi. (voice-engine.ts dagi VOICE_FRAME / VOICE_SAMPLE_RATE bilan bir xil bo'lsin.)
class Cap extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(960); this.n = 0; this.pos = 0; this.ratio = sampleRate / 48000; this.prev = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    if (this.ratio === 1) { for (let i = 0; i < ch.length; i++) this.push(ch[i]); return true; }
    // Oddiy chiziqli qayta namunalash (44.1 kHz qurilmalar uchun)
    while (this.pos < ch.length) {
      const i = Math.floor(this.pos), f = this.pos - i;
      const a = i === 0 ? this.prev : ch[i - 1], b = ch[i];
      this.push(a + (b - a) * f);
      this.pos += this.ratio;
    }
    this.pos -= ch.length;
    this.prev = ch[ch.length - 1];
    return true;
  }
  push(v) {
    this.buf[this.n++] = v;
    if (this.n === 960) {
      let s = 0; for (let i = 0; i < 960; i++) s += this.buf[i] * this.buf[i];
      this.port.postMessage({ pcm: this.buf, rms: Math.sqrt(s / 960) }, [this.buf.buffer]);
      this.buf = new Float32Array(960); this.n = 0;
    }
  }
}
registerProcessor("itx-voice-cap", Cap);
