// Profile 3D character (three.js): the chibi model from three/char-model.ts in a soft "studio" —
// image-based lighting (RoomEnvironment), key/fill/rim lights, real soft shadows, ACES tone mapping,
// a level pedestal with glowing rings. Animated by the shared rig state machine (breathing, blinking,
// weight shift, looking around); click — celebrates; the head and eyes follow the cursor; drag — rotate.
// Rendering stops when the view is off-screen. Loaded only on the profile page, when needed.

import type * as T from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { DEFAULT_LOOK, tierOf, type GameLook } from "@/lib/character/catalog";
import { RigActor, newPose } from "@/lib/game/rig";
import { skinFx } from "@/lib/game/skins";
import { buildCharModel, type CharModel } from "./three/char-model";

type Three = typeof import("three");

export class Character3DScene {
  private renderer: T.WebGLRenderer;
  private scene: T.Scene;
  private camera: T.PerspectiveCamera;
  private root: T.Group;
  private stage: T.Group | null = null;
  private model: CharModel | null = null;
  private actor = new RigActor({ seed: 3 });
  private pose = newPose();
  private spin: T.Object3D[] = [];
  private sparks: T.Object3D[] = [];
  private stageDisposables: { dispose: () => void }[] = [];
  private envTex: T.Texture;
  private raf = 0;
  private running = true;
  private t0 = performance.now();
  private last = performance.now();
  private rotY = 0.35;
  private velY = 0;
  private dragging = false;
  private dragX = 0;
  private moved = 0;
  private look = { x: 0, y: 0 };
  private io: IntersectionObserver;
  private ro: ResizeObserver;

  constructor(
    private THREE: Three,
    private host: HTMLElement,
    look: Partial<GameLook>,
    private onPoke?: () => void
  ) {
    const { WebGLRenderer, Scene, PerspectiveCamera, HemisphereLight, DirectionalLight, Group, PMREMGenerator } = THREE;
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = "none";
    this.renderer.domElement.style.cursor = "grab";
    this.scene = new Scene();
    // Soft studio reflections for every PBR material
    const pmrem = new PMREMGenerator(this.renderer);
    this.envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = this.envTex;
    this.scene.environmentIntensity = 0.55;
    this.camera = new PerspectiveCamera(30, 1, 0.1, 50);
    this.camera.position.set(0, 1.75, 7.6);
    this.camera.lookAt(0, 1.2, 0);
    this.scene.add(new HemisphereLight(0xfff4e6, 0x3b3f6b, 0.9));
    const key = new DirectionalLight(0xfff1e0, 2.4);
    key.position.set(-3, 6, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -2;
    key.shadow.camera.right = 2;
    key.shadow.camera.top = 3;
    key.shadow.camera.bottom = -1;
    key.shadow.bias = -0.0004;
    key.shadow.radius = 6;
    this.scene.add(key);
    const fill = new DirectionalLight(0xc7d2fe, 0.7);
    fill.position.set(4, 2.5, 3);
    this.scene.add(fill);
    const rim = new DirectionalLight(0x99f6e4, 1.6);
    rim.position.set(2.5, 3.5, -4);
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
      if (this.running) {
        this.last = performance.now();
        this.loop();
      }
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
    // Barely moved — a click: the character celebrates (sometimes jumps)
    if (this.moved < 6) {
      this.actor.request(Math.random() < 0.65 ? "celebrate" : "jump");
      this.onPoke?.();
    }
  };

  /** Look changed — rebuild the character and its pedestal */
  setLook(raw: Partial<GameLook>) {
    const THREE = this.THREE;
    const look = { ...DEFAULT_LOOK, color: 0, level: 1, ...raw } as GameLook;
    if (this.stage) {
      this.root.remove(this.stage);
      for (const d of this.stageDisposables) d.dispose();
      this.stageDisposables = [];
    }
    this.model?.dispose();
    this.spin = [];
    this.sparks = [];
    const stage = new THREE.Group();
    this.stage = stage;
    this.root.add(stage);
    const track = <X extends { dispose: () => void }>(x: X) => {
      this.stageDisposables.push(x);
      return x;
    };
    const tier = tierOf(look.level);
    // Pedestal (material by level) and a shadow-catching top
    const pedMat = track(new THREE.MeshPhysicalMaterial({ color: new THREE.Color(tier.light), metalness: 0.75, roughness: 0.28, clearcoat: 0.6 }));
    const ped = new THREE.Mesh(track(new THREE.CylinderGeometry(0.95, 1.05, 0.18, 64)), pedMat);
    ped.position.y = -0.09;
    ped.receiveShadow = true;
    stage.add(ped);
    const top = new THREE.Mesh(track(new THREE.CircleGeometry(0.94, 64)), track(new THREE.ShadowMaterial({ opacity: 0.32 })));
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.002;
    top.receiveShadow = true;
    stage.add(top);
    const glowMat = (hex: string, k: number, opacity = 1) =>
      track(new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), emissive: new THREE.Color(hex), emissiveIntensity: k, transparent: opacity < 1, opacity }));
    if (look.level >= 5) {
      const ring = new THREE.Mesh(track(new THREE.TorusGeometry(1.15, 0.022, 10, 96)), glowMat(tier.light, 0.9));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.02;
      stage.add(ring);
      this.spin.push(ring);
    }
    if (look.level >= 7) {
      const aura = new THREE.Mesh(track(new THREE.TorusGeometry(1.32, 0.01, 8, 128)), glowMat(tier.light, 1, 0.7));
      aura.rotation.x = Math.PI / 2.4;
      aura.position.y = 1.2;
      stage.add(aura);
      this.spin.push(aura);
    }
    const fx = skinFx(look.costume);
    if (fx.aura) {
      const halo = new THREE.Mesh(track(new THREE.TorusGeometry(1.05, 0.03, 10, 96)), glowMat(fx.aura, 1.2, 0.8));
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 0.05;
      stage.add(halo);
      this.spin.push(halo);
    }
    // Power sparks and level-10 stars orbit the character
    const power = Math.max(0, Math.min(5, look.power ?? 0));
    const sparkHex = power >= 5 ? "#f0abfc" : power >= 3 ? "#67e8f9" : "#fde047";
    for (let i = 0; i < power * 2; i++) {
      const s = new THREE.Mesh(track(new THREE.OctahedronGeometry(0.05 + (i % 3) * 0.012)), glowMat(sparkHex, 1.4));
      s.userData = { a: (i / (power * 2)) * Math.PI * 2, h: 0.5 + (i % 4) * 0.45 };
      stage.add(s);
      this.sparks.push(s);
    }
    if (look.level >= 10)
      for (let i = 0; i < 3; i++) {
        const s = new THREE.Mesh(track(new THREE.SphereGeometry(0.06, 12, 10)), glowMat("#fef08a", 1.5));
        s.userData = { a: (i / 3) * Math.PI * 2, h: 2.5, orbit: true };
        stage.add(s);
        this.sparks.push(s);
      }
    this.model = buildCharModel(THREE, look);
    stage.add(this.model.root);
    this.actor = new RigActor({ seed: 3, celebrate: fx.celebrate });
  }

  private loop = () => {
    cancelAnimationFrame(this.raf);
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(1 / 30, (now - this.last) / 1000);
    this.last = now;
    const t = (now - this.t0) / 1000;
    // Turntable: inertia after a drag, then a slow sway
    if (!this.dragging) {
      this.velY *= 0.94;
      this.rotY += this.velY + Math.sin(t * 0.6) * 0.0012;
    }
    this.root.rotation.y = this.rotY;
    this.actor.update(dt, { moving: false });
    this.actor.pose(this.pose);
    this.model?.pose(this.pose, t, this.look);
    for (const s of this.spin) s.rotation.z += dt * 1.4;
    for (const s of this.sparks) {
      const d = s.userData as { a: number; h: number; orbit?: boolean };
      const a = d.a + t * (d.orbit ? 1.2 : 0.7);
      const r = d.orbit ? 1.35 : 1.1;
      s.position.set(Math.cos(a) * r, d.h + Math.sin(t * 2 + d.a) * 0.1, Math.sin(a) * r);
      s.rotation.y += dt * 3;
      s.scale.setScalar(0.6 + Math.abs(Math.sin(t * 3 + d.a)) * 0.6);
    }
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
    this.model?.dispose();
    for (const d of this.stageDisposables) d.dispose();
    this.envTex.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
