// Ovozli suhbat dvigateli (brauzer): mikrofon → Opus (WebCodecs) → Cloudflare xonasi → boshqalarda ijro.
// Ovoz hech qayerga yozilmaydi. Kechikish kam bo'lishi uchun: 20 ms kadrlar, 40 ms paket, ~80 ms bufer.
// Shovqin va aks-sado bostirish brauzerniki (echoCancellation) — karnaydan chiqqan ovoz qaytib ketmaydi.

import {
  VOICE_BITRATE,
  VOICE_FRAME,
  VOICE_FRAMES_PER_PACKET,
  VOICE_SAMPLE_RATE,
  packFrames,
  unpackRelay,
  type VoicePeer,
  type VoiceServerMessage,
} from "@/lib/live-game/voice-protocol";

export interface VoiceSnapshot {
  status: "idle" | "connecting" | "live" | "error" | "unsupported";
  error: string | null;
  me: number | null;
  peers: VoicePeer[];
  muted: boolean;
  question: boolean;
  mic: boolean;
  deaf: boolean;
  volume: number;
  micGain: number;
  /** Hozir gapirayotganlar: raqam → daraja (0..1) */
  speaking: Record<number, number>;
}

/** Mikrofon kadrlarini 48 kHz ga o'tkazib, 960 namunadan bo'lib beradi (public/ dagi fayl — CSP 'self') */
const WORKLET_URL = "/voice-capture-worklet.js";

/** Shundan baland — gapiryapti (shovqin bostirilgandan keyin); gap tugagach yana 350 ms yuboriladi */
const VAD_ON = 0.012;
const HANGOVER_MS = 350;
/** Ijro buferi: paketlar notekis kelsa ham uzilmasin */
const JITTER_S = 0.08;
const MAX_AHEAD_S = 0.35;

interface Remote {
  dec: AudioDecoder;
  ts: number;
  next: number;
  level: number;
  at: number;
}

export function voiceSupported(): boolean {
  return typeof window !== "undefined" && "AudioDecoder" in window && "AudioContext" in window && "WebSocket" in window;
}

export class VoiceEngine {
  private snap: VoiceSnapshot = {
    status: "idle",
    error: null,
    me: null,
    peers: [],
    muted: false,
    question: false,
    mic: false,
    deaf: false,
    volume: 1,
    micGain: 1,
    speaking: {},
  };
  private listeners = new Set<() => void>();
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ws: WebSocket | null = null;
  private remotes = new Map<number, Remote>();
  private closed = false;
  private retry = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private uiTimer: ReturnType<typeof setInterval> | null = null;
  // Mikrofon
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private gain: GainNode | null = null;
  private node: AudioWorkletNode | null = null;
  private enc: AudioEncoder | null = null;
  private encTs = 0;
  private pending: Uint8Array[] = [];
  private gateUntil = 0;
  private myLevel = 0;

  constructor(
    private getUrl: () => Promise<string | null>,
    opts: { deaf?: boolean; volume?: number; micGain?: number } = {}
  ) {
    this.snap.deaf = Boolean(opts.deaf);
    this.snap.volume = opts.volume ?? 1;
    this.snap.micGain = opts.micGain ?? 1;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;

  private set(patch: Partial<VoiceSnapshot>) {
    this.snap = { ...this.snap, ...patch };
    for (const fn of this.listeners) fn();
  }

  /** Brauzer ovozni faqat foydalanuvchi bosgandan keyin yoqadi — har bosishda chaqiriladi */
  unlock() {
    void this.ensureCtx()?.resume().catch(() => {});
  }

  private ensureCtx(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      this.ctx = new AudioContext({ sampleRate: VOICE_SAMPLE_RATE, latencyHint: "interactive" });
    } catch {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.snap.deaf ? 0 : this.snap.volume;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  start() {
    if (!voiceSupported()) {
      this.set({ status: "unsupported", error: "Brauzeringiz ovozli suhbatni qo'llamaydi — Chrome yoki Safari'ning yangi versiyasini oching" });
      return;
    }
    this.closed = false;
    this.uiTimer = setInterval(() => this.tickUi(), 120);
    void this.connect();
  }

  private async connect() {
    if (this.closed) return;
    this.set({ status: this.snap.status === "live" ? "live" : "connecting" });
    let url: string | null = null;
    try {
      url = await this.getUrl();
    } catch {
      url = null;
    }
    if (this.closed) return;
    if (!url) {
      this.scheduleRetry();
      return;
    }
    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      this.set({ status: "live", error: null });
      if (this.snap.mic) ws.send(JSON.stringify({ t: "mic", on: true }));
      if (this.snap.deaf) ws.send(JSON.stringify({ t: "deaf", on: true }));
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data === "string") this.onText(ev.data);
      else this.onAudio(new Uint8Array(ev.data as ArrayBuffer));
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      // Boshqa oynada ochilgan — qayta ulanmaydi
      if (ev.code === 4000) {
        this.set({ status: "error", error: "Ovozli suhbat boshqa oynada ochildi" });
        return;
      }
      this.scheduleRetry();
    };
  }

  private scheduleRetry() {
    if (this.closed) return;
    this.retry = Math.min(this.retry + 1, 6);
    this.set({ status: "connecting" });
    this.retryTimer = setTimeout(() => void this.connect(), Math.min(15_000, 600 * 2 ** this.retry));
  }

  private onText(raw: string) {
    let msg: VoiceServerMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.t === "hello") this.set({ me: msg.s });
    else if (msg.t === "roster") {
      const live = new Set(msg.peers.map((p) => p.s));
      for (const [s, r] of this.remotes) {
        if (!live.has(s)) {
          try {
            r.dec.close();
          } catch {
            // yopilgan
          }
          this.remotes.delete(s);
        }
      }
      this.set({ peers: msg.peers, muted: msg.muted, question: msg.question });
    }
  }

  /** Men hozir gapira olamanmi (xona baribir tekshiradi — bu faqat keraksiz yuborishni to'xtatadi) */
  canSpeak(): boolean {
    const me = this.snap.peers.find((p) => p.s === this.snap.me);
    if (!me) return false;
    return me.host || (!this.snap.muted && !me.lock);
  }

  private onAudio(b: Uint8Array) {
    const pkt = unpackRelay(b);
    if (!pkt) return;
    const now = performance.now();
    let r: Remote | null | undefined = this.remotes.get(pkt.slot);
    if (pkt.frames.length === 0) {
      // Faqat daraja (karnay o'chiq): kim gapirayotgani ko'rinadi
      if (!r) {
        r = this.newRemote(pkt.slot);
        if (!r) return;
      }
      r.level = pkt.level / 255;
      r.at = now;
      return;
    }
    const ctx = this.ctx;
    if (!ctx || this.snap.deaf) return;
    r ??= this.newRemote(pkt.slot);
    if (!r) return;
    r.level = pkt.level / 255;
    r.at = now;
    for (const f of pkt.frames) {
      try {
        r.dec.decode(new EncodedAudioChunk({ type: "key", timestamp: r.ts, data: f }));
        r.ts += 20_000;
      } catch {
        // buzilgan kadr — o'tkazib yuboriladi
      }
    }
  }

  private newRemote(slot: number): Remote | null {
    if (!("AudioDecoder" in window)) return null;
    const remote: Remote = { dec: null as unknown as AudioDecoder, ts: 0, next: 0, level: 0, at: 0 };
    try {
      remote.dec = new AudioDecoder({ output: (d) => this.play(remote, d), error: () => {} });
      remote.dec.configure({ codec: "opus", sampleRate: VOICE_SAMPLE_RATE, numberOfChannels: 1 });
    } catch {
      return null;
    }
    this.remotes.set(slot, remote);
    return remote;
  }

  private play(r: Remote, d: AudioData) {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || this.snap.deaf) {
      d.close();
      return;
    }
    const n = d.numberOfFrames;
    const pcm = new Float32Array(n);
    try {
      if (d.format === "f32" || d.format === "f32-planar") d.copyTo(pcm, { planeIndex: 0 });
      else {
        const tmp = new Int16Array(n * (d.format === "s16" ? d.numberOfChannels : 1));
        d.copyTo(tmp, { planeIndex: 0 });
        const step = d.format === "s16" ? d.numberOfChannels : 1;
        for (let i = 0; i < n; i++) pcm[i] = tmp[i * step] / 32768;
      }
    } catch {
      d.close();
      return;
    }
    const rate = d.sampleRate;
    d.close();
    const buf = ctx.createBuffer(1, n, rate);
    buf.copyToChannel(pcm, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(master);
    const now = ctx.currentTime;
    // Kechikib qolsa — bufer qayta to'ldiriladi; juda oldinda bo'lsa — yetib olish uchun tashlab yuboriladi
    if (r.next < now + 0.01) r.next = now + JITTER_S;
    else if (r.next > now + MAX_AHEAD_S) r.next = now + JITTER_S;
    src.start(r.next);
    r.next += n / rate;
  }

  private tickUi() {
    const now = performance.now();
    const speaking: Record<number, number> = {};
    for (const [s, r] of this.remotes) if (now - r.at < 400) speaking[s] = r.level;
    if (this.snap.me !== null && this.snap.mic && now < this.gateUntil) speaking[this.snap.me] = this.myLevel;
    const prev = this.snap.speaking;
    const keys = Object.keys(speaking);
    const same = keys.length === Object.keys(prev).length && keys.every((k) => Math.abs((prev[Number(k)] ?? -1) - speaking[Number(k)]) < 0.04);
    if (!same) this.set({ speaking });
  }

  // ---- Mikrofon ----

  async setMic(on: boolean) {
    this.unlock();
    if (on === this.snap.mic) return;
    if (!on) {
      this.stopMic();
      this.set({ mic: false });
      this.send({ t: "mic", on: false });
      return;
    }
    if (!("AudioEncoder" in window)) {
      this.set({ error: "Brauzeringizda mikrofon ishlamaydi — Chrome yoki Safari'ning yangi versiyasini oching" });
      return;
    }
    try {
      await this.startMic();
      this.set({ mic: true, error: null });
      this.send({ t: "mic", on: true });
    } catch (e) {
      this.stopMic();
      const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
      this.set({ mic: false, error: denied ? "Mikrofonga ruxsat berilmadi — brauzer sozlamasidan ruxsat bering" : "Mikrofonni yoqib bo'lmadi" });
    }
  }

  private async startMic() {
    const ctx = this.ensureCtx();
    if (!ctx) throw new Error("no ctx");
    const support = await AudioEncoder.isConfigSupported({ codec: "opus", sampleRate: VOICE_SAMPLE_RATE, numberOfChannels: 1, bitrate: VOICE_BITRATE });
    if (!support.supported) throw new Error("opus");
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    await ctx.audioWorklet.addModule(WORKLET_URL);
    this.source = ctx.createMediaStreamSource(this.stream);
    this.gain = ctx.createGain();
    this.gain.gain.value = this.snap.micGain;
    this.node = new AudioWorkletNode(ctx, "itx-voice-cap", { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 1, channelCountMode: "explicit" });
    this.source.connect(this.gain).connect(this.node);
    this.enc = new AudioEncoder({
      output: (chunk) => {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        this.pending.push(data);
        if (this.pending.length >= VOICE_FRAMES_PER_PACKET) this.flush();
      },
      error: () => {},
    });
    this.enc.configure({ codec: "opus", sampleRate: VOICE_SAMPLE_RATE, numberOfChannels: 1, bitrate: VOICE_BITRATE, opus: { frameDuration: 20_000, usedtx: false } } as AudioEncoderConfig);
    this.node.port.onmessage = (ev: MessageEvent<{ pcm: Float32Array; rms: number }>) => this.onFrame(ev.data.pcm, ev.data.rms);
    void ctx.resume().catch(() => {});
  }

  private onFrame(pcm: Float32Array, rms: number) {
    const now = performance.now();
    if (rms > VAD_ON) this.gateUntil = now + HANGOVER_MS;
    this.myLevel = Math.min(1, rms * 12);
    if (now >= this.gateUntil || !this.canSpeak() || !this.enc || this.enc.state !== "configured") {
      if (this.pending.length > 0) this.flush();
      return;
    }
    try {
      const data = new AudioData({ format: "f32", sampleRate: VOICE_SAMPLE_RATE, numberOfFrames: VOICE_FRAME, numberOfChannels: 1, timestamp: this.encTs, data: pcm as Float32Array<ArrayBuffer> });
      this.encTs += 20_000;
      this.enc.encode(data);
      data.close();
    } catch {
      // kadr tashlab yuboriladi
    }
  }

  private flush() {
    const frames = this.pending;
    this.pending = [];
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || frames.length === 0) return;
    // Sekin internetda navbat to'planib qolsa — eski ovoz tashlanadi (kechikish o'smasin)
    if (ws.bufferedAmount > 16_000) return;
    ws.send(packFrames(this.myLevel * 255, frames));
  }

  private stopMic() {
    try {
      this.node?.port.close();
      this.node?.disconnect();
      this.gain?.disconnect();
      this.source?.disconnect();
    } catch {
      // uzilgan
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    try {
      if (this.enc && this.enc.state !== "closed") this.enc.close();
    } catch {
      // yopilgan
    }
    this.stream = null;
    this.source = null;
    this.gain = null;
    this.node = null;
    this.enc = null;
    this.pending = [];
    this.gateUntil = 0;
  }

  // ---- Karnay va balandlik ----

  setDeaf(on: boolean) {
    this.unlock();
    this.set({ deaf: on });
    if (this.master) this.master.gain.value = on ? 0 : this.snap.volume;
    this.send({ t: "deaf", on });
  }

  setVolume(v: number) {
    this.unlock();
    const volume = Math.max(0, Math.min(2, v));
    this.set({ volume });
    if (this.master && !this.snap.deaf) this.master.gain.setTargetAtTime(volume, this.ctx!.currentTime, 0.02);
  }

  setMicGain(v: number) {
    const micGain = Math.max(0, Math.min(2, v));
    this.set({ micGain });
    if (this.gain) this.gain.gain.value = micGain;
  }

  private send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  stop() {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.uiTimer) clearInterval(this.uiTimer);
    this.stopMic();
    try {
      this.ws?.close(1000);
    } catch {
      // yopilgan
    }
    this.ws = null;
    for (const r of this.remotes.values()) {
      try {
        r.dec.close();
      } catch {
        // yopilgan
      }
    }
    this.remotes.clear();
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.master = null;
  }
}
