import * as THREE from 'three';
import { compileScene, createStage, glowTexture, runWhileVisible } from './stage.js';

const X_RANGE = 4.6;
const Y_MIN = -1.5;
const Y_MAX = 2.3;
const SPAWN_Z = -95;
const SHIP_RADIUS = 0.62;

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.1, ...extra });
const glow = color => new THREE.MeshBasicMaterial({ color, toneMapped: false });
const rand = (min, max) => min + Math.random() * (max - min);

function buildShip() {
  const ship = new THREE.Group();
  const model = new THREE.Group();
  ship.add(model);
  const hull = mat(0xf3f0e8, { roughness: 0.32, metalness: 0.25 });
  const orange = mat(0xff6a2b, { roughness: 0.4, emissive: 0x4a1200, emissiveIntensity: 0.5 });
  const dark = mat(0x23222e, { roughness: 0.4, metalness: 0.4 });
  const profile = [[0, -1.15], [0.3, -1.05], [0.44, -0.55], [0.46, 0.15], [0.38, 0.72], [0.2, 1.08], [0, 1.22]].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 36), hull);
  body.rotation.x = -Math.PI / 2;
  model.add(body);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.05, 8, 36), orange);
  band.position.z = 0.1;
  model.add(band);
  [0, 1, 2, 3].forEach(i => {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.52, 0.62), orange);
    const angle = (i * Math.PI) / 2 + Math.PI / 4;
    fin.position.set(Math.cos(angle) * 0.52, Math.sin(angle) * 0.52, 0.72);
    fin.rotation.z = angle - Math.PI / 2;
    model.add(fin);
  });
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 0.24, 24), dark);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.z = 1.18;
  model.add(nozzle);

  // Bandit rides in the canopy: ears and a masked face peek out.
  const canopy = new THREE.Group();
  canopy.position.set(0, 0.36, -0.2);
  model.add(canopy);
  canopy.add(new THREE.Mesh(new THREE.SphereGeometry(0.34, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5be7da, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.5, depthWrite: false })));
  const fur = mat(0x9b97aa, { roughness: 0.8 });
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), fur);
  headMesh.position.y = 0.12;
  canopy.add(headMesh);
  [-1, 1].forEach(side => {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 12), mat(0x5a566a));
    ear.position.set(side * 0.13, 0.32, 0);
    ear.rotation.z = -side * 0.4;
    canopy.add(ear);
  });
  const maskBand = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.045, 8, 24), mat(0x17161d));
  maskBand.position.y = 0.14;
  maskBand.scale.set(1, 1, 0.6);
  canopy.add(maskBand);

  const flame = new THREE.Group();
  flame.position.z = 1.3;
  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.26, 1.2, 20), glow(0xff7a33));
  outer.rotation.x = Math.PI / 2;
  outer.position.z = 0.6;
  const inner = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.7, 16), glow(0xffe0a8));
  inner.rotation.x = Math.PI / 2;
  inner.position.z = 0.35;
  flame.add(outer, inner);
  const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture('rgba(255,140,60,1)', 'rgba(255,106,43,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  flare.scale.setScalar(1.6);
  flare.position.z = 0.2;
  flame.add(flare);
  model.add(flame);
  ship.scale.setScalar(0.85);
  return { ship, model, flame };
}

function rockGeometry(seed) {
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const position = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    const n = 0.78 + Math.abs(Math.sin(v.x * 3.1 + seed) * Math.cos(v.y * 2.7 - seed) * 0.34) + Math.sin(v.z * 4 + seed * 2) * 0.06;
    v.multiplyScalar(n);
    position.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// A self-contained arcade engine. React owns the UI and talks to it through the returned controls.
export function createScavenger(host, { onHud, onOver }) {
  const stage = createStage(host, { maxPixelRatio: 1.6, reflections: true });
  if (!stage) return null;
  const { renderer, scene, dispose } = stage;
  scene.fog = new THREE.Fog(0x0b0b14, 40, 100);
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 200);
  const cameraBase = new THREE.Vector3(0, 2.2, 7.4);
  camera.position.copy(cameraBase);

  const { ship, model, flame } = buildShip();
  scene.add(ship);

  // Streaming speed lines
  const lineCount = 700;
  const lines = new Float32Array(lineCount * 3);
  for (let i = 0; i < lineCount; i++) lines.set([rand(-16, 16), rand(-9, 11), rand(-110, 8)], i * 3);
  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(lines, 3));
  const lineMaterial = new THREE.PointsMaterial({ size: 0.16, map: glowTexture(), color: 0xdff9f6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  scene.add(new THREE.Points(lineGeometry, lineMaterial));

  const rockMaterial = mat(0x3d3a4c, { roughness: 0.92, flatShading: true });
  const rockGeometries = [1.3, 2.9, 4.4].map(rockGeometry);
  const nutGeometry = new THREE.TorusGeometry(0.3, 0.11, 6, 6);
  const nutMaterial = mat(0x5be7da, { roughness: 0.25, metalness: 0.6, emissive: 0x5be7da, emissiveIntensity: 0.55 });
  const coreGeometry = new THREE.SphereGeometry(0.34, 20, 16);
  const coreMaterial = glow(0xff6a2b);
  const coreRing = new THREE.TorusGeometry(0.58, 0.04, 8, 40);
  const shieldGeometry = new THREE.OctahedronGeometry(0.42);
  const shieldMaterial = mat(0xf3f0e8, { roughness: 0.2, metalness: 0.3, emissive: 0x5be7da, emissiveIntensity: 0.4 });
  const cyanGlow = new THREE.SpriteMaterial({ map: glowTexture('rgba(91,231,218,1)', 'rgba(91,231,218,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 });
  const orangeGlow = new THREE.SpriteMaterial({ map: glowTexture('rgba(255,106,43,1)', 'rgba(255,106,43,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const sparkGeometry = new THREE.TetrahedronGeometry(0.12);
  const sparkMaterials = { cyan: glow(0x5be7da), orange: glow(0xff6a2b), white: glow(0xf3f0e8) };

  const objects = [];
  const sparks = [];

  const makeObject = kind => {
    const group = new THREE.Group();
    let radius = 0.5;
    if (kind === 'rock') {
      const size = rand(0.7, 1.55);
      const mesh = new THREE.Mesh(rockGeometries[(Math.random() * 3) | 0], rockMaterial);
      mesh.scale.setScalar(size);
      group.add(mesh);
      radius = size * 0.82;
    } else if (kind === 'scrap') {
      group.add(new THREE.Mesh(nutGeometry, nutMaterial));
      const halo = new THREE.Sprite(cyanGlow);
      halo.scale.setScalar(1.5);
      group.add(halo);
      radius = 0.45;
    } else if (kind === 'core') {
      group.add(new THREE.Mesh(coreGeometry, coreMaterial));
      const ring = new THREE.Mesh(coreRing, coreMaterial);
      ring.rotation.x = 1.2;
      group.add(ring);
      const halo = new THREE.Sprite(orangeGlow);
      halo.scale.setScalar(2.2);
      group.add(halo);
      radius = 0.6;
    } else {
      group.add(new THREE.Mesh(shieldGeometry, shieldMaterial));
      const halo = new THREE.Sprite(cyanGlow);
      halo.scale.setScalar(1.8);
      group.add(halo);
      radius = 0.6;
    }
    scene.add(group);
    const object = { kind, group, radius, spin: new THREE.Vector3(rand(-1.5, 1.5), rand(-1.5, 1.5), rand(-1, 1)), drift: rand(-0.6, 0.6) };
    objects.push(object);
    return object;
  };
  const spawn = (kind, x = rand(-X_RANGE - 0.6, X_RANGE + 0.6), y = rand(Y_MIN - 0.3, Y_MAX + 0.3), z = SPAWN_Z) => {
    const object = makeObject(kind);
    object.group.position.set(x, y, z);
    if (kind !== 'rock') object.drift = 0;
    return object;
  };
  const removeObject = object => { scene.remove(object.group); objects.splice(objects.indexOf(object), 1); };
  const burst = (position, tone, amount = 14, force = 7) => {
    for (let i = 0; i < amount; i++) {
      const mesh = new THREE.Mesh(sparkGeometry, sparkMaterials[tone]);
      mesh.position.copy(position);
      scene.add(mesh);
      sparks.push({ mesh, velocity: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(rand(force * 0.4, force)), life: 1, decay: rand(1.3, 2.2) });
    }
  };

  const target = new THREE.Vector2(0, 0.4);
  const keys = new Set();
  let usingKeys = false;
  let state = 'idle';
  let game;
  let hudTimer = 0;
  let shake = 0;
  const reset = () => ({ time: 0, speed: 24, distance: 0, bonus: 0, combo: 1, bestCombo: 1, shields: 3, invulnerable: 0, rockTimer: 1.2, scrapTimer: 0.4, coreTimer: rand(6, 9), shieldTimer: rand(16, 22) });
  game = reset();

  const score = () => Math.floor(game.distance) + game.bonus;
  const emit = () => onHud?.({ score: score(), combo: game.combo, shields: game.shields, speed: Math.round(game.speed * 37) });

  const clearField = () => { [...objects].forEach(removeObject); sparks.splice(0).forEach(({ mesh }) => scene.remove(mesh)); };

  const hit = object => {
    const at = object.group.position.clone();
    if (object.kind === 'rock') {
      if (game.invulnerable > 0) return false;
      game.shields -= 1;
      game.combo = 1;
      game.invulnerable = 1.3;
      shake = 0.5;
      burst(at, 'white', 18, 9);
      if (game.shields <= 0) {
        state = 'over';
        burst(ship.position, 'orange', 40, 11);
        burst(ship.position, 'cyan', 20, 8);
        ship.visible = false;
        emit();
        onOver?.({ score: score(), bestCombo: game.bestCombo, duration: game.time });
      }
    } else if (object.kind === 'scrap') {
      game.bonus += 10 * game.combo;
      game.combo = Math.min(game.combo + 1, 25);
      game.bestCombo = Math.max(game.bestCombo, game.combo);
      burst(at, 'cyan', 10, 5);
    } else if (object.kind === 'core') {
      game.bonus += 50;
      burst(at, 'orange', 18, 7);
    } else {
      game.shields = Math.min(game.shields + 1, 3);
      burst(at, 'cyan', 16, 6);
    }
    emit();
    return true;
  };

  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // Narrow screens pull the camera back so the whole lane stays in view.
    cameraBase.z = width / height < 1 ? 10.5 : 7.4;
    camera.updateProjectionMatrix();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();

  const frame = (dt, elapsed) => {
    const playing = state === 'playing';
    if (playing) {
      game.time += dt;
      game.speed = Math.min(24 + game.time * 0.85, 68);
      game.distance += dt * 10 * (game.speed / 24);
      game.invulnerable = Math.max(0, game.invulnerable - dt);
      game.rockTimer -= dt;
      game.scrapTimer -= dt;
      game.coreTimer -= dt;
      game.shieldTimer -= dt;
      if (game.rockTimer <= 0) {
        spawn('rock');
        if (game.time > 20 && Math.random() < 0.35) spawn('rock');
        game.rockTimer = Math.max(0.2, 0.62 - game.time * 0.007) * rand(0.6, 1.3);
      }
      if (game.scrapTimer <= 0) {
        // Scrap arrives in little arcs so chasing a combo means committing to a line.
        const x = rand(-X_RANGE, X_RANGE);
        const y = rand(Y_MIN, Y_MAX);
        const bend = rand(-0.5, 0.5);
        const length = Math.random() < 0.5 ? 1 : 4;
        for (let i = 0; i < length; i++) spawn('scrap', THREE.MathUtils.clamp(x + bend * i, -X_RANGE, X_RANGE), y, SPAWN_Z - i * 4);
        game.scrapTimer = rand(0.6, 1.2);
      }
      if (game.coreTimer <= 0) { spawn('core'); game.coreTimer = rand(7, 11); }
      if (game.shieldTimer <= 0) { if (game.shields < 3) spawn('shield'); game.shieldTimer = rand(16, 24); }
      hudTimer -= dt;
      if (hudTimer <= 0) { hudTimer = 0.1; emit(); }
    }

    // Steering: pointer sets a target; held keys nudge it.
    if (keys.size) {
      usingKeys = true;
      const dx = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
      const dy = (keys.has('up') ? 1 : 0) - (keys.has('down') ? 1 : 0);
      target.x = THREE.MathUtils.clamp(target.x + dx * dt * 8, -X_RANGE, X_RANGE);
      target.y = THREE.MathUtils.clamp(target.y + dy * dt * 6, Y_MIN, Y_MAX);
    }
    const hover = state === 'idle' ? Math.sin(elapsed * 1.6) * 0.25 : 0;
    const follow = Math.min(1, dt * 7);
    const prevX = ship.position.x;
    const prevY = ship.position.y;
    ship.position.x += ((state === 'idle' ? Math.sin(elapsed * 0.6) * 1.2 : target.x) - ship.position.x) * follow;
    ship.position.y += ((state === 'idle' ? 0.4 : target.y) + hover - ship.position.y) * follow;
    const vx = (ship.position.x - prevX) / Math.max(dt, 0.001);
    const vy = (ship.position.y - prevY) / Math.max(dt, 0.001);
    model.rotation.z += (-vx * 0.09 - model.rotation.z) * 0.15;
    model.rotation.x += (vy * 0.05 - model.rotation.x) * 0.15;
    ship.visible = state !== 'over' && !(game.invulnerable > 0 && Math.floor(elapsed * 14) % 2 === 0);
    const thrust = playing ? 1 + (game.speed - 24) / 60 : 0.75;
    flame.scale.set(1, 1, thrust * (0.85 + Math.random() * 0.3));

    // World motion
    const worldSpeed = playing ? game.speed : state === 'over' ? 6 : 10;
    for (let i = 0; i < lineCount; i++) {
      let z = lines[i * 3 + 2] + worldSpeed * 1.4 * dt;
      if (z > 8) z -= 118;
      lines[i * 3 + 2] = z;
    }
    lineGeometry.attributes.position.needsUpdate = true;
    lineMaterial.size = 0.12 + (worldSpeed / 68) * 0.18;

    for (let i = objects.length - 1; i >= 0; i--) {
      const object = objects[i];
      const { group } = object;
      group.position.z += (playing ? game.speed : 6) * dt;
      group.position.x += object.drift * dt;
      group.rotation.x += object.spin.x * dt;
      group.rotation.y += object.spin.y * dt + (object.kind === 'scrap' ? dt * 2 : 0);
      // Checked live: a crash earlier in this frame ends collection for everything after it.
      if (state === 'playing' && Math.abs(group.position.z - ship.position.z) < object.radius + SHIP_RADIUS && group.position.distanceTo(ship.position) < object.radius + SHIP_RADIUS) {
        if (hit(object)) { removeObject(object); continue; }
      }
      if (group.position.z > 9) removeObject(object);
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const spark = sparks[i];
      spark.life -= dt * spark.decay;
      if (spark.life <= 0) { scene.remove(spark.mesh); sparks.splice(i, 1); continue; }
      spark.mesh.position.addScaledVector(spark.velocity, dt);
      spark.velocity.multiplyScalar(0.96);
      spark.mesh.scale.setScalar(spark.life);
      spark.mesh.rotation.x += dt * 6;
    }

    shake = Math.max(0, shake - dt);
    camera.position.set(
      cameraBase.x + ship.position.x * 0.35 + (Math.random() - 0.5) * shake * 0.6,
      cameraBase.y + ship.position.y * 0.25 + (Math.random() - 0.5) * shake * 0.6,
      cameraBase.z,
    );
    camera.lookAt(ship.position.x * 0.5, ship.position.y * 0.4 + 0.2, -12);
    renderer.render(scene, camera);
  };

  // Compile every material up front, including the ones that only appear mid-flight, so neither the
  // first frame nor the first rock, core or spark stalls the game. The loop starts once they are linked.
  const preview = new THREE.Group();
  preview.visible = false;
  preview.add(
    new THREE.Mesh(rockGeometries[0], rockMaterial), new THREE.Mesh(nutGeometry, nutMaterial),
    new THREE.Mesh(coreGeometry, coreMaterial), new THREE.Mesh(shieldGeometry, shieldMaterial),
    new THREE.Sprite(cyanGlow), new THREE.Sprite(orangeGlow),
    ...Object.values(sparkMaterials).map(material => new THREE.Mesh(sparkGeometry, material)),
  );
  scene.add(preview);
  let stop = () => {};
  let disposed = false;
  const ready = compileScene(renderer, scene, camera).then(() => {
    scene.remove(preview);
    if (disposed) return;
    [cyanGlow, orangeGlow].forEach(material => renderer.initTexture(material.map));
    frame(0, 0);
    stop = runWhileVisible(host, frame);
  });

  return {
    ready,
    start() {
      clearField();
      game = reset();
      target.set(0, 0.4);
      ship.position.set(0, 0.4, 0);
      ship.visible = true;
      state = 'playing';
      emit();
    },
    idle() { clearField(); game = reset(); ship.visible = true; state = 'idle'; emit(); },
    // x and y are 0–1 across the stage, as the pointer sees it.
    setPointer(x, y) {
      if (usingKeys && !keys.size) usingKeys = false;
      target.x = THREE.MathUtils.clamp((x - 0.5) * 2 * (X_RANGE + 0.4), -X_RANGE, X_RANGE);
      target.y = THREE.MathUtils.clamp(Y_MAX - y * (Y_MAX - Y_MIN) * 1.15 + 0.2, Y_MIN, Y_MAX);
    },
    setKey(direction, down) { if (down) keys.add(direction); else keys.delete(direction); },
    get state() { return state; },
    dispose() {
      disposed = true;
      stop();
      resizeObserver.disconnect();
      clearField();
      [nutGeometry, coreGeometry, coreRing, shieldGeometry, sparkGeometry, ...rockGeometries].forEach(geometry => geometry.dispose());
      [rockMaterial, nutMaterial, coreMaterial, shieldMaterial, ...Object.values(sparkMaterials)].forEach(material => material.dispose());
      [cyanGlow, orangeGlow].forEach(material => { material.map.dispose(); material.dispose(); });
      dispose();
    },
  };
}
