// 3D personaj (three.js): 2D chizmadagi qismlar oddiy shakllardan (shar, kapsula, konus) yig'iladi.
// Multfilm uslubi: "toon" yoritish (3 pog'onali soya), har qism atrofida to'q kontur (teskari qobiq usuli),
// yerga tushgan yumshoq soya va ACES rang moslash.
// Sichqoncha: sudrash — aylantirish (inersiya bilan), bosish — sakrab qo'l silkitadi, kursor tomonga bosh buriladi.
// Ko'rinmay qolsa (sahifadan chiqib ketsa) — chizish to'xtaydi. Faqat profil sahifasida, kerak bo'lganda yuklanadi.

import type * as T from "three";
import { DEFAULT_LOOK, OUTFIT_COLORS, tierOf, type GameLook } from "@/lib/character/catalog";
import { COSTUMES } from "./character-svg";

type Three = typeof import("three");

const SKIN: Record<string, number> = {
  peach: 0xffd9b8,
  tan: 0xf1c27d,
  brown: 0xc68642,
  cocoa: 0x8d5524,
  mint: 0xa7f3d0,
  sky: 0xbae6fd,
  lilac: 0xddd6fe,
  gold: 0xfcd34d,
  galaxy: 0xa78bfa,
};

const hex = (s: string) => parseInt(s.replace("#", ""), 16);

export class Character3DScene {
  private renderer: T.WebGLRenderer;
  private scene: T.Scene;
  private camera: T.PerspectiveCamera;
  private root: T.Group;
  private rig: T.Group | null = null;
  private parts: {
    head?: T.Object3D;
    eyes: T.Object3D[];
    armL?: T.Object3D;
    armR?: T.Object3D;
    legL?: T.Object3D;
    legR?: T.Object3D;
    cape?: T.Object3D;
    wings: T.Object3D[];
    flames: T.Object3D[];
    spin: T.Object3D[];
    sparks: T.Object3D[];
    pet?: T.Object3D;
  } = { eyes: [], wings: [], flames: [], spin: [], sparks: [] };
  private raf = 0;
  private running = true;
  private t0 = performance.now();
  private last = performance.now();
  private rotY = 0.35;
  private velY = 0;
  private dragging = false;
  private dragX = 0;
  private moved = 0;
  private jumpAt = -10;
  private look = { x: 0, y: 0 };
  private io: IntersectionObserver;
  private ro: ResizeObserver;
  private disposables: { dispose: () => void }[] = [];
  private toonRamp: T.DataTexture;
  private outlineMat: T.MeshBasicMaterial;
  private shadowTex: T.CanvasTexture;

  constructor(
    private THREE: Three,
    private host: HTMLElement,
    look: Partial<GameLook>,
    private onPoke?: () => void
  ) {
    const { WebGLRenderer, Scene, PerspectiveCamera, HemisphereLight, DirectionalLight, Group } = THREE;
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    // Toon soyasi: 3 pog'ona (to'q / o'rta / yorug')
    this.toonRamp = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
    this.toonRamp.minFilter = THREE.NearestFilter;
    this.toonRamp.magFilter = THREE.NearestFilter;
    this.toonRamp.needsUpdate = true;
    this.outlineMat = new THREE.MeshBasicMaterial({ color: 0x1b1530, side: THREE.BackSide });
    // Yumshoq soya (radial gradient)
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const cx = c.getContext("2d")!;
    const grd = cx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, "rgba(0,0,0,0.55)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    cx.fillStyle = grd;
    cx.fillRect(0, 0, 128, 128);
    this.shadowTex = new THREE.CanvasTexture(c);
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = "none";
    this.renderer.domElement.style.cursor = "grab";
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(32, 1, 0.1, 50);
    this.camera.position.set(0, 1.7, 7.4);
    this.camera.lookAt(0, 1.35, 0);
    this.scene.add(new HemisphereLight(0xffffff, 0x334155, 1.6));
    const key = new DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 5, 4);
    this.scene.add(key);
    const rim = new DirectionalLight(0x67e8f9, 1.2);
    rim.position.set(-4, 3, -3);
    this.scene.add(rim);
    this.root = new Group();
    this.scene.add(this.root);
    this.setLook(look);

    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(host);
    this.io = new IntersectionObserver((e) => {
      this.running = e[0]?.isIntersecting ?? true;
      if (this.running) this.loop();
    });
    this.io.observe(host);
    this.fit();
    this.loop();
  }

  private fit() {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private onDown = (e: PointerEvent) => {
    this.dragging = true;
    this.dragX = e.clientX;
    this.moved = 0;
    this.renderer.domElement.style.cursor = "grabbing";
    this.renderer.domElement.setPointerCapture?.(e.pointerId);
  };

  private onMove = (e: PointerEvent) => {
    const r = this.host.getBoundingClientRect();
    this.look.x = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width * 0.8)));
    this.look.y = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height * 0.35)) / (r.height * 0.8)));
    if (!this.dragging) return;
    const dx = e.clientX - this.dragX;
    this.dragX = e.clientX;
    this.moved += Math.abs(dx);
    this.rotY += dx * 0.012;
    this.velY = dx * 0.012;
  };

  private onUp = () => {
    if (!this.dragging) return;
    this.dragging = false;
    this.renderer.domElement.style.cursor = "grab";
    // Deyarli surilmagan bo'lsa — bosish: sakrab, qo'l silkitadi
    if (this.moved < 6) {
      this.jumpAt = (performance.now() - this.t0) / 1000;
      this.onPoke?.();
    }
  };

  /** Material: oddiy qismlar — toon (multfilm), metall va shaffoflar — standart (yaltiraydi) */
  private mat(color: number, opts: Partial<T.MeshStandardMaterialParameters> = {}): T.Material {
    const metal = (opts.metalness ?? 0) > 0.3;
    if (metal || opts.transparent) {
      const m = new this.THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.05, ...opts });
      if (metal) m.emissive.setHex(color).multiplyScalar(0.12);
      this.disposables.push(m);
      return m;
    }
    const m = new this.THREE.MeshToonMaterial({
      color,
      gradientMap: this.toonRamp,
      side: opts.side,
      emissive: opts.emissive !== undefined ? new this.THREE.Color(opts.emissive as number) : undefined,
      emissiveIntensity: opts.emissiveIntensity,
    });
    this.disposables.push(m);
    return m;
  }

  /** Kontur: har qism orqasida biroz kattaroq, teskari tomoni chizilgan to'q nusxa (kichik va yassi qismlarga emas) */
  private outline(root: T.Object3D) {
    const THREE = this.THREE;
    const list: T.Mesh[] = [];
    root.traverse((o) => {
      const m = o as T.Mesh;
      if (!m.isMesh || m.userData.outline || m.userData.noOutline) return;
      const mat = m.material as T.Material & { transparent?: boolean; emissiveIntensity?: number; emissive?: T.Color };
      // Shaffof va nurli (olov, uchqun, toj) qismlarga kontur kerak emas
      const e = mat.emissive;
      const glowing = e ? Math.max(e.r, e.g, e.b) * (mat.emissiveIntensity ?? 1) > 0.3 : false;
      if (mat.transparent || glowing) return;
      if (m.geometry.type === "ShapeGeometry" || m.geometry.type === "PlaneGeometry") return;
      m.geometry.computeBoundingSphere();
      const r = m.geometry.boundingSphere?.radius ?? 0;
      if (r < 0.07) return;
      list.push(m);
    });
    for (const m of list) {
      const r = m.geometry.boundingSphere!.radius;
      const hull = new THREE.Mesh(m.geometry, this.outlineMat);
      hull.userData.outline = true;
      hull.scale.setScalar(Math.min(1.14, Math.max(1.03, 1 + 0.032 / r)));
      m.add(hull);
    }
  }

  private mesh(geo: T.BufferGeometry, mat: T.Material, x = 0, y = 0, z = 0, parent?: T.Object3D) {
    this.disposables.push(geo);
    const m = new this.THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    (parent ?? this.rig!).add(m);
    return m;
  }

  /** Ko'rinish o'zgarsa — personaj qaytadan yig'iladi */
  setLook(raw: Partial<GameLook>) {
    const THREE = this.THREE;
    const look = { ...DEFAULT_LOOK, color: 0, level: 1, ...raw } as GameLook;
    if (this.rig) {
      this.root.remove(this.rig);
      for (const d of this.disposables) d.dispose();
      this.disposables = [];
    }
    this.parts = { eyes: [], wings: [], flames: [], spin: [], sparks: [] };
    const rig = new THREE.Group();
    this.rig = rig;
    this.root.add(rig);
    const { SphereGeometry, CapsuleGeometry, CylinderGeometry, ConeGeometry, TorusGeometry, BoxGeometry, Group } = THREE;
    const cos = look.costume && look.costume !== "none" ? COSTUMES[look.costume] : undefined;
    const skin = this.mat(cos?.skin ? hex(cos.skin) : SKIN[look.skin] ?? SKIN.peach, look.skin === "gold" ? { metalness: 0.6, roughness: 0.3 } : look.skin === "galaxy" ? { emissive: 0x4c1d95, emissiveIntensity: 0.4 } : {});
    const main = hex(OUTFIT_COLORS[look.color % OUTFIT_COLORS.length] ?? OUTFIT_COLORS[0]);
    const tier = tierOf(look.level);
    const o = (() => {
      if (cos) return { body: hex(cos.body), trim: hex(cos.trim), legs: hex(cos.legs), metal: cos.helmet ? 0.35 : 0 };
      switch (look.outfit) {
        case "school":
          return { body: 0x1e3a8a, trim: 0xf8fafc, legs: 0x1e293b, metal: 0 };
        case "ninja":
          return { body: 0x1f2937, trim: 0xef4444, legs: 0x111827, metal: 0 };
        case "armor":
          return { body: 0xcbd5e1, trim: 0xfacc15, legs: 0x94a3b8, metal: 0.8 };
        case "space":
          return { body: 0xf8fafc, trim: 0xf97316, legs: 0xe2e8f0, metal: 0.1 };
        case "hero":
          return { body: main, trim: 0xfacc15, legs: main, metal: 0.1 };
        case "royal":
          return { body: 0x6d28d9, trim: 0xfbbf24, legs: 0x4c1d95, metal: 0.2 };
        case "hoodie":
          return { body: main, trim: 0xffffff, legs: 0x334155, metal: 0 };
        default:
          return { body: main, trim: 0xffffff, legs: 0x1e40af, metal: 0 };
      }
    })();
    const bodyM = this.mat(o.body, { metalness: o.metal, roughness: o.metal ? 0.3 : 0.6 });
    const trimM = this.mat(o.trim, { metalness: o.metal ? 0.6 : 0.1 });
    const legM = this.mat(o.legs);
    const dark = this.mat(0x0f172a);

    // Yerga va supaga tushgan yumshoq soya
    const shadowMat = new THREE.MeshBasicMaterial({ map: this.shadowTex, transparent: true, depthWrite: false });
    this.disposables.push(shadowMat);
    const floor = this.mesh(new THREE.PlaneGeometry(3.4, 3.4), shadowMat, 0, -0.17, 0);
    floor.rotation.x = -Math.PI / 2;
    floor.userData.noOutline = true;
    const contact = this.mesh(new THREE.PlaneGeometry(1.3, 1.3), shadowMat, 0, 0.012, 0);
    contact.rotation.x = -Math.PI / 2;
    contact.userData.noOutline = true;
    // Supa (darajaga qarab material)
    const ped = this.mesh(new CylinderGeometry(0.95, 1.05, 0.18, 48), this.mat(hex(tier.light), { metalness: 0.7, roughness: 0.3 }), 0, -0.09, 0);
    ped.renderOrder = -1;
    if (look.level >= 5) {
      const ring = this.mesh(new TorusGeometry(1.15, 0.025, 8, 64), this.mat(hex(tier.light), { emissive: hex(tier.light), emissiveIntensity: 0.8 }), 0, 0.02, 0);
      ring.rotation.x = Math.PI / 2;
      this.parts.spin.push(ring);
    }
    if (look.level >= 7) {
      const aura = this.mesh(new TorusGeometry(1.35, 0.012, 6, 96), this.mat(hex(tier.light), { emissive: hex(tier.light), emissiveIntensity: 1, transparent: true, opacity: 0.7 }), 0, 1.2, 0);
      aura.rotation.x = Math.PI / 2.4;
      this.parts.spin.push(aura);
    }

    // Oyoqlar
    const mkLeg = (x: number) => {
      const g = new Group();
      g.position.set(x, 0.7, 0);
      rig.add(g);
      this.mesh(new CapsuleGeometry(0.13, 0.36, 6, 12), legM, 0, -0.3, 0, g);
      const shoe = this.mesh(new SphereGeometry(0.17, 16, 12), dark, 0, -0.6, 0.06, g);
      shoe.scale.set(1, 0.6, 1.4);
      return g;
    };
    this.parts.legL = mkLeg(-0.18);
    this.parts.legR = mkLeg(0.18);

    // Tana
    this.mesh(new CapsuleGeometry(0.43, 0.42, 8, 20), bodyM, 0, 1.05, 0);
    if (look.outfit === "ninja") this.mesh(new TorusGeometry(0.44, 0.05, 8, 32), trimM, 0, 0.9, 0).rotation.x = Math.PI / 2;
    if (look.outfit === "hero" || look.outfit === "armor") {
      const e = this.mesh(new CylinderGeometry(0.16, 0.16, 0.04, 6), trimM, 0, 1.15, 0.42);
      e.rotation.x = Math.PI / 2;
    }
    if (look.outfit === "royal") this.mesh(new BoxGeometry(0.14, 0.75, 0.05), trimM, 0, 1.05, 0.42);
    if (look.outfit === "space") this.mesh(new BoxGeometry(0.4, 0.22, 0.08), this.mat(0xcbd5e1), 0, 1.1, 0.41);
    if (look.outfit === "school") {
      const c = this.mesh(new ConeGeometry(0.2, 0.25, 3), trimM, 0, 1.35, 0.33);
      c.rotation.x = Math.PI;
    }
    if (look.outfit === "hoodie") this.mesh(new TorusGeometry(0.32, 0.09, 8, 24), bodyM, 0, 1.45, -0.12).rotation.x = Math.PI / 2.3;

    // Qo'llar (yelkadan aylanadi)
    const mkArm = (x: number) => {
      const g = new Group();
      g.position.set(x, 1.38, 0);
      rig.add(g);
      this.mesh(new CapsuleGeometry(0.11, 0.42, 6, 12), bodyM, 0, -0.28, 0, g);
      this.mesh(new SphereGeometry(0.13, 16, 12), skin, 0, -0.58, 0, g);
      return g;
    };
    this.parts.armL = mkArm(-0.56);
    this.parts.armR = mkArm(0.56);
    this.handItem(look.hand, this.parts.armR);

    // Kostyum: ko'krak (qorin) belgisi, dum va plash
    if (cos?.emblem === "belly") this.mesh(new SphereGeometry(0.34, 20, 16), trimM, 0, 1.0, 0.16).scale.set(1, 1.1, 0.6);
    if (cos?.tail) {
      const tail = this.mesh(new CapsuleGeometry(0.09, 0.55, 6, 10), this.mat(hex(cos.tail)), 0.25, 0.7, -0.45);
      tail.rotation.x = -0.9;
      tail.rotation.z = -0.5;
    }
    const backKind = cos ? (cos.cape ? "costume-cape" : "none") : look.back;
    if (backKind === "costume-cape" && cos?.cape) {
      const cape = this.mesh(new CylinderGeometry(0.45, 0.8, 1.15, 20, 1, true, Math.PI * 0.6, Math.PI * 0.8), this.mat(hex(cos.cape), { side: THREE.DoubleSide }), 0, 0.95, -0.05);
      this.parts.cape = cape;
    }
    // Orqadagi narsalar
    if (backKind === "cape") {
      const cape = this.mesh(new CylinderGeometry(0.45, 0.75, 1.1, 20, 1, true, Math.PI * 0.6, Math.PI * 0.8), this.mat(0xdc2626, { side: THREE.DoubleSide }), 0, 0.95, -0.05);
      this.parts.cape = cape;
    }
    if (backKind === "backpack") this.mesh(new BoxGeometry(0.62, 0.62, 0.3), this.mat(0x92400e), 0, 1.08, -0.42);
    if (backKind === "jetpack") {
      for (const x of [-0.22, 0.22]) {
        this.mesh(new CylinderGeometry(0.13, 0.13, 0.6, 16), this.mat(0x64748b, { metalness: 0.7, roughness: 0.3 }), x, 1.08, -0.45);
        const f = this.mesh(new ConeGeometry(0.11, 0.35, 12), this.mat(0xf97316, { emissive: 0xf97316, emissiveIntensity: 1.5 }), x, 0.62, -0.45);
        f.rotation.x = Math.PI;
        this.parts.flames.push(f);
      }
    }
    if (backKind === "wings" || backKind === "dragon") {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.bezierCurveTo(0.4, 0.5, 1.1, 0.6, 1.2, 0.1);
      shape.bezierCurveTo(0.9, 0.1, 0.9, -0.3, 0.6, -0.4);
      shape.bezierCurveTo(0.4, -0.3, 0.2, -0.2, 0, 0);
      const wm = backKind === "wings" ? this.mat(0xf8fafc, { side: THREE.DoubleSide }) : this.mat(0x7c3aed, { side: THREE.DoubleSide, metalness: 0.2 });
      for (const s of [-1, 1]) {
        const pivot = new Group();
        pivot.position.set(s * 0.15, 1.25, -0.38);
        rig.add(pivot);
        const geo = new THREE.ShapeGeometry(shape);
        const w = this.mesh(geo, wm, 0, 0, 0, pivot);
        w.scale.set(s, 1, 1);
        pivot.userData.side = s;
        this.parts.wings.push(pivot);
      }
    }

    // Bosh
    const head = new Group();
    head.position.set(0, 1.85, 0);
    rig.add(head);
    this.parts.head = head;
    this.mesh(new SphereGeometry(0.58, 32, 24), skin, 0, 0, 0, head);
    for (const x of [-0.58, 0.58]) this.mesh(new SphereGeometry(0.13, 12, 10), skin, x, -0.02, 0, head);
    if (!cos?.noHair) this.hair(look, head);
    // Yuz
    const eyeM = look.eyes === "fire" ? this.mat(0xf97316, { emissive: 0xf97316, emissiveIntensity: 1 }) : look.eyes === "star" ? this.mat(0xfacc15, { emissive: 0xfacc15, emissiveIntensity: 0.6 }) : dark;
    if (look.eyes === "shades" || look.eyes === "visor") {
      const v = this.mesh(new BoxGeometry(look.eyes === "visor" ? 0.85 : 0.75, 0.18, 0.1), look.eyes === "visor" ? this.mat(0x22d3ee, { emissive: 0x0891b2, emissiveIntensity: 0.8 }) : dark, 0, 0.02, 0.53, head);
      this.parts.eyes.push(v);
    } else {
      for (const x of [-0.2, 0.2]) {
        const e = this.mesh(new SphereGeometry(0.085, 16, 12), eyeM, x, 0.02, 0.52, head);
        e.scale.set(1, 1.25, 0.6);
        this.mesh(new SphereGeometry(0.028, 8, 8), this.mat(0xffffff), x + 0.03, 0.06, 0.575, head);
        this.parts.eyes.push(e);
      }
    }
    for (const x of [-0.33, 0.33]) {
      const c = this.mesh(new SphereGeometry(0.08, 12, 8), this.mat(0xfb7185, { transparent: true, opacity: 0.45 }), x, -0.14, 0.47, head);
      c.scale.set(1, 0.6, 0.3);
    }
    // Qoshlar
    if (look.eyes !== "visor") {
      const browM = this.mat(look.skin === "galaxy" ? 0x2e1065 : 0x3b2314);
      for (const s of [-1, 1]) {
        const b = this.mesh(new CapsuleGeometry(0.025, 0.13, 4, 8), browM, s * 0.2, 0.2, 0.53, head);
        b.rotation.z = Math.PI / 2 + s * 0.12;
        b.userData.noOutline = true;
      }
    }
    if (look.mouth === "mask") {
      this.mesh(new SphereGeometry(0.59, 24, 16, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.3), this.mat(0x1f2937), 0, 0, 0, head);
    } else {
      const m = this.mesh(new TorusGeometry(0.11, 0.025, 8, 16, Math.PI), this.mat(0x7f1d1d), 0, -0.16, 0.53, head);
      m.rotation.z = Math.PI;
      if (look.mouth === "open") m.scale.set(0.6, 1.4, 1);
    }
    if (cos) this.costumeHead(cos, head);
    else this.headItem(look, head, main);

    // Hamroh
    if (look.pet !== "none") this.pet(look.pet);

    // Kuch: uchqunlar
    const power = Math.max(0, Math.min(5, look.power ?? 0));
    const sparkM = this.mat(power >= 5 ? 0xf0abfc : power >= 3 ? 0x67e8f9 : 0xfde047, { emissive: power >= 5 ? 0xf0abfc : power >= 3 ? 0x67e8f9 : 0xfde047, emissiveIntensity: 1.4 });
    for (let i = 0; i < power * 2; i++) {
      const s = this.mesh(new THREE.OctahedronGeometry(0.06 + (i % 3) * 0.015), sparkM, 0, 0, 0);
      s.userData.a = (i / (power * 2)) * Math.PI * 2;
      s.userData.h = 0.6 + (i % 4) * 0.45;
      this.parts.sparks.push(s);
    }
    this.outline(rig);
    if (look.level >= 10) {
      for (let i = 0; i < 3; i++) {
        const s = this.mesh(new SphereGeometry(0.07, 10, 8), this.mat(0xfef08a, { emissive: 0xfef08a, emissiveIntensity: 1.5 }), 0, 0, 0);
        s.userData.a = (i / 3) * Math.PI * 2;
        s.userData.h = 2.6;
        s.userData.orbit = true;
        this.parts.sparks.push(s);
      }
    }
  }

  private hair(look: GameLook, head: T.Object3D) {
    if (look.head === "astro" || look.head === "helmet") return;
    const { SphereGeometry, ConeGeometry, BoxGeometry } = this.THREE;
    const color = look.hair === "fire" ? 0xf97316 : look.skin === "galaxy" ? 0x1e1b4b : 0x3b2314;
    const m = this.mat(color, look.hair === "fire" ? { emissive: 0xf97316, emissiveIntensity: 0.7 } : {});
    const cap = this.mesh(new SphereGeometry(0.61, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.42), m, 0, 0.02, -0.02, head);
    cap.rotation.x = -0.18;
    if (look.hair === "long") this.mesh(new BoxGeometry(1.1, 0.8, 0.3), m, 0, -0.25, -0.38, head);
    if (look.hair === "bun") this.mesh(new SphereGeometry(0.2, 16, 12), m, 0, 0.66, -0.1, head);
    if (look.hair === "spiky" || look.hair === "fire")
      for (let i = 0; i < 7; i++) {
        const c = this.mesh(new ConeGeometry(0.1, 0.32, 8), m, -0.42 + i * 0.14, 0.52 - Math.abs(i - 3) * 0.05, -0.05, head);
        c.rotation.z = (3 - i) * 0.15;
        if (look.hair === "fire") this.parts.flames.push(c);
      }
    if (look.hair === "curly") for (let i = 0; i < 9; i++) this.mesh(new SphereGeometry(0.15, 10, 8), m, Math.cos((i / 9) * Math.PI) * 0.5, 0.42 + Math.sin((i / 9) * Math.PI) * 0.14, 0.05, head);
    if (look.hair === "mohawk") this.mesh(new BoxGeometry(0.12, 0.35, 0.8), this.mat(0xec4899), 0, 0.62, 0, head);
  }

  /** Kostyum qalpog'i: quloqlar/shoxlar/tikanlar, shlem, shlyapa, niqob */
  private costumeHead(c: (typeof COSTUMES)[string], head: T.Object3D) {
    const { SphereGeometry, ConeGeometry, CylinderGeometry, BoxGeometry, TorusGeometry } = this.THREE;
    if (c.hood) {
      const m = this.mat(hex(c.hood));
      const hood = this.mesh(new SphereGeometry(0.65, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.62), m, 0, 0.02, -0.03, head);
      // Old tomoni yuqoriroq (yuz ochiq), orqasi pastroq
      hood.rotation.x = -0.8;
      if (c.ears === "cat") for (const s of [-1, 1]) this.mesh(new ConeGeometry(0.16, 0.34, 4), m, s * 0.36, 0.62, -0.02, head).rotation.z = -s * 0.35;
      if (c.ears === "horns") for (const s of [-1, 1]) this.mesh(new ConeGeometry(0.07, 0.32, 10), this.mat(0xfef3c7), s * 0.28, 0.7, -0.05, head).rotation.z = -s * 0.4;
      if (c.ears === "spikes") for (let i = 0; i < 4; i++) this.mesh(new ConeGeometry(0.08, 0.22, 6), this.mat(hex(c.trim)), 0, 0.66 - i * 0.12, -0.12 - i * 0.16, head).rotation.x = -0.4 - i * 0.35;
    }
    if (c.helmet) {
      this.mesh(new SphereGeometry(0.7, 32, 24), this.mat(hex(c.body), { metalness: 0.4, roughness: 0.25 }), 0, 0, 0, head);
      this.mesh(new BoxGeometry(0.86, 0.2, 0.12), this.mat(0x22d3ee, { emissive: 0x0891b2, emissiveIntensity: 0.9 }), 0, 0.05, 0.62, head);
    }
    if (c.mask) this.mesh(new TorusGeometry(0.585, 0.08, 8, 40), this.mat(hex(c.mask)), 0, 0.04, 0, head).rotation.x = Math.PI / 2;
    if (c.hat === "pirate") {
      this.mesh(new CylinderGeometry(0.8, 0.8, 0.06, 3), this.mat(0x111827), 0, 0.42, 0, head);
      this.mesh(new SphereGeometry(0.45, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), this.mat(0x111827), 0, 0.42, 0, head);
    }
    if (c.hat === "ice") for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      this.mesh(new ConeGeometry(0.06, 0.3, 6), this.mat(0xe0f2fe, { transparent: true, opacity: 0.9 }), Math.sin(a) * 0.4, 0.72, Math.cos(a) * 0.4, head);
    }
    if (c.hat === "leaf") for (let i = 0; i < 5; i++) {
      const leaf = this.mesh(new SphereGeometry(0.12, 10, 8), this.mat(i % 2 ? 0x84cc16 : 0x65a30d), -0.36 + i * 0.18, 0.66, 0, head);
      leaf.scale.set(0.6, 1.6, 0.4);
    }
    if (c.eyepatch) this.mesh(new SphereGeometry(0.11, 12, 10), this.mat(0x111827), 0.2, 0.04, 0.55, head).scale.set(1, 1, 0.4);
  }

  private headItem(look: GameLook, head: T.Object3D, main: number) {
    const { SphereGeometry, CylinderGeometry, ConeGeometry, TorusGeometry, BoxGeometry } = this.THREE;
    switch (look.head) {
      case "cap": {
        this.mesh(new SphereGeometry(0.62, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.4), this.mat(main), 0, 0.05, 0, head);
        const b = this.mesh(new CylinderGeometry(0.42, 0.42, 0.04, 24, 1, false, 0, Math.PI), this.mat(main), 0, 0.28, 0.32, head);
        b.rotation.y = -Math.PI / 2;
        break;
      }
      case "beanie":
        this.mesh(new SphereGeometry(0.63, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.42), this.mat(0x0f766e), 0, 0.04, 0, head);
        break;
      case "headphones": {
        const band = this.mesh(new TorusGeometry(0.64, 0.05, 8, 32, Math.PI), this.mat(0x1f2937), 0, 0.02, 0, head);
        band.rotation.y = Math.PI / 2;
        for (const x of [-0.64, 0.64]) this.mesh(new CylinderGeometry(0.17, 0.17, 0.14, 16), this.mat(0xef4444), x, 0, 0, head).rotation.z = Math.PI / 2;
        break;
      }
      case "band":
        this.mesh(new TorusGeometry(0.6, 0.06, 8, 32), this.mat(0xdc2626), 0, 0.22, 0, head).rotation.x = Math.PI / 2;
        break;
      case "helmet": {
        this.mesh(new SphereGeometry(0.68, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.62), this.mat(0x94a3b8, { metalness: 0.35, roughness: 0.25 }), 0, 0, 0, head);
        this.mesh(new BoxGeometry(0.8, 0.06, 0.1), this.mat(0x334155), 0, 0.1, 0.62, head);
        this.mesh(new ConeGeometry(0.1, 0.35, 8), this.mat(0xdc2626), 0, 0.78, 0, head);
        break;
      }
      case "wizard": {
        this.mesh(new CylinderGeometry(0.85, 0.85, 0.05, 32), this.mat(0x4c1d95), 0, 0.38, 0, head);
        const c = this.mesh(new ConeGeometry(0.5, 1.1, 24), this.mat(0x6d28d9), 0, 0.92, 0, head);
        c.rotation.z = -0.15;
        this.mesh(new this.THREE.OctahedronGeometry(0.1), this.mat(0xfacc15, { emissive: 0xfacc15, emissiveIntensity: 1 }), 0.05, 0.85, 0.42, head);
        break;
      }
      case "astro":
        this.mesh(new SphereGeometry(0.8, 32, 24), this.mat(0xe0f2fe, { transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1 }), 0, 0, 0, head);
        break;
      case "crown": {
        const gold = this.mat(0xfbbf24, { metalness: 0.4, roughness: 0.2 });
        this.mesh(new CylinderGeometry(0.42, 0.45, 0.22, 24, 1, true), gold, 0, 0.6, 0, head);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          this.mesh(new ConeGeometry(0.07, 0.22, 8), gold, Math.sin(a) * 0.42, 0.8, Math.cos(a) * 0.42, head);
        }
        this.mesh(new SphereGeometry(0.06, 10, 8), this.mat(0xef4444, { emissive: 0xef4444, emissiveIntensity: 0.6 }), 0, 0.6, 0.45, head);
        break;
      }
      case "halo": {
        const h = this.mesh(new TorusGeometry(0.42, 0.05, 10, 40), this.mat(0xfde047, { emissive: 0xfde047, emissiveIntensity: 1.5 }), 0, 0.85, 0, head);
        h.rotation.x = Math.PI / 2;
        this.parts.spin.push(h);
        break;
      }
    }
  }

  private handItem(kind: string, arm: T.Object3D) {
    const { CylinderGeometry, BoxGeometry, OctahedronGeometry } = this.THREE;
    const y = -0.6;
    switch (kind) {
      case "pencil":
        this.mesh(new CylinderGeometry(0.04, 0.04, 0.55, 8), this.mat(0xfacc15), 0, y + 0.1, 0.12, arm).rotation.x = Math.PI / 2.5;
        break;
      case "book":
        this.mesh(new BoxGeometry(0.35, 0.45, 0.1), this.mat(0x2563eb), 0, y - 0.05, 0.15, arm);
        break;
      case "laptop":
        this.mesh(new BoxGeometry(0.55, 0.36, 0.05), this.mat(0x334155), 0, y, 0.2, arm);
        this.mesh(new BoxGeometry(0.48, 0.3, 0.01), this.mat(0x22d3ee, { emissive: 0x22d3ee, emissiveIntensity: 0.7 }), 0, y, 0.23, arm);
        break;
      case "sword":
        this.mesh(new BoxGeometry(0.07, 0.9, 0.02), this.mat(0xe2e8f0, { metalness: 0.4, roughness: 0.15 }), 0, y + 0.55, 0.12, arm);
        this.mesh(new BoxGeometry(0.3, 0.05, 0.06), this.mat(0xa16207, { metalness: 0.6 }), 0, y + 0.08, 0.12, arm);
        break;
      case "wand":
        this.mesh(new CylinderGeometry(0.03, 0.03, 0.6, 8), this.mat(0x78350f), 0, y + 0.25, 0.12, arm);
        this.parts.spin.push(this.mesh(new OctahedronGeometry(0.1), this.mat(0xfde047, { emissive: 0xfde047, emissiveIntensity: 1.5 }), 0, y + 0.6, 0.12, arm));
        break;
      case "trophy": {
        const gold = this.mat(0xfbbf24, { metalness: 0.4, roughness: 0.2 });
        this.mesh(new CylinderGeometry(0.2, 0.1, 0.3, 20), gold, 0, y + 0.12, 0.2, arm);
        this.mesh(new CylinderGeometry(0.12, 0.14, 0.08, 16), gold, 0, y - 0.1, 0.2, arm);
        break;
      }
    }
  }

  private pet(kind: string) {
    const { Group, SphereGeometry, ConeGeometry, BoxGeometry } = this.THREE;
    const g = new Group();
    g.position.set(-1.05, 0.45, 0.3);
    this.rig!.add(g);
    this.parts.pet = g;
    const color = kind === "chick" ? 0xfde047 : kind === "cat" ? 0xf59e0b : kind === "drone" ? 0x334155 : 0x22c55e;
    const m = this.mat(color);
    if (kind === "drone") {
      this.mesh(new BoxGeometry(0.4, 0.14, 0.3), m, 0, 0.6, 0, g);
      this.mesh(new SphereGeometry(0.06, 8, 8), this.mat(0x22d3ee, { emissive: 0x22d3ee, emissiveIntensity: 1 }), 0, 0.6, 0.16, g);
      const p = this.mesh(new BoxGeometry(0.6, 0.02, 0.06), this.mat(0x94a3b8), 0, 0.7, 0, g);
      this.parts.spin.push(p);
      return;
    }
    this.mesh(new SphereGeometry(0.22, 16, 12), m, 0, 0, 0, g);
    this.mesh(new SphereGeometry(0.16, 16, 12), m, 0, 0.26, 0.05, g);
    for (const x of [-0.06, 0.06]) this.mesh(new SphereGeometry(0.025, 8, 8), this.mat(0x0f172a), x, 0.3, 0.19, g);
    if (kind === "chick") this.mesh(new ConeGeometry(0.04, 0.1, 8), this.mat(0xf97316), 0, 0.24, 0.22, g).rotation.x = Math.PI / 2;
    if (kind === "cat") for (const x of [-0.09, 0.09]) this.mesh(new ConeGeometry(0.05, 0.12, 6), m, x, 0.43, 0.03, g);
    if (kind === "dragon") for (const s of [-1, 1]) this.mesh(new ConeGeometry(0.08, 0.25, 4), this.mat(0x15803d), s * 0.2, 0.15, -0.1, g).rotation.z = -s * 1.2;
  }

  private loop = () => {
    cancelAnimationFrame(this.raf);
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const t = (now - this.t0) / 1000;
    const p = this.parts;
    // Aylanish: sudralmasa — inersiya, keyin sekin o'z-o'zidan chayqaladi
    if (!this.dragging) {
      this.velY *= 0.94;
      this.rotY += this.velY + Math.sin(t * 0.6) * 0.0015;
    }
    this.root.rotation.y = this.rotY;
    // Sakrash (bosilganda) yoki nafas
    const j = t - this.jumpAt;
    const jumping = j >= 0 && j < 0.9;
    const jy = jumping ? Math.sin((j / 0.9) * Math.PI) * 0.6 : 0;
    if (this.rig) {
      this.rig.position.y = jy + Math.sin(t * 2.4) * 0.025;
      this.rig.rotation.y = jumping ? (j / 0.9) * Math.PI * 2 : 0;
    }
    if (p.armL && p.armR) {
      const wave = jumping || (j >= 0 && j < 1.6);
      p.armL.rotation.z = wave ? -2.6 + Math.sin(t * 16) * 0.3 : -0.12 + Math.sin(t * 2.4) * 0.05;
      p.armR.rotation.z = wave ? 2.6 - Math.sin(t * 16) * 0.3 : 0.12 - Math.sin(t * 2.4) * 0.05;
    }
    if (p.legL && p.legR) {
      p.legL.rotation.x = jumping ? -0.5 : 0;
      p.legR.rotation.x = jumping ? 0.3 : 0;
    }
    if (p.head) {
      // Bosh kursor tomonga buriladi
      p.head.rotation.y += (this.look.x * 0.7 - p.head.rotation.y) * Math.min(1, dt * 6);
      p.head.rotation.x += (this.look.y * 0.35 - p.head.rotation.x) * Math.min(1, dt * 6);
    }
    // Ko'z pirpiratish
    const blink = t % 3.8 < 0.12 ? 0.15 : 1;
    for (const e of p.eyes) e.scale.y = (e.userData.base ??= e.scale.y) * blink;
    if (p.cape) p.cape.rotation.x = -0.12 - Math.sin(t * 3) * 0.08 - (jumping ? 0.35 : 0);
    for (const w of p.wings) w.rotation.y = w.userData.side * (0.3 + Math.sin(t * (jumping ? 18 : 5)) * 0.35);
    for (const f of p.flames) f.scale.y = 0.8 + Math.sin(t * 40 + f.id) * 0.25;
    for (const s of p.spin) s.rotation.z += dt * 1.6;
    for (const s of p.sparks) {
      const a = s.userData.a + t * (s.userData.orbit ? 1.2 : 0.7);
      const r = s.userData.orbit ? 1.4 : 1.15;
      s.position.set(Math.cos(a) * r, s.userData.h + Math.sin(t * 2 + s.userData.a) * 0.1, Math.sin(a) * r);
      s.rotation.y += dt * 3;
      const k = 0.6 + Math.abs(Math.sin(t * 3 + s.userData.a)) * 0.6;
      s.scale.setScalar(k);
    }
    if (p.pet) p.pet.position.y = 0.45 + Math.abs(Math.sin(t * 3)) * 0.18;
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.io.disconnect();
    this.ro.disconnect();
    this.renderer.domElement.removeEventListener("pointerdown", this.onDown);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    for (const d of this.disposables) d.dispose();
    this.toonRamp.dispose();
    this.outlineMat.dispose();
    this.shadowTex.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
