// Effects for Space Scavenger: one-draw-call particles, speed streaks, shockwaves and debris.
// All of them are pooled and fixed in size, so a busy moment never allocates anything.
import * as THREE from 'three';

const OUTPUT_GLSL = '#include <tonemapping_fragment>\n#include <colorspace_fragment>';
const rand = (min, max) => min + Math.random() * (max - min);

/* ───────────── Particles ───────────── */

// Sparks, exhaust and fire, all in one additive point cloud simulated on the CPU.
export function createParticles(max = 1600) {
  const position = new Float32Array(max * 3);
  const tint = new Float32Array(max * 3);
  const size = new Float32Array(max);
  const alpha = new Float32Array(max);
  const velocity = new Float32Array(max * 3);
  const life = new Float32Array(max);
  const span = new Float32Array(max);
  const base = new Float32Array(max);
  const drag = new Float32Array(max);
  let count = 0;

  const geometry = new THREE.BufferGeometry();
  const attribute = (array, width) => new THREE.BufferAttribute(array, width).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', attribute(position, 3));
  geometry.setAttribute('color', attribute(tint, 3));
  geometry.setAttribute('size', attribute(size, 1));
  geometry.setAttribute('alpha', attribute(alpha, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    vertexShader: /* glsl */`
      attribute float size;
      attribute float alpha;
      uniform float uScale;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = color;
        vAlpha = alpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = min(size * uScale / max(0.5, -mv.z), 96.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = smoothstep(1.0, 0.0, d);
        gl_FragColor = vec4(vColor, a * a * vAlpha);
        ${OUTPUT_GLSL}
      }`,
    vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 5;

  const move = (from, to) => {
    for (let k = 0; k < 3; k++) {
      position[to * 3 + k] = position[from * 3 + k];
      velocity[to * 3 + k] = velocity[from * 3 + k];
      tint[to * 3 + k] = tint[from * 3 + k];
    }
    life[to] = life[from]; span[to] = span[from]; base[to] = base[from]; drag[to] = drag[from];
  };

  // `color` is a THREE.Color; `boost` brightens it.
  const emit = (x, y, z, vx, vy, vz, seconds, scale, color, boost = 1.2, damping = 2.5) => {
    if (count >= max) return;
    const i = count++;
    position[i * 3] = x; position[i * 3 + 1] = y; position[i * 3 + 2] = z;
    velocity[i * 3] = vx; velocity[i * 3 + 1] = vy; velocity[i * 3 + 2] = vz;
    tint[i * 3] = color.r * boost; tint[i * 3 + 1] = color.g * boost; tint[i * 3 + 2] = color.b * boost;
    life[i] = span[i] = seconds;
    base[i] = scale;
    drag[i] = damping;
  };

  const direction = new THREE.Vector3();
  return {
    points,
    emit,
    // A spray in every direction around a point.
    burst(at, color, amount, speed, { life: [short, long] = [0.35, 0.9], size: [small, big] = [0.08, 0.22], boost = 1.3, damping = 2.2 } = {}) {
      for (let i = 0; i < amount; i++) {
        direction.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.25, 1));
        emit(at.x, at.y, at.z, direction.x, direction.y, direction.z, rand(short, long), rand(small, big), color, boost, damping);
      }
    },
    update(dt) {
      for (let i = 0; i < count; i++) {
        life[i] -= dt;
        if (life[i] <= 0) { move(--count, i); i--; continue; }
        const keep = Math.exp(-drag[i] * dt);
        velocity[i * 3] *= keep; velocity[i * 3 + 1] *= keep; velocity[i * 3 + 2] *= keep;
        position[i * 3] += velocity[i * 3] * dt;
        position[i * 3 + 1] += velocity[i * 3 + 1] * dt;
        position[i * 3 + 2] += velocity[i * 3 + 2] * dt;
        const t = life[i] / span[i];
        alpha[i] = t < 0.85 ? t / 0.85 : 1;
        size[i] = base[i] * (0.35 + 0.65 * t);
      }
      geometry.setDrawRange(0, count);
      for (const name of ['position', 'color', 'size', 'alpha']) geometry.attributes[name].needsUpdate = true;
    },
    // World units to pixels for the current camera and canvas height.
    setScale(heightPx, fov) { material.uniforms.uScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2))); },
    clear() { count = 0; geometry.setDrawRange(0, 0); },
  };
}

/* ───────────── Speed streaks ───────────── */

// Lines of light that rush past the camera. Their length follows the speed and stretches in a warp.
export function createStreaks(count = 260) {
  const position = new Float32Array(count * 6);
  const tint = new Float32Array(count * 6);
  const seeds = Array.from({ length: count }, () => ({ x: 0, y: 0, z: rand(-125, 8), glow: rand(0.25, 1) }));
  const place = seed => {
    // Keep the lane right around the ship clear so streaks never hide what is coming.
    do { seed.x = rand(-20, 20); seed.y = rand(-11, 13); } while (Math.abs(seed.x) < 3.5 && Math.abs(seed.y - 0.4) < 2.6);
  };
  seeds.forEach(place);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(tint, 3).setUsage(THREE.DynamicDrawUsage));
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  lines.frustumCulled = false;
  lines.renderOrder = 4;
  return {
    lines,
    update(dt, speed, length, color, brightness) {
      for (let i = 0; i < count; i++) {
        const seed = seeds[i];
        seed.z += speed * dt * 1.4;
        if (seed.z > 9) { seed.z -= 134; place(seed); }
        const tail = length * (0.55 + seed.glow * 0.9);
        const o = i * 6;
        position[o] = position[o + 3] = seed.x;
        position[o + 1] = position[o + 4] = seed.y;
        position[o + 2] = seed.z;
        position[o + 5] = seed.z - tail;
        // Streaks fade in from the distance instead of popping into view.
        const level = seed.glow * brightness * Math.min(1, (seed.z + 125) / 40);
        tint[o] = color.r * level; tint[o + 1] = color.g * level; tint[o + 2] = color.b * level;
        tint[o + 3] = tint[o + 4] = tint[o + 5] = 0;
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
    },
  };
}

/* ───────────── Shockwaves and debris ───────────── */

export function createShockwaves(scene, size = 8) {
  const geometry = new THREE.RingGeometry(0.93, 1, 72);
  const waves = Array.from({ length: size }, () => {
    const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.visible = false;
    mesh.renderOrder = 6;
    scene.add(mesh);
    return { mesh, material, life: 0, span: 1, grow: 1 };
  });
  let next = 0;
  return {
    fire(at, color, grow = 4, seconds = 0.6, boost = 1.2) {
      const wave = waves[next];
      next = (next + 1) % size;
      wave.mesh.position.copy(at);
      wave.mesh.scale.setScalar(0.2);
      wave.mesh.visible = true;
      wave.material.color.copy(color).multiplyScalar(boost);
      wave.life = wave.span = seconds;
      wave.grow = grow;
    },
    update(dt, camera) {
      for (const wave of waves) {
        if (!wave.mesh.visible) continue;
        wave.life -= dt;
        if (wave.life <= 0) { wave.mesh.visible = false; continue; }
        const t = 1 - wave.life / wave.span;
        wave.mesh.scale.setScalar(0.2 + (1 - (1 - t) ** 3) * wave.grow);
        wave.material.opacity = (1 - t) ** 1.5 * 0.8;
        wave.mesh.quaternion.copy(camera.quaternion);
      }
    },
    clear() { waves.forEach(wave => { wave.mesh.visible = false; }); },
    dispose() { geometry.dispose(); waves.forEach(wave => wave.material.dispose()); },
  };
}

// Tumbling rock chunks for explosions and smashed hazards.
export function createDebris(scene, material, size = 48) {
  // The rock material reads vertex colours, so the chunks carry a flat grey set of their own.
  const geometries = [new THREE.DodecahedronGeometry(0.2, 0), new THREE.TetrahedronGeometry(0.24, 0), new THREE.IcosahedronGeometry(0.17, 0)].map(geometry =>
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 3).fill(0.6), 3)));
  const chunks = Array.from({ length: size }, (_, i) => {
    const mesh = new THREE.Mesh(geometries[i % geometries.length], material);
    mesh.visible = false;
    scene.add(mesh);
    return { mesh, velocity: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0, span: 1, scale: 1 };
  });
  let next = 0;
  return {
    blast(at, amount, speed, scale = 1) {
      for (let i = 0; i < amount; i++) {
        const chunk = chunks[next];
        next = (next + 1) % size;
        chunk.mesh.position.copy(at);
        chunk.mesh.visible = true;
        chunk.velocity.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize().multiplyScalar(speed * rand(0.4, 1));
        chunk.spin.set(rand(-8, 8), rand(-8, 8), rand(-8, 8));
        chunk.life = chunk.span = rand(0.7, 1.3);
        chunk.scale = scale * rand(0.6, 1.4);
      }
    },
    update(dt, drift) {
      for (const chunk of chunks) {
        if (!chunk.mesh.visible) continue;
        chunk.life -= dt;
        if (chunk.life <= 0) { chunk.mesh.visible = false; continue; }
        chunk.velocity.multiplyScalar(Math.exp(-1.2 * dt));
        chunk.mesh.position.addScaledVector(chunk.velocity, dt);
        chunk.mesh.position.z += drift * dt;
        chunk.mesh.rotation.x += chunk.spin.x * dt;
        chunk.mesh.rotation.y += chunk.spin.y * dt;
        chunk.mesh.scale.setScalar(chunk.scale * Math.min(1, chunk.life / (chunk.span * 0.4)));
      }
    },
    clear() { chunks.forEach(chunk => { chunk.mesh.visible = false; }); },
    dispose() { geometries.forEach(geometry => geometry.dispose()); },
  };
}
