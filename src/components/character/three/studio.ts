// Shared "photo studio" lighting for the chibi character: image-based reflections (RoomEnvironment),
// a warm key light from the upper left with soft shadows, a cool fill, a bright rim from behind and
// a soft bounce from below. Used by the profile scene and the sprite baker so both look the same.

import type * as T from "three";

type Three = typeof import("three");

export async function setupStudio(THREE: Three, renderer: T.WebGLRenderer, scene: T.Scene, o: { shadows: boolean; mapSize?: number }) {
  // loaded on demand: three.js must never end up in the main bundle
  const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js");
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  if (o.shadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = env;
  scene.environmentIntensity = 0.5;
  scene.add(new THREE.HemisphereLight(0xfff6ec, 0x4a4470, 0.75));
  const key = new THREE.DirectionalLight(0xfff0de, 2.6);
  key.position.set(-4.2, 5.6, 4.2);
  if (o.shadows) {
    key.castShadow = true;
    const ms = o.mapSize ?? 2048;
    key.shadow.mapSize.set(ms, ms);
    const c = key.shadow.camera;
    c.left = -1.8;
    c.right = 1.8;
    c.top = 3.2;
    c.bottom = -0.6;
    c.near = 0.5;
    c.far = 20;
    key.shadow.bias = -0.0003;
    key.shadow.normalBias = 0.012;
    key.shadow.radius = 4;
  }
  scene.add(key);
  scene.add(key.target);
  key.target.position.set(0, 1.1, 0);
  const fill = new THREE.DirectionalLight(0xd4dcff, 0.75);
  fill.position.set(4, 2.2, 3.5);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xfff7e8, 1.9);
  rim.position.set(2.8, 4, -4.5);
  scene.add(rim);
  const rim2 = new THREE.DirectionalLight(0xbfe9ff, 0.9);
  rim2.position.set(-3, 2.5, -4);
  scene.add(rim2);
  const bounce = new THREE.DirectionalLight(0xffe2cc, 0.35);
  bounce.position.set(0, -3, 2);
  scene.add(bounce);
  return { env, key };
}
