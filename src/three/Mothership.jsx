import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { compileScene, createStage, glowTexture, prefersReducedMotion, runWhileVisible } from './stage.js';
import { introDone } from '../lib/intro.js';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2, ...extra });
const glow = color => new THREE.MeshBasicMaterial({ color, toneMapped: false });
const halo = (inner, size) => {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(inner, inner.replace(/[\d.]+\)$/, '0)')), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sprite.scale.setScalar(size);
  return sprite;
};

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

// A soft vertical fade, used as the tractor beam's alpha map.
function fadeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, 0, 64);
  gradient.addColorStop(0, '#fff');
  gradient.addColorStop(1, '#000');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 4, 64);
  return new THREE.CanvasTexture(canvas);
}

// The Trash Panda: Bandit's mothership. A raccoon-faced bridge, a slowly turning habitat ring, a ringed
// tail boom, swept wings with engine pods and a hangar bay with a tractor beam — all from primitives.
function buildMothership() {
  const hull = mat(0x4a4760, { roughness: 0.42, metalness: 0.35 });
  const hullDark = mat(0x26252f, { roughness: 0.4, metalness: 0.45 });
  const panel = mat(0x625e78, { roughness: 0.5, metalness: 0.3 });
  const fur = mat(0x9b97aa, { roughness: 0.8, metalness: 0 });
  const furDark = mat(0x5a566a, { roughness: 0.85, metalness: 0 });
  const mask = mat(0x17161d, { roughness: 0.5, metalness: 0.1 });
  const white = mat(0xeeebf3, { roughness: 0.75, metalness: 0 });
  const orange = mat(0xff6a2b, { roughness: 0.4, metalness: 0.1, emissive: 0x551600, emissiveIntensity: 0.6 });
  const sphere = new THREE.SphereGeometry(1, 32, 20);

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // Hull with orange bands, a raised top deck and a keel
  const shell = new THREE.Group();
  shell.scale.set(1, FLAT_Y, FLAT_Z);
  body.add(shell);
  add(shell, new THREE.LatheGeometry(HULL.map(([r, a]) => new THREE.Vector2(r, a)), 56), hull, { r: [0, 0, -Math.PI / 2] });
  [[-2.3, 0.08], [-3.0, 0.06], [2.0, 0.06]].forEach(([x, tube]) => add(shell, new THREE.TorusGeometry(radiusAt(x) + 0.02, tube, 10, 64), orange, { p: [x, 0, 0], r: [0, Math.PI / 2, 0] }));
  add(body, new RoundedBoxGeometry(3.6, 0.16, 1.9, 3, 0.07), panel, { p: [-0.8, topAt(-0.8) - 0.02, 0] });
  [-1, 1].forEach(side => add(body, new THREE.BoxGeometry(3.3, 0.05, 0.08), orange, { p: [-0.8, topAt(-0.8) + 0.07, side * 0.82] }));
  add(body, new RoundedBoxGeometry(2.8, 0.2, 1.7, 3, 0.08), hullDark, { p: [-0.3, -topAt(-0.3) + 0.04, 0] });

  // Windows: rows of lit ports along both flanks, a few of them warm
  const ports = [];
  for (let x = -2.5; x <= 2.3; x += 0.3) {
    for (const y of [0.1, -0.2]) {
      for (const side of [-1, 1]) if (Math.random() > 0.12) ports.push([x, y, side]);
    }
  }
  const windows = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.075, 0.04), new THREE.MeshBasicMaterial({ toneMapped: false }), ports.length);
  const cyanPort = new THREE.Color(0x5be7da);
  const warmPort = new THREE.Color(0xffc27a);
  const dimPort = new THREE.Color(0x24303a);
  const place = new THREE.Matrix4();
  ports.forEach(([x, y, side], i) => {
    place.makeRotationX(side * y * 0.8).setPosition(x, y, side * (sideAt(x, y) + 0.012));
    windows.setMatrixAt(i, place);
    windows.setColorAt(i, Math.random() < 0.16 ? warmPort : cyanPort);
  });
  body.add(windows);

  // A habitat ring on four spokes, ringed with lit windows; it turns slowly
  const ring = new THREE.Group();
  ring.position.x = 0.35;
  add(ring, new THREE.TorusGeometry(2.3, 0.13, 14, 96), hullDark, { r: [0, Math.PI / 2, 0] });
  add(ring, new THREE.TorusGeometry(2.3, 0.05, 8, 96), orange, { p: [0.13, 0, 0], r: [0, Math.PI / 2, 0] });
  add(ring, new THREE.TorusGeometry(2.43, 0.025, 6, 96), glow(0x5be7da), { r: [0, Math.PI / 2, 0] });
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + (i * Math.PI) / 2;
    const spoke = new THREE.Group();
    spoke.rotation.x = angle;
    add(spoke, new THREE.CylinderGeometry(0.06, 0.06, 1.1, 10), panel, { p: [0, 1.75, 0] });
    ring.add(spoke);
  }
  body.add(ring);

  // Hangar bay under the keel, and its tractor beam
  add(body, new THREE.BoxGeometry(1.7, 0.05, 0.7), glow(0x5be7da), { p: [-0.3, -topAt(-0.3) - 0.08, 0] });
  const beam = add(body, new THREE.ConeGeometry(1.3, 2.2, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0x5be7da, alphaMap: fadeTexture(), transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }), { p: [-0.3, -topAt(-0.3) - 1.18, 0] });

  // Bridge: a raccoon head with ears, a mask visor, glowing eyes and a snout, looking where the ship flies
  const bridge = new THREE.Group();
  bridge.position.set(1.45, topAt(1.45) + 0.28, 0);
  body.add(bridge);
  add(bridge, sphere, fur, { s: [0.95, 0.66, 0.85] });
  [-1, 1].forEach(side => {
    const ear = new THREE.Group();
    ear.position.set(-0.15, 0.55, side * 0.5);
    ear.rotation.x = side * 0.4;
    add(ear, new THREE.ConeGeometry(0.27, 0.62, 18), furDark);
    add(ear, new THREE.ConeGeometry(0.16, 0.4, 14), mask, { p: [0.1, -0.05, 0] });
    bridge.add(ear);
    add(bridge, sphere, white, { p: [0.62, 0.36, side * 0.34], r: [side * 0.3, 0, 0], s: [0.3, 0.1, 0.14] });
    add(bridge, sphere, glow(0x5be7da), { p: [0.98, 0.12, side * 0.29], s: [0.09, 0.12, 0.12] });
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
  const beacon = halo('rgba(255,194,122,1)', 0.9);
  beacon.position.set(-0.32, 0, 0);
  parent.add(beacon);

  // Swept wings with engine pods and blinking navigation lights
  const wingShape = new THREE.Shape([[-0.5, 0], [-2.7, 0], [-3.2, 1.45], [-2.45, 1.45]].map(([x, y]) => new THREE.Vector2(x, y)));
  const wingGeometry = new THREE.ExtrudeGeometry(wingShape, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
  const navLights = [];
  const flames = [];
  const halos = [];
  const engine = (parentGroup, x, y, z, size) => {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.scale.setScalar(size);
    add(group, new THREE.CylinderGeometry(0.4, 0.5, 0.62, 28), hullDark, { r: [0, 0, Math.PI / 2] });
    add(group, new THREE.TorusGeometry(0.42, 0.06, 10, 32), orange, { p: [-0.3, 0, 0], r: [0, Math.PI / 2, 0] });
    const flame = new THREE.Group();
    flame.position.x = -0.32;
    add(flame, new THREE.ConeGeometry(0.33, 1.5, 24), glow(0xff7a33), { p: [-0.75, 0, 0], r: [0, 0, Math.PI / 2] });
    add(flame, new THREE.ConeGeometry(0.17, 0.85, 18), glow(0xffe0a8), { p: [-0.42, 0, 0], r: [0, 0, Math.PI / 2] });
    group.add(flame);
    flames.push(flame);
    const glowSprite = halo('rgba(255,140,60,1)', 1.9);
    glowSprite.position.x = -0.5;
    group.add(glowSprite);
    halos.push(glowSprite);
    parentGroup.add(group);
  };
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

  // Three main engines
  [[-3.3, 0, 0, 1], [-3.05, -0.2, -0.75, 0.7], [-3.05, -0.2, 0.75, 0.7]].forEach(([x, y, z, size]) => engine(body, x, y, z, size));

  return { root, body, ring, windows, ports: { count: ports.length, cyan: cyanPort, warm: warmPort, dim: dimPort }, beam, tail, beacon, navLights, flames, halos };
}

// Seen from above and in front, nose pointing left at Bandit.
const YAW = Math.PI + 0.72;

export default function Mothership() {
  const host = useRef(null);
  useEffect(() => {
    const element = host.current;
    const stage = createStage(element, { maxPixelRatio: 1.75 });
    if (!stage) { introDone('mothership'); return; }
    const { renderer, scene, dispose } = stage;
    const camera = new THREE.PerspectiveCamera(30, 1.7, 0.1, 60);
    camera.position.set(0, 4.4, 11);
    camera.lookAt(0, -0.15, 0);
    const ship = buildMothership();
    ship.root.rotation.y = YAW;
    scene.add(ship.root);

    const pointer = { x: 0, y: 0 };
    const look = { x: 0, y: 0 };
    let nextTwinkle = 0;
    const onPointer = event => { pointer.x = event.clientX / window.innerWidth - 0.5; pointer.y = event.clientY / window.innerHeight - 0.5; };
    const resize = () => {
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    window.addEventListener('pointermove', onPointer, { passive: true });

    const frame = (dt, t) => {
      look.x += (pointer.x - look.x) * 0.04;
      look.y += (pointer.y - look.y) * 0.04;
      ship.root.position.y = Math.sin(t * 0.8) * 0.14;
      ship.root.rotation.y = YAW + Math.sin(t * 0.23) * 0.05 + look.x * 0.2;
      ship.root.rotation.x = look.y * 0.08;
      ship.body.rotation.x = Math.sin(t * 0.6) * 0.035;
      ship.ring.rotation.x = t * 0.25;
      ship.flames.forEach((flame, i) => flame.scale.set(0.85 + Math.sin(t * 29 + i * 1.7) * 0.1 + Math.random() * 0.08, 1, 1));
      ship.halos.forEach((sprite, i) => sprite.scale.setScalar(1.9 * (0.92 + Math.sin(t * 23 + i * 2.1) * 0.06)));
      ship.tail.forEach((joint, i) => { joint.rotation.y = Math.sin(t * 1.3 - i * 0.6) * 0.09; });
      ship.navLights.forEach((light, i) => { light.visible = (t + i * 0.8) % 1.6 < 0.14; });
      ship.beacon.material.opacity = (t % 2.2) < 0.2 ? 1 : 0.25;
      ship.beam.material.opacity = 0.1 + Math.sin(t * 1.7) * 0.04;
      // Now and then a cabin light switches on or off.
      if (t > nextTwinkle) {
        nextTwinkle = t + 0.25 + Math.random() * 0.4;
        const { count, cyan, warm, dim } = ship.ports;
        const roll = Math.random();
        ship.windows.setColorAt((Math.random() * count) | 0, roll < 0.3 ? dim : roll < 0.45 ? warm : cyan);
        ship.windows.instanceColor.needsUpdate = true;
      }
      renderer.render(scene, camera);
    };

    // Shaders compile in parallel first, so the first frame (and the intro over it) never stalls.
    let stop = () => {};
    let disposed = false;
    compileScene(renderer, scene, camera).then(() => {
      if (disposed) return;
      frame(0, 0);
      introDone('mothership');
      if (prefersReducedMotion()) {
        const redraw = () => { resize(); frame(0, 0); };
        const reducedObserver = new ResizeObserver(redraw);
        reducedObserver.observe(element);
        stop = () => reducedObserver.disconnect();
      } else {
        stop = runWhileVisible(element, frame);
      }
    });
    return () => {
      disposed = true;
      stop();
      observer.disconnect();
      window.removeEventListener('pointermove', onPointer);
      ship.beam.material.alphaMap.dispose();
      dispose();
    };
  }, []);

  return <div className="mothership-view" ref={host} />;
}
