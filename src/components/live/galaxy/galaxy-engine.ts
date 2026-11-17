// "Galaktika poygasi 3D" dvigateli (faqat brauzer). three.js tashqaridan beriladi (dinamik import) —
// asosiy to'plamga qo'shilmaydi va faqat poyga ekrani ochilganda yuklanadi.
// Kema doim z = 0 da, dunyo unga qarab harakatlanadi: trassa elementi z = -(element.z - masofa).

import type * as Three from "three";
import { HALF_WIDTH, RING_MS, SHIP_COLORS, SPEED, STUN_MS, TURBO_MS, galaxyTrack, type GalaxyPeer, type TrackItem } from "@/lib/live-game/galaxy";

type T = typeof Three;

export interface GalaxyHud {
  d: number;
  speed: number;
  orbs: number;
  turbo: number;
  place: number;
  total: number;
  /** Boshlanishigacha (ms); 0 — boshlandi */
  countdown: number;
  remaining: number;
  stunned: boolean;
  boosting: boolean;
  finished: boolean;
  /** Oxirgi hodisa (kristall, urilish, halqa) — HUD'da qisqa yozuv */
  flash: { kind: "orb" | "hit" | "ring" | "turbo"; at: number } | null;
}

export interface GalaxyOptions {
  seed: number;
  ship: number;
  turbo: number;
  /** performance.now() bo'yicha boshlanish va tugash vaqti */
  startAt: number;
  endAt: number;
  onHud: (hud: GalaxyHud) => void;
  /** Har ~250 ms: serverga holat; javobda boshqa kemalar */
  onSend: (state: { d: number; x: number; orbs: number }) => void;
  onEvent?: (kind: "orb" | "hit" | "ring" | "turbo") => void;
}

interface PeerState {
  id: string;
  name: string;
  ship: number;
  d: number;
  x: number;
  /** Taxminiy tezlik (m/s) — yangilanishlar orasida silliq harakat uchun */
  v: number;
  at: number;
  shownD: number;
  shownX: number;
  group: Three.Group | null;
}

const VIEW_AHEAD = 170;
const VIEW_BEHIND = 12;
const SEND_MS = 250;
const HUD_MS = 100;

export class GalaxyEngine {
  private THREE: T;
  private renderer: Three.WebGLRenderer;
  private scene: Three.Scene;
  private camera: Three.PerspectiveCamera;
  private ship: Three.Group;
  private flame: Three.Mesh;
  private stars: Three.Points;
  private grid: Three.GridHelper;
  private pulses: Three.InstancedMesh;
  private arches: Three.InstancedMesh;
  private track: TrackItem[];
  private meshes = new Map<number, Three.Object3D>();
  private done = new Set<number>();
  private cursor = 0;
  private geo: Record<string, Three.BufferGeometry> = {};
  private mat: Record<string, Three.Material> = {};
  private peers = new Map<string, PeerState>();
  private raf = 0;
  private last = 0;
  private lastSend = 0;
  private lastHud = 0;
  private resize: ResizeObserver;
  private disposed = false;

  // O'yin holati
  private d = 0;
  private x = 0;
  private vx = 0;
  private speed = 0;
  private orbs = 0;
  private turbo: number;
  private turboUntil = 0;
  private ringUntil = 0;
  private stunUntil = 0;
  private left = false;
  private right = false;
  private place = 1;
  private total = 1;
  private flash: GalaxyHud["flash"] = null;

  constructor(
    THREE: T,
    private container: HTMLElement,
    private opts: GalaxyOptions
  ) {
    this.THREE = THREE;
    this.turbo = opts.turbo;
    this.track = galaxyTrack(opts.seed);

    const lowEnd = window.devicePixelRatio > 2 || navigator.hardwareConcurrency <= 4;
    this.renderer = new THREE.WebGLRenderer({ antialias: !lowEnd, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowEnd ? 1.25 : 1.75));
    this.renderer.setClearColor(0x04021a);
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x04021a, 60, VIEW_AHEAD);
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 500);

    this.scene.add(new THREE.AmbientLight(0x9b8cff, 0.75));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(6, 12, 8);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x22d3ee, 0.8);
    rim.position.set(-8, 4, -10);
    this.scene.add(rim);

    this.stars = this.makeStars(lowEnd ? 900 : 1800);
    this.scene.add(this.stars);
    this.scene.add(this.makePlanet());

    // Pol: neon to'r
    this.grid = new THREE.GridHelper(240, 60, 0xa855f7, 0x312e81);
    this.grid.position.y = -1.6;
    (this.grid.material as Three.Material).transparent = true;
    (this.grid.material as Three.Material).opacity = 0.55;
    this.scene.add(this.grid);

    // Yon relslar
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.18, VIEW_AHEAD + 40),
        new THREE.MeshBasicMaterial({ color: side < 0 ? 0x22d3ee : 0xf472b6 })
      );
      rail.position.set(side * (HALF_WIDTH + 1.1), -1.1, -(VIEW_AHEAD + 40) / 2 + 20);
      this.scene.add(rail);
    }
    // Relslardagi yugurib o'tadigan chiroqlar (tezlik hissi)
    this.pulses = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.5, 0.5, 1.6),
      new THREE.MeshBasicMaterial({ color: 0xfef08a }),
      40
    );
    this.scene.add(this.pulses);
    // Trassa ustidagi neon darvozalar
    this.arches = new THREE.InstancedMesh(
      new THREE.TorusGeometry(HALF_WIDTH + 2.2, 0.12, 8, 48, Math.PI),
      new THREE.MeshBasicMaterial({ color: 0x8b5cf6, transparent: true, opacity: 0.6 }),
      5
    );
    this.scene.add(this.arches);

    // Umumiy shakllar va materiallar
    this.geo.rock = new THREE.IcosahedronGeometry(1, 0);
    this.geo.orb = new THREE.OctahedronGeometry(0.45);
    this.geo.ring = new THREE.TorusGeometry(1.5, 0.16, 10, 36);
    this.mat.rock = new THREE.MeshStandardMaterial({ color: 0x8a7a6a, roughness: 0.95, flatShading: true });
    this.mat.rockHot = new THREE.MeshStandardMaterial({ color: 0x6b4f3a, roughness: 0.9, flatShading: true, emissive: 0x3b0a0a });
    this.mat.orb = new THREE.MeshStandardMaterial({ color: 0x67e8f9, emissive: 0x06b6d4, emissiveIntensity: 1.6, metalness: 0.3, roughness: 0.2 });
    this.mat.ring = new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xf59e0b, emissiveIntensity: 1.4, metalness: 0.6, roughness: 0.3 });

    const own = this.makeShip(SHIP_COLORS[opts.ship % SHIP_COLORS.length], false);
    this.ship = own.group;
    this.flame = own.flame;
    this.scene.add(this.ship);

    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(container);
    this.fit();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---------------- Boshqaruv ----------------

  setInput(left: boolean, right: boolean) {
    this.left = left;
    this.right = right;
  }

  useTurbo(): boolean {
    const now = performance.now();
    if (this.turbo <= 0 || now < this.opts.startAt || now > this.opts.endAt || now < this.turboUntil) return false;
    this.turbo -= 1;
    this.turboUntil = now + TURBO_MS;
    this.flash = { kind: "turbo", at: now };
    this.opts.onEvent?.("turbo");
    return true;
  }

  /** Server javobi: boshqa kemalar va o'rin */
  setPeers(peers: GalaxyPeer[], place: number, total: number) {
    const now = performance.now();
    this.place = place;
    this.total = total;
    const seen = new Set<string>();
    for (const [id, name, d, x, ship] of peers) {
      seen.add(id);
      const p = this.peers.get(id);
      if (!p) {
        this.peers.set(id, { id, name, ship, d, x, v: 0, at: now, shownD: d, shownX: x, group: null });
        continue;
      }
      const dt = (now - p.at) / 1000;
      if (dt > 0.05 && d >= p.d) p.v = Math.min(80, (d - p.d) / dt) * 0.6 + p.v * 0.4;
      p.d = d;
      p.x = x;
      p.at = now;
    }
    for (const [id, p] of this.peers) {
      if (seen.has(id)) continue;
      if (p.group) this.scene.remove(p.group);
      this.peers.delete(id);
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resize.disconnect();
    this.scene.traverse((o) => {
      const m = o as Three.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as Three.Material | Three.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose?.();
      const tex = (mat as Three.SpriteMaterial | undefined)?.map;
      tex?.dispose?.();
    });
    Object.values(this.geo).forEach((g) => g.dispose());
    Object.values(this.mat).forEach((m) => m.dispose());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ---------------- Sahna qismlari ----------------

  private fit() {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private makeStars(n: number): Three.Points {
    const { THREE } = this;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const palette = [new THREE.Color(0xffffff), new THREE.Color(0xa5b4fc), new THREE.Color(0xf0abfc), new THREE.Color(0x67e8f9)];
    for (let i = 0; i < n; i++) {
      // Trassa ustidagi bo'shliqqa yulduz qo'yilmaydi — kameraga yaqin kelib katta kvadrat bo'lib qolmasin
      let x = 0;
      let y = 0;
      do {
        x = (Math.random() - 0.5) * 320;
        y = Math.random() * 140 - 30;
      } while (Math.abs(x) < 18 && y < 14);
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = -Math.random() * 420;
      const c = palette[i % palette.length];
      col.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({ size: 0.7, vertexColors: true, transparent: true, opacity: 0.9, fog: false }));
  }

  private makePlanet(): Three.Group {
    const { THREE } = this;
    const g = new THREE.Group();
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(38, 32, 24),
      new THREE.MeshStandardMaterial({ color: 0x6d28d9, emissive: 0x2e1065, roughness: 0.8, fog: false })
    );
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(48, 66, 64),
      new THREE.MeshBasicMaterial({ color: 0xf0abfc, side: THREE.DoubleSide, transparent: true, opacity: 0.35, fog: false })
    );
    ring.rotation.x = Math.PI / 2.4;
    g.add(planet, ring);
    g.position.set(-120, 60, -380);
    return g;
  }

  private makeShip(color: string, ghost: boolean): { group: Three.Group; flame: Three.Mesh } {
    const { THREE } = this;
    const g = new THREE.Group();
    const opacity = ghost ? 0.55 : 1;
    const body = new THREE.MeshStandardMaterial({ color, metalness: 0.65, roughness: 0.3, transparent: ghost, opacity, emissive: new THREE.Color(color).multiplyScalar(0.15) });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1e1b4b, metalness: 0.7, roughness: 0.4, transparent: ghost, opacity });
    const hull = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.4, 10), body);
    hull.rotation.x = -Math.PI / 2;
    const cockpit = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0x93c5fd, emissive: 0x1d4ed8, emissiveIntensity: 0.6, metalness: 0.2, roughness: 0.1, transparent: true, opacity: ghost ? 0.5 : 0.9 })
    );
    cockpit.position.set(0, 0.28, -0.1);
    cockpit.scale.set(1, 0.7, 1.6);
    const wings = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 0.75), dark);
    wings.position.set(0, -0.05, 0.45);
    const tipL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.6), body);
    tipL.position.set(-1.3, 0.12, 0.5);
    const tipR = tipL.clone();
    tipR.position.x = 1.3;
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.3, 1.2, 10),
      new THREE.MeshBasicMaterial({ color: 0xfb923c, transparent: true, opacity: ghost ? 0.5 : 0.9 })
    );
    flame.rotation.x = Math.PI / 2;
    flame.position.set(0, 0, 1.75);
    g.add(hull, cockpit, wings, tipL, tipR, flame);
    return { group: g, flame };
  }

  private makeLabel(text: string, color: string): Three.Sprite {
    const { THREE } = this;
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const c = canvas.getContext("2d")!;
    c.fillStyle = "rgba(2,6,23,0.7)";
    c.beginPath();
    c.roundRect(4, 8, 248, 48, 22);
    c.fill();
    c.strokeStyle = color;
    c.lineWidth = 4;
    c.stroke();
    c.fillStyle = "#fff";
    c.font = "bold 28px system-ui, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text.length > 14 ? `${text.slice(0, 13)}…` : text, 128, 33);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.scale.set(3.2, 0.8, 1);
    sprite.position.set(0, 1.5, 0);
    return sprite;
  }

  // ---------------- Kadr ----------------

  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.step(now, dt);
    this.render(now, dt);
    if (now - this.lastSend > SEND_MS && now >= this.opts.startAt - 300) {
      this.lastSend = now;
      this.opts.onSend({ d: this.d, x: this.x, orbs: this.orbs });
    }
    if (now - this.lastHud > HUD_MS) {
      this.lastHud = now;
      this.opts.onHud({
        d: this.d,
        speed: this.speed,
        orbs: this.orbs,
        turbo: this.turbo,
        place: this.place,
        total: this.total,
        countdown: Math.max(0, this.opts.startAt - now),
        remaining: Math.max(0, this.opts.endAt - now),
        stunned: now < this.stunUntil,
        boosting: now < this.turboUntil || now < this.ringUntil,
        finished: now >= this.opts.endAt,
        flash: this.flash && now - this.flash.at < 600 ? this.flash : null,
      });
    }
  };

  private step(now: number, dt: number) {
    const racing = now >= this.opts.startAt && now < this.opts.endAt;
    // Tezlik: boshida tezlashadi, turbo va halqa qo'shadi, asteroidga urilsa keskin sekinlashadi
    let target = 0;
    if (racing) {
      const t = (now - this.opts.startAt) / 1000;
      target = SPEED.base + (SPEED.max - SPEED.base) * Math.min(1, t / 18);
      if (now < this.turboUntil) target += SPEED.turbo;
      if (now < this.ringUntil) target += SPEED.ring;
      if (now < this.stunUntil) target = SPEED.stunned;
    }
    const k = now < this.stunUntil ? 12 : target > this.speed ? 1.6 : 2.4;
    this.speed += (target - this.speed) * (1 - Math.exp(-dt * k));
    this.d += this.speed * dt;

    // Yonga burilish: inersiya bilan
    const want = racing ? (this.right ? 1 : 0) - (this.left ? 1 : 0) : 0;
    this.vx += (want * 1.9 - this.vx) * (1 - Math.exp(-dt * 9));
    this.x = Math.max(-1, Math.min(1, this.x + this.vx * dt));
    if (Math.abs(this.x) >= 1) this.vx = 0;

    if (!racing) return;
    // To'qnashuvlar: kema yonidan o'tayotgan elementlar
    const shipX = this.x * HALF_WIDTH;
    for (let i = this.cursor; i < this.track.length; i++) {
      const it = this.track[i];
      if (it.z > this.d + 1.5) break;
      if (this.done.has(it.id) || it.z < this.d - 1.5) continue;
      const dx = Math.abs(it.x * HALF_WIDTH - shipX);
      if (it.kind === "rock" && dx < it.size * 0.9 + 0.55) {
        this.done.add(it.id);
        if (now >= this.stunUntil && now >= this.turboUntil) {
          this.stunUntil = now + STUN_MS;
          this.speed = SPEED.stunned;
          this.flash = { kind: "hit", at: now };
          this.opts.onEvent?.("hit");
        }
      } else if (it.kind === "orb" && dx < 1.2) {
        this.done.add(it.id);
        this.orbs += 1;
        this.flash = { kind: "orb", at: now };
        this.opts.onEvent?.("orb");
        this.hide(it.id);
      } else if (it.kind === "ring" && dx < 1.4) {
        this.done.add(it.id);
        this.ringUntil = now + RING_MS;
        this.flash = { kind: "ring", at: now };
        this.opts.onEvent?.("ring");
      }
    }
    while (this.cursor < this.track.length && this.track[this.cursor].z < this.d - VIEW_BEHIND) this.cursor++;
  }

  private hide(id: number) {
    const m = this.meshes.get(id);
    if (m) m.visible = false;
  }

  private render(now: number, dt: number) {
    const { THREE } = this;
    const shipX = this.x * HALF_WIDTH;
    const t = now / 1000;

    // Kema: burilishda yonboshlaydi, tebranadi; urilganda miltillaydi
    this.ship.position.set(shipX, Math.sin(t * 3) * 0.08, 0);
    this.ship.rotation.z = -this.vx * 0.32;
    this.ship.rotation.y = -this.vx * 0.08;
    this.ship.visible = now >= this.stunUntil || Math.floor(now / 80) % 2 === 0;
    const boost = now < this.turboUntil || now < this.ringUntil;
    const fl = 0.6 + this.speed / 40 + (boost ? 0.9 : 0) + Math.sin(t * 40) * 0.08;
    this.flame.scale.set(1, fl, 1);
    this.flame.position.z = 1.4 + fl * 0.5;
    (this.flame.material as Three.MeshBasicMaterial).color.setHex(boost ? 0x67e8f9 : 0xfb923c);

    // Kamera: kemaning orqasida, tezlikda ko'rish burchagi kengayadi, urilganda titraydi
    const shake = now < this.stunUntil ? (Math.random() - 0.5) * 0.35 : 0;
    this.camera.position.set(shipX * 0.7 + shake, 3.4 + shake, 9.5);
    this.camera.lookAt(shipX * 0.85, 0.2, -22);
    const fov = 60 + Math.max(0, this.speed - SPEED.base) * 0.35 + (boost ? 6 : 0);
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, dt * 4);
      this.camera.updateProjectionMatrix();
    }

    // Yulduzlar va pol harakati
    const pos = this.stars.geometry.getAttribute("position") as Three.BufferAttribute;
    const arr = pos.array as Float32Array;
    const move = this.speed * dt * 0.35;
    for (let i = 2; i < arr.length; i += 3) {
      arr[i] += move;
      if (arr[i] > 0) arr[i] -= 420;
    }
    pos.needsUpdate = true;
    this.grid.position.z = this.d % 4;

    const m = new THREE.Matrix4();
    for (let i = 0; i < 40; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const z = -((Math.floor(i / 2) * 9 - (this.d % 9) + 180) % 180) + 6;
      m.makeTranslation(side * (HALF_WIDTH + 1.1), -1.1, z);
      this.pulses.setMatrixAt(i, m);
    }
    this.pulses.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < 5; i++) {
      const z = -((i * 40 - (this.d % 40) + 200) % 200) + 8;
      m.makeTranslation(0, -1.4, z);
      this.arches.setMatrixAt(i, m);
    }
    this.arches.instanceMatrix.needsUpdate = true;

    // Trassa elementlari: ko'rinadigan oynadagilar yaratiladi, orqada qolganlari olib tashlanadi
    const keep = new Set<number>();
    for (let i = this.cursor; i < this.track.length; i++) {
      const it = this.track[i];
      if (it.z > this.d + VIEW_AHEAD) break;
      keep.add(it.id);
      let mesh = this.meshes.get(it.id);
      if (!mesh) {
        if (it.kind === "rock") {
          mesh = new THREE.Mesh(this.geo.rock, it.id % 3 === 0 ? this.mat.rockHot : this.mat.rock);
          mesh.scale.setScalar(it.size);
          mesh.rotation.set(it.id, it.id * 0.7, 0);
        } else if (it.kind === "orb") {
          mesh = new THREE.Mesh(this.geo.orb, this.mat.orb);
        } else {
          mesh = new THREE.Mesh(this.geo.ring, this.mat.ring);
        }
        if (this.done.has(it.id) && it.kind === "orb") mesh.visible = false;
        this.scene.add(mesh);
        this.meshes.set(it.id, mesh);
      }
      mesh.position.set(it.x * HALF_WIDTH, it.kind === "rock" ? -0.2 : 0.1, -(it.z - this.d));
      if (it.kind === "rock") {
        mesh.rotation.x += dt * 0.6;
        mesh.rotation.y += dt * 0.4;
      } else if (it.kind === "orb") {
        mesh.rotation.y = t * 3 + it.id;
        mesh.position.y = 0.1 + Math.sin(t * 4 + it.id) * 0.2;
      }
    }
    for (const [id, mesh] of this.meshes) {
      if (keep.has(id)) continue;
      this.scene.remove(mesh);
      this.meshes.delete(id);
    }

    // Boshqa kemalar: oxirgi ma'lum masofa + taxminiy tezlik bilan silliq
    for (const p of this.peers.values()) {
      const ahead = Math.min(1, (now - p.at) / 1000);
      const targetD = p.d + p.v * ahead;
      p.shownD += (targetD - p.shownD) * Math.min(1, dt * 6);
      p.shownX += (p.x - p.shownX) * Math.min(1, dt * 6);
      const dz = p.shownD - this.d;
      if (dz > VIEW_AHEAD || dz < -30) {
        if (p.group) p.group.visible = false;
        continue;
      }
      if (!p.group) {
        const color = SHIP_COLORS[p.ship % SHIP_COLORS.length];
        const s = this.makeShip(color, true);
        s.group.add(this.makeLabel(p.name, color));
        p.group = s.group;
        this.scene.add(p.group);
      }
      p.group.visible = true;
      p.group.position.set(p.shownX * HALF_WIDTH, Math.sin(t * 3 + p.ship) * 0.08, -dz);
    }

    this.renderer.render(this.scene, this.camera);
  }
}
