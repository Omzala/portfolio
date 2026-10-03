import * as THREE from 'three';
import { POWERS, SECTORS, SECTOR_BONUS, SECTOR_SECONDS, WARP_SECONDS } from '../lib/arcade.js';
import { compileScene, createStage, prefersReducedMotion, runWhileVisible } from './stage.js';
import { PALETTES, buildShip, createFarField, createKit, createMarkers, createNoiseVolume, createSky } from './scavenger-art.js';
import { createDebris, createParticles, createShockwaves, createStreaks } from './scavenger-fx.js';

const Y_MIN = -1.5;
const Y_MAX = 2.3;
const SPAWN_Z = -95;
// The ship's collision shape: an ellipsoid hugging the hull and most of the wingspan (world units),
// so what you see touching the ship is what counts as a hit.
const HULL = new THREE.Vector3(1.05, 0.4, 0.9);
const MAX_COMBO = 25;
const BASE_FOV = 56;
const MAX_PIXEL_RATIO = 1.5;
const HAZARDS = new Set(['rock', 'meteor', 'mine', 'girder']);

const rand = (min, max) => min + Math.random() * (max - min);
const pick = list => list[(Math.random() * list.length) | 0];
const clamp = THREE.MathUtils.clamp;
const smoothstep = (from, to, x) => { const t = clamp((x - from) / (to - from), 0, 1); return t * t * (3 - 2 * t); };
const approach = (value, target, rate, dt) => value + (target - value) * (1 - Math.exp(-rate * dt));
// Whether a sphere of `radius` at offset (dx, dy, dz) from the ship touches the hull.
const touches = (dx, dy, dz, radius) => (dx / (HULL.x + radius)) ** 2 + (dy / (HULL.y + radius)) ** 2 + (dz / (HULL.z + radius)) ** 2 < 1;
const tones = {
  cyan: new THREE.Color(0x5be7da), orange: new THREE.Color(0xff6a2b), gold: new THREE.Color(0xffc14d), white: new THREE.Color(0xf3f0e8),
  red: new THREE.Color(0xff4455), calm: new THREE.Color(0xdfe8ff), danger: new THREE.Color(0xff5a46), aim: new THREE.Color(0x5be7da),
};
const powerTones = Object.fromEntries(Object.entries(POWERS).map(([type, power]) => [type, new THREE.Color(power.color)]));

// Each sector's palette as ready-to-lerp colours.
const looks = Object.fromEntries(Object.entries(PALETTES).map(([id, p]) => [id, {
  palette: p,
  deep: new THREE.Color(p.deep), a: new THREE.Color(p.a), b: new THREE.Color(p.b),
  fog: new THREE.Color(p.fog), key: new THREE.Color(p.key), rim: new THREE.Color(p.rim), hemi: new THREE.Color(p.hemi), ground: new THREE.Color(p.ground),
  rock: new THREE.Color(p.rock), streak: new THREE.Color(p.streak), scrap: new THREE.Color(p.scrap).multiplyScalar(0.9),
  rimGlow: new THREE.Color(p.rim).multiplyScalar(0.5),
}]));

// A self-contained arcade engine. React owns the UI and talks to it through the returned controls.
// onHud gets the numbers ten times a second; onEvent announces sectors and power-ups; onOver ends a flight.
export function createScavenger(host, { onHud, onOver, onEvent }) {
  const stage = createStage(host, { maxPixelRatio: MAX_PIXEL_RATIO, reflections: true, lights: false });
  if (!stage) return null;
  const { renderer, scene, dispose: disposeStage } = stage;
  // Rendered straight to the screen (no post-processing) with a neutral tone curve: highlights roll off
  // softly, mid-tones stay true and shadows keep their detail.
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.debug.checkShaderErrors = import.meta.env.DEV;
  scene.environmentIntensity = 0.6;
  const reduced = prefersReducedMotion();
  const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 420);
  const cameraBase = new THREE.Vector3(0, 2.2, 7.4);
  camera.position.copy(cameraBase);
  scene.fog = new THREE.Fog(0x10122a, 50, 112);

  // A warm key, a soft sky fill and a cool rim, all recoloured per sector.
  const hemi = new THREE.HemisphereLight(0xc9d2ff, 0x2a2236, 1.3);
  const key = new THREE.DirectionalLight(0xffe0c4, 2.1);
  key.position.set(6, 7, 6);
  const rim = new THREE.DirectionalLight(0x7aa8ff, 0.9);
  rim.position.set(-6, 3, -5);
  scene.add(hemi, key, rim);

  const noise = createNoiseVolume();
  const sky = createSky(renderer, noise);
  scene.add(sky.group);
  const kit = createKit(POWERS, noise, sky.uniforms);
  const craft = buildShip(renderer);
  const { ship, model } = craft;
  craft.shield.scale.set((HULL.x + 0.2) / 0.85, (HULL.y + 0.3) / 0.85, (HULL.z + 0.3) / 0.85);
  scene.add(ship);
  const farField = createFarField(kit);
  scene.add(farField.mesh);
  const markers = createMarkers();
  scene.add(markers.mesh);
  const particles = createParticles();
  scene.add(particles.points);
  const streaks = createStreaks();
  scene.add(streaks.lines);
  const shockwaves = createShockwaves(scene);
  const debris = createDebris(scene, kit.rockMaterial);

  // Score pops and the hit flash are plain DOM on top of the canvas: cheap, crisp and composited.
  const overlay = document.createElement('div');
  overlay.className = 'fx-layer';
  overlay.setAttribute('aria-hidden', 'true');
  const flashLayer = document.createElement('div');
  flashLayer.className = 'fx-flash';
  overlay.append(flashLayer);
  host.append(overlay);
  const projected = new THREE.Vector3();
  let pops = 0;
  const pop = (text, at, tone = 'cyan', big = false) => {
    if (pops > 8) return;
    projected.copy(at).project(camera);
    if (projected.z > 1) return;
    const element = document.createElement('span');
    element.className = `fx-pop ${tone}${big ? ' big' : ''}`;
    element.textContent = text;
    element.style.left = `${clamp(projected.x * 0.5 + 0.5, 0.08, 0.92) * 100}%`;
    element.style.top = `${clamp(-projected.y * 0.5 + 0.5, 0.12, 0.9) * 100}%`;
    overlay.append(element);
    pops += 1;
    element.addEventListener('animationend', () => { element.remove(); pops -= 1; }, { once: true });
  };
  // Scrap comes in streams, so its points are summed into one pop every few tenths of a second.
  const haul = { value: 0, timer: 0, at: new THREE.Vector3(), tone: 'cyan' };
  const collect = (value, at, tone) => {
    if (!haul.value) haul.timer = 0.3;
    haul.value += value;
    haul.at.copy(at);
    haul.tone = tone;
  };
  const flushHaul = dt => {
    if (!haul.value || (haul.timer -= dt) > 0) return;
    pop(`+${haul.value}`, haul.at, haul.tone);
    haul.value = 0;
  };
  const flashHit = strength => {
    flashLayer.animate([{ opacity: reduced ? strength * 0.4 : strength }, { opacity: 0 }], { duration: 650, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
  };

  /* ───────── Objects in flight, pooled by kind ───────── */

  const pools = new Map();
  const live = [];
  const acquire = (kind, variant) => {
    const key = variant ? `${kind}:${variant}` : kind;
    if (!pools.has(key)) pools.set(key, []);
    const group = pools.get(key).pop() ?? (variant ? kit.make[kind](variant) : kit.make[kind]());
    if (!group.parent) scene.add(group);
    group.visible = true;
    group.rotation.set(0, 0, 0);
    group.scale.setScalar(1);
    const object = { kind, key, group, variant, radius: 0.5, spin: new THREE.Vector3(), vx: 0, vy: 0, rush: 1, passed: false, age: 0, length: 0, turn: 0 };
    live.push(object);
    return object;
  };
  const release = object => {
    object.group.visible = false;
    pools.get(object.key).push(object.group);
    const index = live.indexOf(object);
    if (index >= 0) { live[index] = live[live.length - 1]; live.pop(); }
  };
  const clearField = () => {
    while (live.length) release(live[live.length - 1]);
    particles.clear();
    shockwaves.clear();
    debris.clear();
  };

  // The lane narrows on tall screens so nothing can come at the ship from outside the view.
  let laneX = 4.6;
  const across = (margin = 0.5) => rand(-laneX - margin, laneX + margin);
  const upDown = (margin = 0.3) => rand(Y_MIN - margin, Y_MAX + margin);
  const place = (kind, x, y, z = SPAWN_Z, variant) => { const object = acquire(kind, variant); object.group.position.set(x, y, z); return object; };

  const spawnRock = (x = across(), y = upDown(), z = SPAWN_Z) => {
    const object = place('rock', x, y, z);
    const size = rand(0.5, 1.2);
    const mesh = object.group.children[0];
    mesh.geometry = pick(kit.rockGeometries);
    mesh.scale.setScalar(size);
    object.radius = size * 0.85;
    object.spin.set(rand(-1.2, 1.2), rand(-1.2, 1.2), rand(-0.7, 0.7));
    object.vx = rand(-0.5, 0.5);
    object.vy = rand(-0.15, 0.15);
    return object;
  };
  // Meteors come in from high on either side, aimed to cross the lane when they reach the ship.
  const spawnMeteor = () => {
    const side = Math.random() < 0.5 ? -1 : 1;
    const object = place('meteor', side * rand(laneX + 5, laneX + 9), rand(Y_MAX + 3, Y_MAX + 6), rand(-95, -75));
    const size = rand(0.5, 0.95);
    const mesh = object.group.children[0];
    mesh.geometry = pick(kit.rockGeometries);
    mesh.scale.setScalar(size);
    object.radius = size * 0.85;
    object.rush = 1.25;
    object.spin.set(rand(-2.5, 2.5), rand(-2.5, 2.5), rand(-1.5, 1.5));
    const travel = -object.group.position.z / (game.speed * object.rush);
    object.vx = (rand(-laneX, laneX) - object.group.position.x) / travel;
    object.vy = (rand(Y_MIN, Y_MAX) - object.group.position.y) / travel;
    return object;
  };
  const spawnMine = () => {
    const object = place('mine', across(-0.4), upDown(-0.2));
    object.radius = 0.7;
    object.spin.set(0.6, 1.4, 0);
    return object;
  };
  const spawnGirder = () => {
    const object = place('girder', across(-0.8), upDown(-0.4));
    object.length = rand(4, 5.4);
    const { beam, left, right } = object.group.userData.parts;
    beam.scale.x = object.length;
    left.position.x = -object.length / 2;
    right.position.x = object.length / 2;
    object.group.rotation.z = rand(0, Math.PI);
    object.turn = rand(0.45, 0.85) * (Math.random() < 0.5 ? -1 : 1);
    object.radius = object.length / 2;
    return object;
  };
  const spawnScrap = (x, y, z) => { const object = place('scrap', x, y, z); object.radius = 0.45; object.spin.set(0, 2.4, 0.6); return object; };
  const spawnGate = () => {
    const x = rand(-laneX + 1.2, laneX - 1.2);
    const y = rand(Y_MIN + 0.6, Y_MAX - 0.4);
    const object = place('gate', x, y);
    object.radius = 1.35;
    // A short trail of scrap leads the eye into the ring.
    for (let i = 1; i <= 3; i++) spawnScrap(x, y, SPAWN_Z + i * 3.2);
    return object;
  };
  // Scrap arrives in little arcs, so chasing a combo means committing to a line.
  const spawnScrapArc = () => {
    const x = rand(-laneX, laneX);
    const y = rand(Y_MIN, Y_MAX);
    const bendX = rand(-0.5, 0.5);
    const bendY = rand(-0.22, 0.22);
    const length = Math.random() < 0.5 ? 1 : Math.random() < 0.6 ? 4 : 6;
    for (let i = 0; i < length; i++) spawnScrap(clamp(x + bendX * i, -laneX, laneX), clamp(y + bendY * i, Y_MIN, Y_MAX), SPAWN_Z - i * 4);
  };
  const spawnPickup = (kind, variant) => {
    const object = place(kind, rand(-laneX + 0.5, laneX - 0.5), rand(Y_MIN + 0.3, Y_MAX - 0.3), SPAWN_Z, variant);
    object.radius = kind === 'power' ? 0.75 : 0.6;
    object.spin.set(0.5, 1.6, 0.2);
    return object;
  };

  /* ───────── Flight state ───────── */

  const target = new THREE.Vector2(0, 0.4);
  const keys = new Set();
  const pointer = new THREE.Vector2();
  let aiming = false;
  let touchAim = false;
  let state = 'idle';
  let hudTimer = 0;
  let shake = 0;
  let timeScale = 1;
  let warpGlow = 0;
  let skyFade = 1;
  let thrust = 0.7;
  let ambientTimer = 0;
  let overTimer = 0;
  let summary = null;
  let shieldStrength = 0;
  let look = looks.belt;
  const streakColor = new THREE.Color(look.streak);
  const size = new THREE.Vector2(1, 1);

  const fresh = () => ({
    clock: 0, time: 0, speed: 22, distance: 0, bonus: 0,
    combo: 1, bestCombo: 1, shields: 3, invulnerable: 0,
    sector: 0, loop: 0, sectorTime: 0, warp: 0, warped: false,
    power: null, powerTime: 0,
    timers: { rock: 1.6, mine: 2.6, girder: 2.4, gate: 2.6, meteor: 1.6, scrap: 0.4, core: rand(6, 9), shield: rand(16, 22), power: rand(9, 13), helix: 0 },
    helixAngle: 0,
    stats: { scrap: 0, gates: 0, close: 0, smashed: 0, sectors: 0 },
  });
  let game = fresh();

  const score = () => Math.floor(game.distance) + game.bonus;
  const sectorId = () => SECTORS[game.sector].id;
  const scrapValue = () => (sectorId() === 'nebula' ? 2 : 1);
  const emit = () => {
    host.dataset.score = score();
    onHud?.({
      score: score(), combo: game.combo, shields: game.shields, speed: Math.round(game.speed * 37),
      sector: game.sector, loop: game.loop, progress: game.warp ? 1 : clamp(game.sectorTime / SECTOR_SECONDS, 0, 1), warp: game.warp > 0,
      power: game.power, powerLeft: game.power ? game.powerTime / POWERS[game.power].seconds : 0, multiplier: scrapValue(),
    });
  };

  // Colours ease between sectors; the cloud layout and distant body swap while a warp has the sky dimmed.
  const enterSector = (index, instant = false) => {
    look = looks[SECTORS[index].id];
    sky.snap(look.palette);
    if (instant) blendLook(1);
  };
  const blendLook = t => {
    sky.blend(look, t);
    scene.fog.color.lerp(look.fog, t);
    scene.fog.near += (look.palette.fogNear - scene.fog.near) * t;
    scene.fog.far += (look.palette.fogFar - scene.fog.far) * t;
    key.color.lerp(look.key, t);
    rim.color.lerp(look.rim, t);
    hemi.color.lerp(look.hemi, t);
    hemi.groundColor.lerp(look.ground, t);
    kit.rim.value.lerp(look.rimGlow, t);
    kit.rockMaterial.color.lerp(look.rock, t);
    kit.scrapMaterial.emissive.lerp(look.scrap, t);
    streakColor.lerp(look.streak, t);
  };
  enterSector(0, true);

  const beginWarp = () => {
    steady();
    game.warp = 0.0001;
    game.warped = false;
    game.stats.sectors += 1;
    game.bonus += SECTOR_BONUS;
    pop(`Sector clear +${SECTOR_BONUS}`, ship.position, 'gold', true);
    onEvent?.({ type: 'warp' });
  };
  const arrive = () => {
    steady();
    game.warped = true;
    game.sector = (game.sector + 1) % SECTORS.length;
    if (game.sector === 0) game.loop += 1;
    game.sectorTime = 0;
    Object.assign(game.timers, { rock: 1.8, mine: 2.4, girder: 2.2, gate: 2.6, meteor: 1.4 });
    enterSector(game.sector);
    onEvent?.({ type: 'sector', sector: game.sector, loop: game.loop });
  };

  const activate = type => {
    game.power = type;
    game.powerTime = POWERS[type].seconds;
    shockwaves.fire(ship.position, powerTones[type], 2.6, 0.55, 1);
    particles.burst(ship.position, powerTones[type], 30, 7, { boost: 1.3 });
    onEvent?.({ type: 'power', power: type });
  };

  const explodeShip = () => {
    steady(2);
    state = 'over';
    ship.visible = false;
    const at = ship.position;
    particles.burst(at, tones.orange, 80, 13, { life: [0.5, 1.4], size: [0.14, 0.36], boost: 1.6 });
    particles.burst(at, tones.cyan, 36, 9, { boost: 1.3 });
    particles.burst(at, tones.white, 24, 16, { life: [0.2, 0.5], boost: 1.6 });
    debris.blast(at, 24, 9, 1.2);
    shockwaves.fire(at, tones.orange, 7, 0.9, 1.4);
    shockwaves.fire(at, tones.cyan, 4, 0.6, 1.1);
    shake = 0.9;
    timeScale = 0.25;
    flashHit(0.6);
    overTimer = 0.75;
    summary = { score: score(), bestCombo: game.bestCombo, duration: game.clock, sector: game.sector, loop: game.loop, stats: { ...game.stats } };
    emit();
  };

  const damage = object => {
    const at = object.group.position;
    game.shields -= 1;
    game.combo = 1;
    game.invulnerable = 2;
    shake = 0.45;
    particles.burst(at, tones.white, 22, 10, { boost: 1.4 });
    debris.blast(at, 10, 7);
    shockwaves.fire(at, tones.red, 3, 0.5);
    onEvent?.({ type: 'hit', shields: game.shields });
    if (game.shields <= 0) explodeShip();
    else flashHit(0.45);
  };

  // What happens when the ship touches an object. Returns true when the object is used up.
  const touch = object => {
    const at = object.group.position;
    if (object.kind === 'scrap') {
      const value = 10 * game.combo * scrapValue();
      game.bonus += value;
      game.combo = Math.min(game.combo + 1, MAX_COMBO);
      game.bestCombo = Math.max(game.bestCombo, game.combo);
      game.stats.scrap += 1;
      particles.burst(at, scrapValue() > 1 ? tones.gold : tones.cyan, 10, 4.5, { size: [0.06, 0.16] });
      collect(value, at, scrapValue() > 1 ? 'gold' : 'cyan');
      return true;
    }
    if (object.kind === 'core') {
      const value = 50 + 25 * game.loop;
      game.bonus += value;
      particles.burst(at, tones.orange, 24, 7);
      shockwaves.fire(at, tones.orange, 2.6, 0.5);
      pop(`Core +${value}`, at, 'orange', true);
      return true;
    }
    if (object.kind === 'shield') {
      game.shields = Math.min(game.shields + 1, 3);
      particles.burst(at, tones.cyan, 20, 5);
      shockwaves.fire(ship.position, tones.cyan, 2.4, 0.5);
      pop('+1 Shield', at, 'cyan', true);
      return true;
    }
    if (object.kind === 'power') { activate(object.variant); pop(POWERS[object.variant].name, at, object.variant, true); return true; }
    if (!HAZARDS.has(object.kind)) return false;
    if (game.power === 'overdrive') {
      game.bonus += 40;
      game.stats.smashed += 1;
      particles.burst(at, tones.orange, 24, 10, { boost: 1.5 });
      debris.blast(at, 8, 8);
      shockwaves.fire(at, tones.orange, 2.4, 0.4);
      shake = Math.max(shake, 0.2);
      pop('Smash +40', at, 'orange');
      return true;
    }
    if (game.invulnerable > 0 || game.warp > 0) return false;
    damage(object);
    return true;
  };

  // A girder is a spinning segment: the point on it closest to (sx, sy), relative to that point.
  const gap = new THREE.Vector2();
  const beamGap = (object, angle, cx, cy) => {
    const dx = ship.position.x - cx;
    const dy = ship.position.y - cy;
    const along = clamp(dx * Math.cos(angle) + dy * Math.sin(angle), -object.length / 2, object.length / 2);
    return gap.set(cx + Math.cos(angle) * along - ship.position.x, cy + Math.sin(angle) * along - ship.position.y);
  };
  const beamTouches = (object, angle, cx, cy, margin = 0) => { const offset = beamGap(object, angle, cx, cy); return touches(offset.x, offset.y, 0, 0.2 + margin); };

  // Hazards that brush past without touching earn a little.
  const closeCall = object => {
    if (game.invulnerable > 0 || game.warp > 0 || game.power === 'overdrive') return;
    const p = object.group.position;
    const near = object.kind === 'girder'
      ? beamTouches(object, object.group.rotation.z, p.x, p.y, 0.7)
      : touches(p.x - ship.position.x, p.y - ship.position.y, 0, object.radius + 0.7);
    if (!near) return;
    game.bonus += 30;
    game.stats.close += 1;
    pop('Close call +30', ship.position, 'white');
  };
  const threadGate = object => {
    const at = object.group.position;
    if (Math.hypot(at.x - ship.position.x, at.y - ship.position.y) > object.radius - 0.25) return;
    const value = 150 + 50 * game.loop;
    game.bonus += value;
    game.combo = Math.min(game.combo + 2, MAX_COMBO);
    game.bestCombo = Math.max(game.bestCombo, game.combo);
    game.stats.gates += 1;
    shockwaves.fire(at, tones.gold, 2.4, 0.6, 1.2);
    particles.burst(at, tones.gold, 30, 6);
    pop(`Threaded +${value}`, at, 'gold', true);
  };

  const spawnField = wdt => {
    const t = game.timers;
    // Each sector eases in, every loop is busier, and narrow (portrait) lanes get fewer hazards.
    const busy = (1 + game.loop * 0.25) * (0.7 + smoothstep(0, 18, game.sectorTime) * 0.45) * (0.55 + 0.45 * (laneX / 4.6));
    const due = (name, min, max, action, pace = busy) => {
      t[name] -= wdt;
      if (t[name] > 0) return;
      action();
      t[name] = rand(min, max) / pace;
    };
    if (game.warp > 0) {
      // A spiral of scrap rushes through the warp tunnel.
      if (game.warp / WARP_SECONDS < 0.7) due('helix', 0.13, 0.13, () => {
        game.helixAngle += 0.7;
        spawnScrap(Math.cos(game.helixAngle) * Math.min(2.4, laneX * 0.6), 0.4 + Math.sin(game.helixAngle) * 1.5, SPAWN_Z);
      }, 1);
      return;
    }
    const id = sectorId();
    if (id === 'belt') due('rock', 0.5, 0.95, () => { spawnRock(); if (Math.random() < 0.15 + game.loop * 0.08) spawnRock(); });
    if (id === 'nebula') { due('rock', 0.85, 1.4, () => spawnRock()); due('mine', 1.3, 2, spawnMine); }
    if (id === 'wreck') { due('rock', 1, 1.6, () => spawnRock()); due('girder', 1.8, 2.6, spawnGirder); due('gate', 2.4, 3.2, spawnGate, 1); }
    if (id === 'storm') { due('meteor', 0.45, 0.8, spawnMeteor); due('rock', 1.4, 2.2, () => spawnRock()); }
    due('scrap', 0.6, 1.2, spawnScrapArc, 1);
    due('core', ...(id === 'storm' ? [4.5, 7] : [7, 11]), () => spawnPickup('core'), 1);
    due('shield', 16, 24, () => { if (game.shields < 3) spawnPickup('shield'); }, 1);
    due('power', 12, 18, () => spawnPickup('power', pick(Object.keys(POWERS).filter(type => type !== game.power))), 1);
  };

  /* ───────── Size, aim and frame pacing ───────── */

  // The pointer is mapped onto the flight plane through the camera's resting view, so the ship flies to
  // the point under the cursor (just above a finger on touch screens).
  const aimCamera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 420);
  const raycaster = new THREE.Raycaster();
  const lane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const aimPoint = new THREE.Vector3();
  let pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  const applySize = () => {
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(size.x, size.y, false);
    sky.setPixelRatio(pixelRatio);
  };
  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    if (!width || !height) return;
    size.set(width, height);
    applySize();
    camera.aspect = aimCamera.aspect = width / height;
    // Narrow screens pull the camera back, and the lane narrows to what the camera can see.
    cameraBase.z = width / height < 1 ? 10.5 : 7.4;
    laneX = clamp(cameraBase.z * Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)) * camera.aspect * 0.87, 2.6, 4.6);
    camera.updateProjectionMatrix();
    aimCamera.position.copy(cameraBase);
    aimCamera.lookAt(0, 0.2, -12);
    aimCamera.updateProjectionMatrix();
    aimCamera.updateMatrixWorld();
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();

  // A frame that misses its refresh shows as judder, worst on high-refresh screens. When that keeps
  // happening the game renders on every other refresh (72 fps on a 144 Hz screen, evenly spaced), and if
  // frames still run late it lowers the render resolution a step.
  // Busy moments (a launch, a warp, a crash) are ignored, and it takes two slow windows in a row to act.
  const pacer = { shortest: 1, refresh: 1 / 60, frames: 0, late: 0, strikes: 0, settle: 2.5, half: false, skip: false, banked: 0 };
  const steady = (seconds = 1.2) => { pacer.settle = Math.max(pacer.settle, seconds); pacer.frames = pacer.late = 0; pacer.shortest = 1; };
  const pace = dt => {
    pacer.banked += dt;
    if (pacer.settle > 0) pacer.settle -= dt;
    else {
      pacer.shortest = Math.min(pacer.shortest, dt);
      pacer.frames += 1;
      if (dt > pacer.refresh * 1.6) pacer.late += 1;
      if (pacer.frames >= 120) {
        pacer.refresh = Math.max(1 / 360, pacer.shortest);
        pacer.strikes = pacer.late / pacer.frames > 0.08 ? pacer.strikes + 1 : 0;
        if (pacer.strikes >= 2) {
          if (!pacer.half && pacer.refresh < 1 / 100) pacer.half = true;
          else if (pixelRatio > 0.75) { pixelRatio = Math.max(0.75, pixelRatio - 0.25); applySize(); }
          pacer.strikes = 0;
          pacer.settle = 1.5;
        }
        pacer.frames = pacer.late = 0;
        pacer.shortest = 1;
      }
    }
    if (pacer.half && (pacer.skip = !pacer.skip)) return 0;
    const step = Math.min(pacer.banked, 0.05);
    pacer.banked = 0;
    return step;
  };

  const nozzle = new THREE.Vector3();
  const nozzles = [new THREE.Vector3(-0.62, -0.06, 1.25), new THREE.Vector3(0.62, -0.06, 1.25), new THREE.Vector3(0, 0, 1.6)];

  const frame = (rawDt, elapsed) => {
    const dt = pace(rawDt);
    if (!dt) return;
    const playing = state === 'playing';
    const warpProgress = playing && game.warp > 0 ? Math.min(game.warp / WARP_SECONDS, 1) : 0;
    warpGlow = approach(warpGlow, warpProgress ? Math.sin(Math.PI * warpProgress) : 0, 8, dt);
    // The sky dims through each warp so the next sector can swap in unseen.
    skyFade = approach(skyFade, warpProgress ? 0.15 + 0.85 * Math.abs(Math.cos(Math.PI * warpProgress)) : 1, 9, dt);

    // World time slows under Chrono and for a moment after a crash; the ship always steers in real time.
    timeScale = approach(timeScale, game.power === 'chrono' && playing ? 0.5 : 1, state === 'over' ? 1.6 : 5, dt);
    const wdt = dt * timeScale;

    if (playing) {
      game.clock += dt;
      game.time += wdt;
      game.invulnerable = Math.max(0, game.invulnerable - dt);
      if (game.power) { game.powerTime -= dt; if (game.powerTime <= 0) { game.power = null; game.powerTime = 0; } }
      const base = Math.min(22 + game.time * 0.45 + game.loop * 5, 62);
      game.speed = base * (sectorId() === 'storm' ? 1.06 : 1) * (game.power === 'overdrive' ? 1.35 : 1) * (1 + warpGlow * 1.6);
      game.distance += wdt * 10 * (game.speed / 24);
      if (game.warp > 0) {
        game.warp += dt;
        if (!game.warped && game.warp >= WARP_SECONDS * 0.5) arrive();
        if (game.warp >= WARP_SECONDS) game.warp = 0;
      } else {
        game.sectorTime += wdt;
        if (game.sectorTime >= SECTOR_SECONDS) beginWarp();
      }
      spawnField(wdt);
      hudTimer -= dt;
      if (hudTimer <= 0) { hudTimer = 0.1; emit(); }
    } else if (state === 'idle') {
      // A few slow rocks drift by while the pilot gets ready.
      ambientTimer -= dt;
      if (ambientTimer <= 0) { ambientTimer = rand(1, 1.8); spawnRock(across(4), upDown(2)); if (Math.random() < 0.4) spawnScrapArc(); }
    } else if (overTimer > 0) {
      overTimer -= dt;
      if (overTimer <= 0) onOver?.(summary);
    }
    blendLook(1 - Math.exp(-dt * 2.4));

    // Steering: held keys nudge the target; otherwise it is wherever the pointer is.
    if (keys.size) {
      aiming = false;
      const dx = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
      const dy = (keys.has('up') ? 1 : 0) - (keys.has('down') ? 1 : 0);
      target.x = clamp(target.x + dx * dt * 8, -laneX, laneX);
      target.y = clamp(target.y + dy * dt * 6, Y_MIN, Y_MAX);
    } else if (aiming && playing) {
      raycaster.setFromCamera(pointer, aimCamera);
      if (raycaster.ray.intersectPlane(lane, aimPoint)) target.set(clamp(aimPoint.x, -laneX, laneX), clamp(aimPoint.y + (touchAim ? 0.9 : 0), Y_MIN, Y_MAX));
    }
    const idle = state === 'idle';
    const follow = 1 - Math.exp(-dt * 9);
    const prevX = ship.position.x;
    const prevY = ship.position.y;
    ship.position.x += ((idle ? Math.sin(elapsed * 0.6) * 1.2 : target.x) - ship.position.x) * follow;
    ship.position.y += ((idle ? -1.85 + Math.sin(elapsed * 1.6) * 0.18 : target.y) - ship.position.y) * follow;
    const vx = (ship.position.x - prevX) / dt;
    const vy = (ship.position.y - prevY) / dt;
    model.rotation.z = approach(model.rotation.z, clamp(-vx * 0.08, -0.8, 0.8), 8, dt);
    model.rotation.x = approach(model.rotation.x, clamp(vy * 0.045, -0.35, 0.35), 8, dt);
    model.rotation.y = approach(model.rotation.y, clamp(-vx * 0.018, -0.18, 0.18), 8, dt);

    // Engines: the flame shader flickers on its own; thrust and glows ease rather than jitter.
    thrust = approach(thrust, playing ? 0.85 + (game.speed / 62) * 0.5 + (game.power === 'overdrive' ? 0.5 : 0) + warpGlow * 0.8 : 0.7, 6, dt);
    for (const flame of craft.flames) {
      flame.material.uniforms.uTime.value = elapsed;
      flame.material.uniforms.uPower.value = thrust;
      flame.mesh.scale.set(1, thrust, 1);
    }
    for (const glow of craft.glows) glow.sprite.scale.setScalar(glow.size * (0.85 + thrust * 0.2 + Math.sin(elapsed * 9 + glow.phase) * 0.04));
    for (const light of craft.navLights) {
      const on = (elapsed * 1.1 + light.phase) % 1 < 0.1;
      light.glow.material.opacity = on ? 0.8 : 0.06;
      light.lamp.visible = on;
    }
    const fieldSpeed = playing ? game.speed : state === 'over' ? 6 : 10;
    if (ship.visible && Math.floor(elapsed * 60) % 2 === 0) {
      for (const local of nozzles) {
        nozzle.copy(local);
        model.localToWorld(nozzle);
        particles.emit(nozzle.x + rand(-0.03, 0.03), nozzle.y + rand(-0.03, 0.03), nozzle.z, rand(-0.25, 0.25), rand(-0.25, 0.25), fieldSpeed * 0.5 + 4, rand(0.14, 0.24), rand(0.06, 0.11), game.power === 'overdrive' ? tones.gold : tones.orange, 0.9, 1);
      }
    }

    // Shield bubble: shows the hitbox while the ship cannot be hurt, tinted by any active power-up.
    const breathe = 0.5 + 0.5 * Math.sin(elapsed * 6);
    const bubble = !playing ? 0 : game.power === 'overdrive' ? 0.55 : game.invulnerable > 0 ? 0.3 + 0.15 * breathe : warpGlow > 0.05 ? warpGlow * 0.35 : game.power ? 0.18 : 0;
    shieldStrength = approach(shieldStrength, bubble, 8, dt);
    craft.shield.visible = shieldStrength > 0.02;
    craft.shieldMaterial.uniforms.uStrength.value = shieldStrength;
    craft.shieldMaterial.uniforms.uTime.value = elapsed;
    craft.shieldMaterial.uniforms.uColor.value.copy(game.power ? powerTones[game.power] : tones.cyan);

    // Everything in the field moves towards the camera. Hazards in reach get a warning ring.
    const magnet = playing && game.power === 'magnet';
    markers.begin();
    for (let i = live.length - 1; i >= 0; i--) {
      const object = live[i];
      const { group } = object;
      const p = group.position;
      const before = p.z;
      object.age += wdt;
      p.z += fieldSpeed * object.rush * wdt;
      p.x += object.vx * wdt;
      p.y += object.vy * wdt;
      group.rotation.x += object.spin.x * wdt;
      group.rotation.y += object.spin.y * wdt;
      group.rotation.z += (object.kind === 'girder' ? object.turn : object.spin.z) * wdt;
      if (object.kind === 'mine' && playing && p.z < -20) {
        p.x += (ship.position.x - p.x) * Math.min(1, wdt * 0.25);
        p.y += (ship.position.y - p.y) * Math.min(1, wdt * 0.18);
      }
      if (object.kind === 'meteor' && p.z > -90 && Math.random() < 0.7) {
        particles.emit(p.x + rand(-0.15, 0.15), p.y + rand(-0.15, 0.15), p.z, -object.vx * 0.3 + rand(-0.4, 0.4), -object.vy * 0.3 + rand(-0.4, 0.4), -fieldSpeed * 0.2, rand(0.25, 0.45), rand(0.25, 0.5), Math.random() < 0.3 ? tones.gold : tones.orange, 1.1, 1.5);
      }
      if (object.age < 0.5) group.scale.setScalar(Math.min(1, object.age * 2));
      const { halo } = group.userData;
      if (halo) halo.scale.setScalar(group.userData.haloSize * clamp(1 - (p.z - 0.5) / 5, 0, 1));
      if (magnet && object.kind === 'scrap' && p.z > -34) {
        const pull = Math.min(1, wdt * 5);
        p.x += (ship.position.x - p.x) * pull;
        p.y += (ship.position.y - p.y) * pull;
      }
      if (playing) {
        const crossed = before < 0 && p.z >= 0;
        if (object.kind === 'gate') {
          if (crossed) threadGate(object);
        } else {
          const dz = crossed ? 0 : p.z;
          const hit = object.kind === 'girder'
            ? Math.abs(dz) < 0.6 && beamTouches(object, group.rotation.z, p.x, p.y)
            : touches(p.x - ship.position.x, p.y - ship.position.y, dz, object.radius + (HAZARDS.has(object.kind) ? 0 : 0.35));
          if (hit && touch(object)) { release(object); if (state !== 'playing') break; continue; }
          if (HAZARDS.has(object.kind) && !object.passed && p.z > 0.9) { object.passed = true; closeCall(object); }
          // Where this hazard will cross the ship's plane, judged from its current course.
          if (HAZARDS.has(object.kind) && !object.passed && p.z > -48 && p.z < 1) {
            const travel = Math.max(0, -p.z) / Math.max(1, fieldSpeed * object.rush);
            const px = p.x + object.vx * travel;
            const py = p.y + object.vy * travel;
            const reveal = smoothstep(-48, -14, p.z) * (1 - smoothstep(-1.2, 0.9, p.z));
            if (object.kind === 'girder') {
              const angle = group.rotation.z + object.turn * travel;
              const danger = beamTouches(object, angle, px, py, 0.35);
              markers.bar(px, py, object.length + 0.4, 0.62, angle, danger ? tones.danger : tones.calm, reveal * (danger ? 0.85 : 0.16));
            } else {
              const danger = touches(px - ship.position.x, py - ship.position.y, 0, object.radius + 0.3);
              markers.ring(px, py, object.radius, danger ? tones.danger : tones.calm, reveal * (danger ? 0.85 : 0.16));
            }
          }
        }
      }
      if (p.z > 12) release(object);
    }
    if (playing && aiming && !touchAim) markers.ring(target.x, target.y, 0.22, tones.aim, 0.5);
    markers.end();

    flushHaul(dt);
    particles.update(wdt);
    shockwaves.update(wdt, camera);
    debris.update(wdt, fieldSpeed * 0.5);
    kit.update(elapsed);
    farField.update(wdt, fieldSpeed);

    // Speed lines stretch into warp streaks.
    streaks.update(wdt, fieldSpeed, 0.5 + fieldSpeed * 0.03 + warpGlow * 26, streakColor, (playing ? 0.32 : 0.22) + warpGlow * 1.3);

    // Camera: drifts a little with the ship, widens with speed and the warp, and shakes on impact.
    shake = Math.max(0, shake - dt * 1.6);
    const jolt = reduced ? 0 : shake * shake * 0.35;
    const fov = BASE_FOV + Math.min(fieldSpeed, 80) * 0.05 + warpGlow * (reduced ? 4 : 11) + (game.power === 'overdrive' && playing ? 4 : 0) - (game.power === 'chrono' && playing ? 2 : 0);
    camera.fov = approach(camera.fov, fov, 3, dt);
    camera.updateProjectionMatrix();
    camera.position.set(
      cameraBase.x + ship.position.x * 0.16 + Math.sin(elapsed * 37) * jolt,
      cameraBase.y + ship.position.y * 0.12 + Math.cos(elapsed * 43) * jolt,
      cameraBase.z - warpGlow * 0.6,
    );
    camera.lookAt(ship.position.x * 0.22, ship.position.y * 0.16 + 0.2, -12);
    camera.rotateZ(model.rotation.z * 0.06);
    sky.fade = skyFade;
    sky.update(camera, elapsed);
    particles.setScale(size.y * pixelRatio, camera.fov);
    renderer.render(scene, camera);
  };

  // Compiling a shader is not enough on every GPU: Chrome on Windows (ANGLE / Direct3D) finishes the
  // job the first time a material is actually drawn, which stalled the game when a new hazard first
  // appeared. So every kind of object is drawn once, in view, before the first flight.
  const previews = kit.previews();
  const kinds = ['rock', 'meteor', 'scrap', 'core', 'shield', ...Object.keys(POWERS).map(type => `power:${type}`), 'mine', 'girder', 'gate'];
  previews.forEach((group, i) => { group.position.set(-4.5 + i * 0.9, 0.3, -9); scene.add(group); });
  const warmUp = () => {
    const at = new THREE.Vector3(0, 0.3, -8);
    craft.shield.visible = true;
    shockwaves.fire(at, tones.cyan);
    debris.blast(at, 3, 0.1);
    particles.emit(at.x, at.y, at.z, 0, 0, 0, 1, 0.3, tones.white);
    particles.update(0);
    markers.begin();
    markers.ring(0, 0.3, 1, tones.calm, 0.5);
    markers.bar(1, 0.3, 4, 0.6, 0.3, tones.danger, 0.5);
    markers.end();
    streaks.update(0, 10, 1, streakColor, 1);
    farField.update(0, 0);
    sky.update(camera, 0);
    renderer.render(scene, camera);
    craft.shield.visible = false;
    shockwaves.clear();
    debris.clear();
    particles.clear();
    markers.begin();
    markers.end();
    previews.forEach((group, i) => {
      group.visible = false;
      if (!pools.has(kinds[i])) pools.set(kinds[i], []);
      pools.get(kinds[i]).push(group);
    });
  };
  let stop = () => {};
  let disposed = false;
  const ready = compileScene(renderer, scene, camera).then(() => {
    if (disposed) return;
    warmUp();
    stop = runWhileVisible(host, frame);
  });

  return {
    ready,
    start() {
      steady(2);
      haul.value = 0;
      clearField();
      game = fresh();
      target.set(0, 0.4);
      ship.position.set(0, 0.4, 0);
      ship.visible = true;
      timeScale = 1;
      overTimer = 0;
      summary = null;
      state = 'playing';
      enterSector(0);
      onEvent?.({ type: 'sector', sector: 0, loop: 0 });
      emit();
    },
    idle() { clearField(); game = fresh(); ship.visible = true; state = 'idle'; enterSector(0); emit(); },
    // x and y are 0–1 across the stage, as the pointer sees it; kind is the pointer type.
    setPointer(x, y, kind) {
      pointer.set(x * 2 - 1, 1 - y * 2);
      aiming = true;
      touchAim = kind === 'touch';
    },
    setKey(direction, down) { if (down) keys.add(direction); else keys.delete(direction); },
    get state() { return state; },
    // Development-only shortcuts for checking each sector and power-up by eye.
    debug: import.meta.env.DEV ? {
      warp() { if (state === 'playing' && !game.warp) game.sectorTime = SECTOR_SECONDS; },
      power(type) { if (state === 'playing') activate(type); },
      shields(count) { game.shields = count; },
      programs: () => renderer.info.programs.map(program => `${program.name}#${program.id}`),
      pacing: () => ({ half: pacer.half, ratio: pixelRatio, refresh: Math.round(1 / pacer.refresh) }),
      // Sends a rock straight at the ship, to check the warning rings.
      incoming(z = -36) { const rock = spawnRock(ship.position.x, ship.position.y, z); rock.vx = rock.vy = 0; return markers.mesh.count; },
    } : undefined,
    dispose() {
      disposed = true;
      stop();
      resizeObserver.disconnect();
      overlay.remove();
      clearField();
      shockwaves.dispose();
      debris.dispose();
      kit.dispose();
      sky.dispose();
      noise.dispose();
      craft.textures.forEach(texture => texture.dispose());
      disposeStage();
    },
  };
}
