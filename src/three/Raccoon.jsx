import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { compileScene, createStage, glowTexture, prefersReducedMotion, runWhileVisible } from './stage.js';
import RaccoonArt from '../components/RaccoonArt.jsx';
import { introDone } from '../lib/intro.js';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...extra });
const glow = color => new THREE.MeshBasicMaterial({ color, toneMapped: false });

function add(parent, geometry, material, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...p);
  mesh.rotation.set(...r);
  mesh.scale.set(...s);
  parent.add(mesh);
  return mesh;
}

// Bandit: an original raccoon astronaut built from primitives — helmet, jetpack, ringed tail and all.
function buildRaccoon() {
  const fur = mat(0x9b97aa, { roughness: 0.8 });
  const furDark = mat(0x5a566a, { roughness: 0.85 });
  const mask = mat(0x17161d, { roughness: 0.55 });
  const white = mat(0xeeebf3, { roughness: 0.75 });
  const gloss = mat(0x08080c, { roughness: 0.12, metalness: 0.2 });
  const suit = mat(0x2a2936, { roughness: 0.5, metalness: 0.15 });
  const suitDark = mat(0x1a1922, { roughness: 0.45, metalness: 0.2 });
  const orange = mat(0xff6a2b, { roughness: 0.4, emissive: 0x551600, emissiveIntensity: 0.4 });
  const cyan = glow(0x5be7da);
  const sphere = new THREE.SphereGeometry(1, 40, 28);

  const root = new THREE.Group();

  // Body
  const body = new THREE.Group();
  body.position.y = -1.45;
  root.add(body);
  add(body, new THREE.CapsuleGeometry(0.82, 0.6, 12, 32), suit, { s: [1.08, 1, 0.88] });
  add(body, new THREE.TorusGeometry(0.86, 0.09, 12, 48), orange, { p: [0, -0.42, 0], r: [Math.PI / 2, 0, 0], s: [1.04, 0.84, 1] });
  [-1, 1].forEach(side => add(body, new RoundedBoxGeometry(0.16, 1.15, 0.1, 3, 0.04), orange, { p: [side * 0.34, 0.12, 0.7], r: [0.12, 0, side * 0.32] }));
  add(body, new RoundedBoxGeometry(0.62, 0.36, 0.14, 3, 0.06), suitDark, { p: [0, 0.02, 0.76] });
  const lights = [0x5be7da, 0xff6a2b].map((color, i) => add(body, new THREE.SphereGeometry(0.07, 16, 12), glow(color), { p: [-0.14 + i * 0.28, 0.02, 0.84] }));

  const arms = [-1, 1].map(side => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.9, 0.42, 0);
    add(pivot, new THREE.CapsuleGeometry(0.2, 0.62, 8, 16), suit, { p: [0, -0.44, 0] });
    add(pivot, new THREE.TorusGeometry(0.2, 0.06, 8, 24), orange, { p: [0, -0.74, 0], r: [Math.PI / 2, 0, 0] });
    add(pivot, sphere, orange, { p: [0, -0.92, 0], s: [0.24, 0.24, 0.24] });
    pivot.rotation.z = side * 0.32;
    body.add(pivot);
    return pivot;
  });
  [-1, 1].forEach(side => {
    add(body, new THREE.CapsuleGeometry(0.22, 0.34, 8, 16), suit, { p: [side * 0.38, -1.02, 0] });
    add(body, new RoundedBoxGeometry(0.46, 0.26, 0.6, 3, 0.1), suitDark, { p: [side * 0.4, -1.32, 0.08] });
  });

  // Jetpack with two flickering flames
  const pack = new THREE.Group();
  pack.position.set(0, 0.1, -0.78);
  body.add(pack);
  add(pack, new RoundedBoxGeometry(1.1, 1.05, 0.42, 4, 0.14), suitDark);
  const flames = [-1, 1].map(side => {
    add(pack, new THREE.CylinderGeometry(0.2, 0.2, 1.05, 24), mat(0x3a3948, { roughness: 0.35, metalness: 0.5 }), { p: [side * 0.36, -0.08, -0.22] });
    add(pack, new THREE.CylinderGeometry(0.2, 0.14, 0.18, 24), orange, { p: [side * 0.36, -0.68, -0.22] });
    const flame = new THREE.Group();
    flame.position.set(side * 0.36, -0.78, -0.22);
    add(flame, new THREE.ConeGeometry(0.15, 0.7, 20), glow(0xff7a33), { p: [0, -0.35, 0], r: [Math.PI, 0, 0] });
    add(flame, new THREE.ConeGeometry(0.08, 0.42, 16), glow(0xffe0a8), { p: [0, -0.22, 0], r: [Math.PI, 0, 0] });
    pack.add(flame);
    return flame;
  });

  // Ringed tail, one segment per ring so it can sway
  const tail = new THREE.Group();
  tail.position.set(0.55, -0.85, -0.55);
  body.add(tail);
  const tailSegments = [];
  let parent = tail;
  for (let i = 0; i < 7; i++) {
    const joint = new THREE.Group();
    if (i) joint.position.y = 0.26;
    const radius = 0.3 - i * 0.022;
    add(joint, sphere, i % 2 ? furDark : fur, { s: [radius, 0.2, radius] });
    joint.rotation.z = -0.28;
    joint.rotation.x = -0.12;
    parent.add(joint);
    tailSegments.push(joint);
    parent = joint;
  }
  add(parent, sphere, mask, { p: [0, 0.2, 0], s: [0.14, 0.16, 0.14] });

  // Head
  const head = new THREE.Group();
  head.position.y = 0.45;
  root.add(head);
  add(head, sphere, fur, { s: [1.2, 1, 1.05] });
  [-1, 1].forEach(side => {
    const ear = new THREE.Group();
    ear.position.set(side * 0.72, 0.8, -0.05);
    ear.rotation.z = -side * 0.42;
    add(ear, new THREE.ConeGeometry(0.36, 0.66, 20), furDark);
    add(ear, new THREE.ConeGeometry(0.22, 0.44, 16), mask, { p: [0, -0.04, 0.16] });
    add(ear, sphere, white, { p: [0, 0.3, 0], s: [0.07, 0.07, 0.07] });
    head.add(ear);
    add(head, new THREE.ConeGeometry(0.26, 0.6, 16), fur, { p: [side * 1.14, -0.32, 0.18], r: [0, 0, side * (Math.PI / 2 + 0.45)] });
    add(head, sphere, white, { p: [side * 0.43, 0.44, 0.86], r: [0, 0, side * -0.22], s: [0.36, 0.13, 0.14] });
    add(head, sphere, mask, { p: [side * 0.43, 0.1, 0.84], r: [0, side * 0.3, side * 0.18], s: [0.5, 0.33, 0.24] });
  });
  add(head, sphere, mask, { p: [0, 0.04, 0.96], s: [0.26, 0.16, 0.12] });
  add(head, sphere, furDark, { p: [0, 0.68, 0.84], r: [0.4, 0, 0], s: [0.12, 0.32, 0.08] });

  const eyes = [-1, 1].map(side => {
    const eye = new THREE.Group();
    eye.position.set(side * 0.43, 0.12, 1.02);
    add(eye, sphere, white, { s: [0.17, 0.17, 0.1] });
    const pupil = new THREE.Group();
    pupil.position.z = 0.07;
    add(pupil, sphere, gloss, { s: [0.1, 0.1, 0.06] });
    add(pupil, sphere, glow(0xffffff), { p: [0.035, 0.035, 0.05], s: [0.032, 0.032, 0.02] });
    eye.add(pupil);
    head.add(eye);
    return { eye, pupil };
  });
  add(head, sphere, white, { p: [0, -0.36, 0.82], s: [0.52, 0.36, 0.42] });
  add(head, sphere, gloss, { p: [0, -0.2, 1.22], s: [0.17, 0.11, 0.1] });
  add(head, new THREE.TorusGeometry(0.11, 0.024, 8, 24, Math.PI), gloss, { p: [0.03, -0.44, 1.2], r: [0, 0, Math.PI + 0.15] });

  // Helmet, collar and antenna
  const glass = new THREE.MeshStandardMaterial({ color: 0xbff7f2, roughness: 0.04, metalness: 0.4, transparent: true, opacity: 0.14, depthWrite: false });
  add(head, sphere, glass, { p: [0, 0.08, 0], s: [1.78, 1.72, 1.72] });
  add(head, new THREE.TorusGeometry(1.62, 0.035, 6, 48, 1.15), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, toneMapped: false }), { p: [0, 0.12, 0.52], r: [-0.32, 0.3, 1.95] });
  add(head, new THREE.TorusGeometry(1.1, 0.16, 16, 56), suitDark, { p: [0, -1.18, 0], r: [Math.PI / 2, 0, 0] });
  add(head, new THREE.TorusGeometry(1.12, 0.05, 8, 56), orange, { p: [0, -1.06, 0], r: [Math.PI / 2, 0, 0] });
  add(head, new THREE.CylinderGeometry(0.03, 0.04, 0.7, 10), mat(0x3a3948), { p: [1.02, 1.62, 0], r: [0, 0, -0.55] });
  const bulb = add(head, new THREE.SphereGeometry(0.13, 20, 16), cyan, { p: [1.22, 1.94, 0] });
  const bulbGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(91,231,218,1)', 'rgba(91,231,218,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  bulbGlow.scale.setScalar(0.9);
  bulbGlow.position.copy(bulb.position);
  head.add(bulbGlow);

  // A little orbit of salvaged scrap
  const orbit = new THREE.Group();
  orbit.rotation.set(1.18, 0, 0.35);
  add(orbit, new THREE.TorusGeometry(2.7, 0.012, 6, 160), new THREE.MeshBasicMaterial({ color: 0xf3f0e8, transparent: true, opacity: 0.25 }));
  const nut = new THREE.CylinderGeometry(0.16, 0.16, 0.09, 6);
  const scrap = [0x5be7da, 0xff6a2b, 0xf3f0e8].map(color => add(orbit, nut, mat(color, { roughness: 0.3, metalness: 0.6, emissive: color, emissiveIntensity: 0.25 })));
  root.add(orbit);

  return { root, body, head, arms, eyes, flames, tailSegments, bulb, bulbGlow, orbit, scrap, lights };
}

const easeOut = t => 1 - Math.pow(1 - t, 3);

export default function Raccoon({ pokes = 0, onPoke }) {
  const host = useRef(null);
  const pokeRef = useRef(onPoke);
  const trickRef = useRef(() => {});
  const [failed, setFailed] = useState(false);
  pokeRef.current = onPoke;
  useEffect(() => { if (pokes) trickRef.current(); }, [pokes]);

  useEffect(() => {
    const element = host.current;
    const stage = createStage(element, { maxPixelRatio: 1.75, reflections: true });
    if (!stage) { setFailed(true); introDone('raccoon'); return; }
    const { renderer, scene, dispose } = stage;
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
    camera.position.set(0, 0.1, 13);
    const bandit = buildRaccoon();
    scene.add(bandit.root);
    bandit.root.rotation.y = -0.3;

    const pointer = { x: 0, y: 0 };
    const look = { x: 0, y: 0 };
    let trick = 1;
    let nextBlink = 1.8;
    let nextWave = 1.4;
    const onPointer = event => {
      const rect = element.getBoundingClientRect();
      pointer.x = THREE.MathUtils.clamp((event.clientX - rect.left - rect.width / 2) / (rect.width / 1.2), -1, 1);
      pointer.y = THREE.MathUtils.clamp((event.clientY - rect.top - rect.height / 2) / (rect.height / 1.2), -1, 1);
    };
    trickRef.current = () => { if (trick >= 1) trick = 0; };
    const onClick = () => pokeRef.current?.();
    const resize = () => {
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.position.z = width / height < 0.85 ? 15.5 : 13;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    window.addEventListener('pointermove', onPointer, { passive: true });
    renderer.domElement.addEventListener('click', onClick);

    const frame = (dt, t) => {
      look.x += (pointer.x - look.x) * 0.07;
      look.y += (pointer.y - look.y) * 0.07;
      const float = Math.sin(t * 1.4) * 0.16;
      let lift = 0;
      let boost = 0;
      if (trick < 1) {
        trick = Math.min(trick + dt / 1.25, 1);
        lift = Math.sin(Math.PI * trick) * 1.3;
        boost = Math.sin(Math.PI * trick);
        bandit.root.rotation.z = easeOut(trick) * Math.PI * 2;
      } else {
        bandit.root.rotation.z += (-look.x * 0.12 - bandit.root.rotation.z) * 0.08;
      }
      bandit.root.position.y = float + lift;
      bandit.root.rotation.y += (-0.3 + look.x * 0.45 - bandit.root.rotation.y) * 0.08;
      bandit.root.rotation.x = look.y * 0.12;
      bandit.head.rotation.y = look.x * 0.35;
      bandit.head.rotation.x = look.y * 0.25;
      bandit.eyes.forEach(({ pupil }) => { pupil.position.x = look.x * 0.05; pupil.position.y = -look.y * 0.04; });

      if (t > nextBlink) nextBlink = t + 2.4 + Math.random() * 2.6;
      const blink = nextBlink - t < 0.13 ? 0.1 : 1;
      bandit.eyes.forEach(({ eye }) => { eye.scale.y += (blink - eye.scale.y) * 0.55; });

      if (t > nextWave + 1.9) nextWave = t + 4.5 + Math.random() * 3;
      const waving = t > nextWave && t < nextWave + 1.9;
      const [left, right] = bandit.arms;
      right.rotation.z += ((waving ? 2.55 + Math.sin(t * 13) * 0.32 : 0.32 + Math.sin(t * 1.4) * 0.06) - right.rotation.z) * 0.14;
      left.rotation.z = -0.32 - Math.sin(t * 1.4) * 0.06 - boost * 0.6;

      bandit.flames.forEach((flame, i) => {
        const flicker = 0.85 + Math.sin(t * 38 + i * 2) * 0.12 + Math.random() * 0.08;
        flame.scale.set(1 + boost * 0.4, flicker * (1 + boost * 1.8), 1 + boost * 0.4);
      });
      bandit.tailSegments.forEach((segment, i) => { segment.rotation.z = -0.28 + Math.sin(t * 2.2 - i * 0.55) * 0.12; });
      const pulse = 1 + Math.sin(t * 4) * 0.15;
      bandit.bulb.scale.setScalar(pulse);
      bandit.bulbGlow.scale.setScalar(0.9 * pulse);
      bandit.lights[0].material.color.setHSL(0.48, 0.75, 0.55 + Math.sin(t * 3) * 0.12);

      bandit.orbit.rotation.z += dt * 0.3;
      bandit.scrap.forEach((piece, i) => {
        const angle = t * (0.55 + i * 0.18) + (i * Math.PI * 2) / 3;
        piece.position.set(Math.cos(angle) * 2.7, Math.sin(angle) * 2.7, 0);
        piece.rotation.x += dt * 1.4; piece.rotation.y += dt * 1.1;
      });
      renderer.render(scene, camera);
    };

    // Shaders compile in parallel first, so the first frame (and the intro over it) never stalls.
    let stop = () => {};
    let disposed = false;
    compileScene(renderer, scene, camera).then(() => {
      if (disposed) return;
      frame(0, 0);
      introDone('raccoon');
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
      renderer.domElement.removeEventListener('click', onClick);
      trickRef.current = () => {};
      dispose();
    };
  }, []);

  return <div className={failed ? 'raccoon is-fallback' : 'raccoon'} ref={host} aria-hidden="true">
    {failed && <button type="button" className="raccoon-fallback" tabIndex={-1} onClick={() => onPoke?.()}><RaccoonArt /></button>}
  </div>;
}
