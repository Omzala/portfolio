import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { compileScene, createStage, glowTexture, prefersReducedMotion, runWhileVisible } from './stage.js';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3, ...extra });
const glow = color => new THREE.MeshBasicMaterial({ color, toneMapped: false });
const rand = (min, max) => min + Math.random() * (max - min);

function add(parent, geometry, material, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...p);
  mesh.rotation.set(...r);
  mesh.scale.set(...s);
  parent.add(mesh);
  return mesh;
}

// The hull is a lathe along x (engines at -x, nose at +x), squashed into a wide, low carrier.
const HULL = [[0.1, -3.4], [0.8, -3.35], [1.25, -2.8], [1.5, -1.6], [1.55, -0.2], [1.4, 1.2], [1.05, 2.4], [0.6, 3.2], [0.22, 3.6], [0, 3.7]];
const FLAT_Y = 0.55;
const FLAT_Z = 1.15;
const radiusAt = x => {
  for (let i = 1; i < HULL.length; i++) {
    const [r1, a1] = HULL[i - 1];
    const [r2, a2] = HULL[i];
    if (x <= a2) return r1 + ((r2 - r1) * (x - a1)) / (a2 - a1);
  }
  return 0;
};
const topAt = x => radiusAt(x) * FLAT_Y;
// Where the hull surface sits sideways (z) at a given length (x) and height (y).
const sideAt = (x, y) => {
  const r = radiusAt(x);
  return r * FLAT_Z * Math.sqrt(Math.max(0, 1 - (y / (r * FLAT_Y)) ** 2));
};

// A soft fade along a cone: bright at its tip, or at its base when `reverse`.
function fadeTexture(reverse = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 0, 64);
  gradient.addColorStop(0, reverse ? '#000' : '#fff');
  gradient.addColorStop(1, reverse ? '#fff' : '#000');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 4, 64);
  return new THREE.CanvasTexture(canvas);
}

// Same layout on every visit: a tiny seeded random for the deck clutter.
function seeded(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

// The Trash Panda: Bandit's mothership. A raccoon-faced bridge, a turning habitat ring, a ringed tail
// boom, a radar dish, swept wings with engine pods and a hangar that beams scrap up out of space.
function buildMothership(textures) {
  const hull = mat(0x4a4760, { roughness: 0.34, metalness: 0.55 });
  const hullDark = mat(0x26252f, { roughness: 0.38, metalness: 0.6 });
  const panel = mat(0x625e78, { roughness: 0.45, metalness: 0.45 });
  const fur = mat(0x9b97aa, { roughness: 0.8, metalness: 0 });
  const furDark = mat(0x5a566a, { roughness: 0.85, metalness: 0 });
  const mask = mat(0x17161d, { roughness: 0.45, metalness: 0.2 });
  const white = mat(0xeeebf3, { roughness: 0.7, metalness: 0 });
  const orange = mat(0xff6a2b, { roughness: 0.4, metalness: 0.1, emissive: 0x551600, emissiveIntensity: 0.6 });
  const sphere = new THREE.SphereGeometry(1, 32, 20);
  const halo = (color, size) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures.glow(color), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sprite.scale.setScalar(size);
    return sprite;
  };

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // Hull with orange bands, panel seams, a raised top deck and a keel
  const shell = new THREE.Group();
  shell.scale.set(1, FLAT_Y, FLAT_Z);
  body.add(shell);
  add(shell, new THREE.LatheGeometry(HULL.map(([r, a]) => new THREE.Vector2(r, a)), 64), hull, { r: [0, 0, -Math.PI / 2] });
  [[-2.3, 0.08], [-3.0, 0.06], [2.0, 0.06]].forEach(([x, tube]) => add(shell, new THREE.TorusGeometry(radiusAt(x) + 0.02, tube, 10, 64), orange, { p: [x, 0, 0], r: [0, Math.PI / 2, 0] }));
  [-1.4, -0.5, 1.2, 2.7].forEach(x => add(shell, new THREE.TorusGeometry(radiusAt(x) + 0.004, 0.014, 6, 64), hullDark, { p: [x, 0, 0], r: [0, Math.PI / 2, 0] }));
  const deckY = topAt(-0.8) - 0.02;
  add(body, new RoundedBoxGeometry(3.6, 0.16, 1.9, 3, 0.07), panel, { p: [-0.8, deckY, 0] });
  [-1, 1].forEach(side => add(body, new THREE.BoxGeometry(3.3, 0.05, 0.08), orange, { p: [-0.8, deckY + 0.08, side * 0.82] }));
  add(body, new RoundedBoxGeometry(2.8, 0.2, 1.7, 3, 0.08), hullDark, { p: [-0.3, -topAt(-0.3) + 0.04, 0] });
  const random = seeded(7);
  for (let i = 0; i < 12; i++) {
    const [w, h, d] = [0.12 + random() * 0.26, 0.05 + random() * 0.1, 0.1 + random() * 0.22];
    add(body, new THREE.BoxGeometry(w, h, d), i % 3 ? panel : hullDark, { p: [-1.6 + random() * 2.3, deckY + 0.08 + h / 2, (random() - 0.5) * 1.2] });
  }

  // Radar dish on a mast at the back of the deck
  const radar = new THREE.Group();
  radar.position.set(-2.25, deckY + 0.5, 0);
  add(body, new THREE.CylinderGeometry(0.04, 0.06, 0.46, 10), hullDark, { p: [-2.25, deckY + 0.3, 0] });
  add(radar, new THREE.SphereGeometry(0.4, 24, 8, 0, Math.PI * 2, 0, 0.95), new THREE.MeshStandardMaterial({ color: 0x8f8aa6, roughness: 0.35, metalness: 0.6, side: THREE.DoubleSide }), { r: [0, 0, -Math.PI / 2 - 0.35] });
  add(radar, new THREE.CylinderGeometry(0.015, 0.015, 0.34, 6), orange, { p: [0.17, 0.06, 0], r: [0, 0, Math.PI / 2 - 0.35] });
  body.add(radar);

  // Chase lights running down both deck edges
  const chaseCount = 11;
  const chase = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 10, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), chaseCount * 2);
  const place = new THREE.Matrix4();
  for (let i = 0; i < chaseCount; i++) {
    [-1, 1].forEach((side, s) => {
      place.makeTranslation(0.9 - i * 0.34, deckY + 0.04, side * 0.97);
      chase.setMatrixAt(i * 2 + s, place);
      chase.setColorAt(i * 2 + s, new THREE.Color(0x3a1a10));
    });
  }
  body.add(chase);

  // Windows: rows of lit ports along both flanks, a few of them warm
  const ports = [];
  for (let x = -2.5; x <= 2.3; x += 0.3) {
    for (const y of [0.1, -0.2]) {
      for (const side of [-1, 1]) if (random() > 0.12) ports.push([x, y, side]);
    }
  }
  const windows = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.075, 0.04), new THREE.MeshBasicMaterial({ toneMapped: false }), ports.length);
  const cyanPort = new THREE.Color(0x5be7da);
  const warmPort = new THREE.Color(0xffc27a);
  const dimPort = new THREE.Color(0x24303a);
  ports.forEach(([x, y, side], i) => {
    place.makeRotationX(side * y * 0.8).setPosition(x, y, side * (sideAt(x, y) + 0.012));
    windows.setMatrixAt(i, place);
    windows.setColorAt(i, random() < 0.16 ? warmPort : cyanPort);
  });
  body.add(windows);

  // A habitat ring on four spokes, ringed with lit windows; it turns slowly
  const ring = new THREE.Group();
  ring.position.x = 0.35;
  add(ring, new THREE.TorusGeometry(2.3, 0.13, 14, 96), hullDark, { r: [0, Math.PI / 2, 0] });
  add(ring, new THREE.TorusGeometry(2.3, 0.05, 8, 96), orange, { p: [0.13, 0, 0], r: [0, Math.PI / 2, 0] });
  add(ring, new THREE.TorusGeometry(2.43, 0.025, 6, 96), glow(0x5be7da), { r: [0, Math.PI / 2, 0] });
  for (let i = 0; i < 4; i++) {
    const spoke = new THREE.Group();
    spoke.rotation.x = Math.PI / 4 + (i * Math.PI) / 2;
    add(spoke, new THREE.CylinderGeometry(0.06, 0.06, 1.1, 10), panel, { p: [0, 1.75, 0] });
    add(spoke, new THREE.BoxGeometry(0.32, 0.22, 0.26), hullDark, { p: [0, 2.3, 0] });
    ring.add(spoke);
  }
  body.add(ring);

  // Hangar bay under the keel, its tractor beam, and scrap on its way up
  const bayY = -topAt(-0.3) - 0.08;
  add(body, new THREE.BoxGeometry(1.7, 0.05, 0.7), glow(0x5be7da), { p: [-0.3, bayY, 0] });
  const beam = add(body, new THREE.ConeGeometry(1.3, 2.2, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0x5be7da, alphaMap: textures.fade, transparent: true, opacity: 0.14, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }), { p: [-0.3, bayY - 1.1, 0] });
  const nutGeometry = new THREE.TorusGeometry(0.11, 0.045, 6, 6);
  const nutMaterial = mat(0x5be7da, { roughness: 0.25, metalness: 0.6, emissive: 0x5be7da, emissiveIntensity: 0.6 });
  const scrap = Array.from({ length: 7 }, (_, i) => ({ mesh: add(body, nutGeometry, nutMaterial), phase: i / 7, angle: i * 2.4 }));
  const bayLight = new THREE.PointLight(0x5be7da, 10, 6, 1.6);
  bayLight.position.set(-0.3, bayY - 0.6, 0);
  body.add(bayLight);

  // Bridge: a raccoon head with ears, a mask visor, blinking eyes, a snout and two antennae
  const bridge = new THREE.Group();
  bridge.position.set(1.45, topAt(1.45) + 0.28, 0);
  body.add(bridge);
  add(bridge, sphere, fur, { s: [0.95, 0.66, 0.85] });
  const eyes = [];
  const beacons = [];
  [-1, 1].forEach(side => {
    const ear = new THREE.Group();
    ear.position.set(-0.15, 0.55, side * 0.5);
    ear.rotation.x = side * 0.4;
    add(ear, new THREE.ConeGeometry(0.27, 0.62, 18), furDark);
    add(ear, new THREE.ConeGeometry(0.16, 0.4, 14), mask, { p: [0.1, -0.05, 0] });
    bridge.add(ear);
    add(bridge, sphere, white, { p: [0.62, 0.36, side * 0.34], r: [side * 0.3, 0, 0], s: [0.3, 0.1, 0.14] });
    eyes.push(add(bridge, sphere, glow(0x5be7da), { p: [0.98, 0.12, side * 0.29], s: [0.09, 0.12, 0.12] }));
    const antenna = new THREE.Group();
    antenna.position.set(-0.55, 0.35, side * 0.22);
    antenna.rotation.z = 0.55;
    add(antenna, new THREE.CylinderGeometry(0.014, 0.02, 0.85, 6), hullDark, { p: [0, 0.42, 0] });
    const tip = halo(side < 0 ? 'rgba(255,106,43,1)' : 'rgba(255,194,122,1)', 0.45);
    tip.position.y = 0.86;
    antenna.add(tip);
    beacons.push(tip);
    bridge.add(antenna);
  });
  add(bridge, sphere, mask, { p: [0.52, 0.12, 0], s: [0.5, 0.22, 0.8] });
  add(bridge, sphere, white, { p: [0.66, -0.17, 0], s: [0.4, 0.24, 0.38] });
  add(bridge, sphere, mask, { p: [1.04, -0.1, 0], s: [0.1, 0.08, 0.1] });

  // Ringed tail boom curling up off the stern, with a beacon on the tip
  const tail = [];
  let parent = new THREE.Group();
  parent.position.set(-2.75, topAt(-2.75) * 0.9, 0);
  body.add(parent);
  for (let i = 0; i < 7; i++) {
    const joint = new THREE.Group();
    if (i) joint.position.x = -0.3;
    joint.rotation.z = -0.21;
    const size = 0.3 - i * 0.02;
    add(joint, sphere, i % 2 ? furDark : fur, { s: [0.2, size, size] });
    parent.add(joint);
    tail.push(joint);
    parent = joint;
  }
  add(parent, sphere, mask, { p: [-0.2, 0, 0], s: [0.14, 0.12, 0.12] });
  const tailBeacon = halo('rgba(255,194,122,1)', 0.9);
  tailBeacon.position.set(-0.32, 0, 0);
  parent.add(tailBeacon);

  // Engines: a nozzle, a flickering flame, a halo and a long exhaust trail each
  const flames = [];
  const halos = [];
  const trails = [];
  const engine = (group, x, y, z, size) => {
    const unit = new THREE.Group();
    unit.position.set(x, y, z);
    unit.scale.setScalar(size);
    add(unit, new THREE.CylinderGeometry(0.4, 0.5, 0.62, 28), hullDark, { r: [0, 0, Math.PI / 2] });
    add(unit, new THREE.TorusGeometry(0.42, 0.06, 10, 32), orange, { p: [-0.3, 0, 0], r: [0, Math.PI / 2, 0] });
    const flame = new THREE.Group();
    flame.position.x = -0.32;
    add(flame, new THREE.ConeGeometry(0.33, 1.5, 24), glow(0xff7a33), { p: [-0.75, 0, 0], r: [0, 0, Math.PI / 2] });
    add(flame, new THREE.ConeGeometry(0.17, 0.85, 18), glow(0xffe0a8), { p: [-0.42, 0, 0], r: [0, 0, Math.PI / 2] });
    unit.add(flame);
    flames.push(flame);
    const trail = new THREE.Group();
    trail.position.x = -0.4;
    add(trail, new THREE.ConeGeometry(0.42, 4.5, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xff8a4c, alphaMap: textures.fadeBase, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }), { p: [-2.25, 0, 0], r: [0, 0, Math.PI / 2] });
    unit.add(trail);
    trails.push(trail);
    const glowSprite = halo('rgba(255,140,60,1)', 1.9);
    glowSprite.position.x = -0.5;
    unit.add(glowSprite);
    halos.push(glowSprite);
    group.add(unit);
  };

  // Swept wings with engine pods and blinking navigation lights
  const wingShape = new THREE.Shape([[-0.5, 0], [-2.7, 0], [-3.2, 1.45], [-2.45, 1.45]].map(([x, y]) => new THREE.Vector2(x, y)));
  const wingGeometry = new THREE.ExtrudeGeometry(wingShape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
  const navLights = [];
  [-1, 1].forEach(side => {
    const wing = new THREE.Group();
    wing.position.set(0, -0.1, side * sideAt(-1.5, -0.1) * 0.92);
    wing.scale.z = side;
    wing.rotation.x = side * -0.1;
    add(wing, wingGeometry, hull, { p: [0, 0.04, 0], r: [Math.PI / 2, 0, 0] });
    add(wing, new THREE.BoxGeometry(2.0, 0.05, 0.07), orange, { p: [-1.6, 0.07, 0.25] });
    add(wing, new THREE.CylinderGeometry(0.22, 0.24, 1.3, 20), hullDark, { p: [-2.75, 0, 1.55], r: [0, 0, Math.PI / 2] });
    add(wing, new THREE.SphereGeometry(0.22, 20, 14), panel, { p: [-2.1, 0, 1.55], s: [1.3, 1, 1] });
    engine(wing, -3.45, 0, 1.55, 0.5);
    const light = halo(side < 0 ? 'rgba(255,106,43,1)' : 'rgba(91,231,218,1)', 0.8);
    light.position.set(-1.85, 0, 1.55);
    wing.add(light);
    navLights.push(light);
    body.add(wing);
  });
  [[-3.3, 0, 0, 1], [-3.05, -0.2, -0.75, 0.7], [-3.05, -0.2, 0.75, 0.7]].forEach(([x, y, z, size]) => engine(body, x, y, z, size));
  const sternLight = new THREE.PointLight(0xff7a33, 12, 6, 1.6);
  sternLight.position.set(-4, 0.3, 0);
  body.add(sternLight);

  return {
    root, body, ring, radar, chase, chaseCount, windows, ports: { count: ports.length, cyan: cyanPort, warm: warmPort, dim: dimPort },
    beam, bayY, scrap, eyes, beacons, tail, tailBeacon, navLights, flames, halos, trails,
  };
}

// One of Bandit's escort shuttles: a little cream rocket, nose along +z so lookAt() steers it.
function buildShuttle(textures) {
  const group = new THREE.Group();
  const model = new THREE.Group();
  group.add(model);
  const hull = mat(0xf3f0e8, { roughness: 0.3, metalness: 0.35 });
  const orange = mat(0xff6a2b, { roughness: 0.4, emissive: 0x4a1200, emissiveIntensity: 0.5 });
  const profile = [[0, -0.62], [0.17, -0.56], [0.23, -0.2], [0.21, 0.22], [0.11, 0.55], [0, 0.66]].map(([x, y]) => new THREE.Vector2(x, y));
  add(model, new THREE.LatheGeometry(profile, 24), hull, { r: [Math.PI / 2, 0, 0] });
  add(model, new THREE.TorusGeometry(0.22, 0.03, 8, 24), orange, { p: [0, 0, 0.05] });
  for (let i = 0; i < 3; i++) {
    const angle = Math.PI / 2 + (i * Math.PI * 2) / 3;
    add(model, new THREE.BoxGeometry(0.22, 0.03, 0.3), orange, { p: [Math.cos(angle) * 0.26, Math.sin(angle) * 0.26, -0.42], r: [0, 0, angle] });
  }
  add(model, new THREE.SphereGeometry(0.12, 16, 10), new THREE.MeshStandardMaterial({ color: 0x5be7da, roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.6 }), { p: [0, 0.15, 0.12] });
  const flame = new THREE.Group();
  flame.position.z = -0.62;
  add(flame, new THREE.ConeGeometry(0.11, 0.5, 12), glow(0xff7a33), { p: [0, 0, -0.25], r: [-Math.PI / 2, 0, 0] });
  const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures.glow('rgba(255,140,60,1)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  flare.scale.setScalar(0.8);
  flame.add(flare);
  model.add(flame);
  return { group, model, flame };
}

// Speed streaks rushing past behind (and a few in front of) the ship, fading from head to tail.
function buildStreaks(count) {
  const positions = new Float32Array(count * 6);
  const colors = new Float32Array(count * 6);
  const streaks = Array.from({ length: count }, (_, i) => {
    const front = Math.random() < 0.12;
    const streak = { x: rand(-24, 24), y: rand(-9, 9), z: front ? rand(3.5, 7) : rand(-24, -4), length: rand(0.6, 2.6), pace: rand(0.6, 1.4) };
    const tint = (front ? 0.35 : 0.9) * (0.4 + Math.random() * 0.6);
    colors.set([0, 0, 0, 0.75 * tint, 0.95 * tint, tint], i * 6);
    return streak;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  lines.frustumCulled = false;
  const update = (dt, speed, stretch) => {
    streaks.forEach((streak, i) => {
      streak.x += speed * streak.pace * dt;
      if (streak.x - streak.length * stretch > 24) streak.x = -24;
      positions.set([streak.x - streak.length * stretch, streak.y, streak.z, streak.x, streak.y, streak.z], i * 6);
    });
    geometry.attributes.position.needsUpdate = true;
  };
  return { lines, update };
}

const YAW = Math.PI + 0.45;
const pad = value => String(value).padStart(6, '0').replace(/(\d{3})(\d{3})/, '$1 $2');

// A self-contained scene for the mothership band. It reads where its host sits on screen, so the ship
// glides across as the page scrolls past, and writes live telemetry into the given elements.
export function createMothership(host, { speed: speedLabel, scrap: scrapLabel } = {}) {
  const stage = createStage(host, { maxPixelRatio: 1.5, reflections: true });
  if (!stage) return null;
  const { renderer, scene, dispose } = stage;
  const glowCache = new Map();
  const textures = {
    fade: fadeTexture(),
    fadeBase: fadeTexture(true),
    glow: color => {
      if (!glowCache.has(color)) glowCache.set(color, glowTexture(color, color.replace(/[\d.]+\)$/, '0)')));
      return glowCache.get(color);
    },
  };
  const camera = new THREE.PerspectiveCamera(30, 2, 0.1, 140);
  const ship = buildMothership(textures);
  ship.root.rotation.y = YAW;
  scene.add(ship.root);

  const fleet = [
    { ...buildShuttle(textures), rx: 6.2, rz: 3.4, y: 0.7, pace: 0.34, phase: 0 },
    { ...buildShuttle(textures), rx: 5.4, rz: 3.0, y: -0.9, pace: -0.43, phase: 2.4 },
  ];
  fleet.forEach(({ group }) => { group.scale.setScalar(0.9); scene.add(group); });

  const streaks = buildStreaks(200);
  scene.add(streaks.lines);

  // A distant teal world drifting by in the bottom corner, with a thin atmosphere and a ring.
  const world = new THREE.Group();
  world.position.set(18, -9, -36);
  world.add(new THREE.Mesh(new THREE.SphereGeometry(5.2, 48, 32), mat(0x1d5c66, { roughness: 0.85, metalness: 0 })));
  const atmosphere = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures.glow('rgba(91,231,218,0.5)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  atmosphere.scale.setScalar(14);
  world.add(atmosphere);
  add(world, new THREE.RingGeometry(7, 9.4, 96), new THREE.MeshBasicMaterial({ color: 0x7fdcd2, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }), { r: [Math.PI / 2.4, 0.3, 0] });
  scene.add(world);

  let halfWidth = 8;
  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Pull back until the ship (about 12.8 × 8.3 units with its ring and beam) fits either way. Portrait
    // screens frame it tighter and let its wingtips and trails leave the edges.
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const distance = Math.max(4.15 / tan, (camera.aspect < 1 ? 5 : 6.4) / (tan * camera.aspect));
    halfWidth = distance * tan * camera.aspect;
    camera.position.set(0, distance * 0.26, distance);
    camera.lookAt(0, 0.35, 0);
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  const pointer = { x: 0, y: 0 };
  const look = { x: 0, y: 0 };
  const onPointer = event => { pointer.x = event.clientX / window.innerWidth - 0.5; pointer.y = event.clientY / window.innerHeight - 0.5; };
  window.addEventListener('pointermove', onPointer, { passive: true });

  const reduced = prefersReducedMotion();
  const ahead = new THREE.Vector3();
  let progress = null;
  let velocity = 0;
  let hauled = 4212;
  let nextTwinkle = 0;
  let nextBlink = 2.5;
  let nextReadout = 0;

  const frame = (dt, t) => {
    // How far the band has travelled through the viewport sets how far along its flyby the ship is.
    const rect = host.getBoundingClientRect();
    const target = reduced ? 0.5 : THREE.MathUtils.clamp((window.innerHeight - rect.top) / (window.innerHeight + rect.height), 0, 1);
    progress = progress === null || !dt ? target : progress + (target - progress) * Math.min(1, dt * 2.5);
    look.x += (pointer.x - look.x) * 0.04;
    look.y += (pointer.y - look.y) * 0.04;

    const previousX = ship.root.position.x;
    // In from the right and out towards the left. On wide screens it passes a little right of centre,
    // clear of the copy; on portrait screens the copy sits above it, so it passes dead centre.
    const bias = camera.aspect < 1 ? 0 : 0.3;
    const x = THREE.MathUtils.lerp(halfWidth * (0.48 + bias), -halfWidth * (0.48 - bias), progress) + Math.sin(t * 0.13) * 0.5;
    ship.root.position.set(x, Math.sin(t * 0.7) * 0.18, Math.sin(t * 0.11) * 0.5);
    const vx = dt ? (x - previousX) / dt : 0;
    velocity += (Math.abs(vx) - velocity) * Math.min(1, dt * 3);
    ship.root.rotation.y = YAW + Math.sin(t * 0.21) * 0.05 + look.x * 0.16 + THREE.MathUtils.clamp(vx * 0.02, -0.12, 0.12);
    ship.root.rotation.x = look.y * 0.06;
    ship.body.rotation.x = Math.sin(t * 0.5) * 0.04;

    // Ship systems
    ship.ring.rotation.x = t * 0.22;
    ship.radar.rotation.y = t * 1.3;
    const thrust = Math.min(velocity, 4);
    ship.flames.forEach((flame, i) => flame.scale.set(0.85 + thrust * 0.08 + Math.sin(t * 29 + i * 1.7) * 0.1 + Math.random() * 0.08, 1, 1));
    ship.trails.forEach((trail, i) => trail.scale.set(0.55 + thrust * 0.22 + Math.sin(t * 7 + i) * 0.04, 1, 1));
    ship.halos.forEach((sprite, i) => sprite.scale.setScalar(1.9 * (0.92 + Math.sin(t * 23 + i * 2.1) * 0.06)));
    ship.tail.forEach((joint, i) => { joint.rotation.y = Math.sin(t * 1.3 - i * 0.6) * 0.09; });
    ship.navLights.forEach((light, i) => { light.visible = (t + i * 0.8) % 1.6 < 0.14; });
    ship.beacons.forEach((tip, i) => { tip.material.opacity = (t + i * 0.5) % 1.2 < 0.15 ? 1 : 0.2; });
    ship.tailBeacon.material.opacity = (t % 2.2) < 0.2 ? 1 : 0.25;
    ship.beam.material.opacity = 0.12 + Math.sin(t * 1.7) * 0.04;
    if (t > nextBlink) nextBlink = t + 2.6 + Math.random() * 3;
    const blink = nextBlink - t < 0.12 ? 0.15 : 1;
    ship.eyes.forEach(eye => { eye.scale.y += (0.12 * blink - eye.scale.y) * 0.5; });
    for (let i = 0; i < ship.chaseCount; i++) {
      const glowAt = Math.max(0, 1 - (((i / ship.chaseCount - t * 0.7) % 1) + 1) % 1 * 5);
      const color = new THREE.Color(0x3a1a10).lerp(new THREE.Color(0xffa060), glowAt);
      ship.chase.setColorAt(i * 2, color);
      ship.chase.setColorAt(i * 2 + 1, color);
    }
    ship.chase.instanceColor.needsUpdate = true;
    if (t > nextTwinkle) {
      nextTwinkle = t + 0.25 + Math.random() * 0.4;
      const { count, cyan, warm, dim } = ship.ports;
      const roll = Math.random();
      ship.windows.setColorAt((Math.random() * count) | 0, roll < 0.3 ? dim : roll < 0.45 ? warm : cyan);
      ship.windows.instanceColor.needsUpdate = true;
    }

    // Scrap rises up the tractor beam, spinning, and is counted as it reaches the hangar.
    const bottom = ship.bayY - 2.2;
    ship.scrap.forEach(piece => {
      const before = piece.rise ?? piece.phase;
      piece.rise = (piece.phase + t * 0.16) % 1;
      if (dt && piece.rise < before) hauled += 1;
      const spread = 1.2 * (1 - piece.rise) * 0.45;
      piece.mesh.position.set(-0.3 + Math.cos(piece.angle + t * 0.8) * spread, bottom + piece.rise * 2.15, Math.sin(piece.angle + t * 0.8) * spread);
      piece.mesh.rotation.set(t * 2 + piece.angle, t * 1.4, 0);
      piece.mesh.scale.setScalar(Math.min(1, piece.rise * 8, (1 - piece.rise) * 6));
    });

    // Escort shuttles loop around the mothership, passing in front of it and behind it.
    fleet.forEach(shuttle => {
      const angle = t * shuttle.pace + shuttle.phase;
      const orbit = a => ahead.set(Math.cos(a) * shuttle.rx, Math.sin(a * 2) * 0.45 + shuttle.y, Math.sin(a) * shuttle.rz).add(ship.root.position);
      shuttle.group.position.copy(orbit(angle));
      shuttle.group.lookAt(orbit(angle + Math.sign(shuttle.pace) * 0.05));
      shuttle.model.rotation.z = -Math.sign(shuttle.pace) * 0.55;
      shuttle.flame.scale.set(1, 1, 0.8 + Math.random() * 0.4);
    });

    // The universe slides past: streaks speed up while the ship is moving, the far world drifts slowly.
    streaks.update(dt, 7 + thrust * 5, 1 + thrust * 0.5);
    world.position.x = 18 - progress * 8;
    world.rotation.y += dt * 0.02;

    if (t > nextReadout) {
      nextReadout = t + 0.12;
      if (speedLabel) speedLabel.textContent = `${(0.42 + thrust * 0.09 + Math.sin(t * 0.9) * 0.005).toFixed(2)}c`;
      if (scrapLabel) scrapLabel.textContent = pad(hauled);
    }
    renderer.render(scene, camera);
  };

  // Shaders compile in parallel first, so neither the first frame nor the intro over it stalls.
  let stop = () => {};
  let disposed = false;
  const ready = compileScene(renderer, scene, camera).then(() => {
    if (disposed) return;
    frame(0, 0);
    if (reduced) {
      const redraw = new ResizeObserver(() => { resize(); frame(0, 0); });
      redraw.observe(host);
      stop = () => redraw.disconnect();
    } else {
      stop = runWhileVisible(host, frame);
    }
  });

  return {
    ready,
    dispose() {
      disposed = true;
      stop();
      observer.disconnect();
      window.removeEventListener('pointermove', onPointer);
      textures.fade.dispose();
      textures.fadeBase.dispose();
      dispose();
    },
  };
}
