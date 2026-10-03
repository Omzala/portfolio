// Models, materials and the sky for Space Scavenger. Everything here is built once per engine and
// shared: the engine pools the groups these factories return, so nothing is created mid-flight.
// Surface detail comes from textures and a small 3D noise volume rather than post-processing, which
// keeps the picture crisp and the frame cost low on integrated graphics.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { glowTexture } from './stage.js';

/* ───────────── Noise ───────────── */

const fract = x => x - Math.floor(x);
const hash3 = (x, y, z) => fract(Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453);
const smooth = t => t * t * (3 - 2 * t);
const lerp = (a, b, t) => a + (b - a) * t;
function noise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = smooth(x - ix), fy = smooth(y - iy), fz = smooth(z - iz);
  const c = (dx, dy, dz) => hash3(ix + dx, iy + dy, iz + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), fx), lerp(c(0, 1, 0), c(1, 1, 0), fx), fy),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), fx), lerp(c(0, 1, 1), c(1, 1, 1), fx), fy), fz);
}
function fbm3(x, y, z, octaves = 4) {
  let value = 0, amplitude = 0.5;
  for (let i = 0; i < octaves; i++) { value += amplitude * noise3(x, y, z); x *= 2.03; y *= 2.03; z *= 2.03; amplitude *= 0.5; }
  return value / (1 - 0.5 ** octaves);
}
function seeded(seed) {
  let a = seed * 2654435761 >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// A tileable volume of value noise with four octaves in its four channels (6, 12, 24 and 48 cells per
// repeat). Shaders read a whole fbm from one texture fetch instead of computing noise per pixel.
export function createNoiseVolume(size = 48) {
  const random = seeded(11);
  const data = new Uint8Array(size ** 3 * 4);
  const layer = (cells, channel) => {
    const lattice = Float32Array.from({ length: cells ** 3 }, random);
    const at = (x, y, z) => lattice[((z % cells) * cells + (y % cells)) * cells + (x % cells)];
    const step = cells / size;
    for (let z = 0; z < size; z++) {
      const iz = Math.floor(z * step), tz = smooth(z * step - iz);
      for (let y = 0; y < size; y++) {
        const iy = Math.floor(y * step), ty = smooth(y * step - iy);
        for (let x = 0; x < size; x++) {
          const ix = Math.floor(x * step), tx = smooth(x * step - ix);
          const value = lerp(
            lerp(lerp(at(ix, iy, iz), at(ix + 1, iy, iz), tx), lerp(at(ix, iy + 1, iz), at(ix + 1, iy + 1, iz), tx), ty),
            lerp(lerp(at(ix, iy, iz + 1), at(ix + 1, iy, iz + 1), tx), lerp(at(ix, iy + 1, iz + 1), at(ix + 1, iy + 1, iz + 1), tx), ty), tz);
          data[((z * size + y) * size + x) * 4 + channel] = value * 255;
        }
      }
    }
  };
  [6, 12, 24, 48].forEach(layer);
  const texture = new THREE.Data3DTexture(data, size, size, size);
  texture.format = THREE.RGBAFormat;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.wrapS = texture.wrapT = texture.wrapR = THREE.RepeatWrapping;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

const NOISE_GLSL = /* glsl */`
  float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
`;
// Custom shaders end with these so they are tone mapped and colour managed like everything else.
const OUTPUT_GLSL = '#include <tonemapping_fragment>\n#include <colorspace_fragment>';
const OCTAVES = 'vec4(0.5, 0.27, 0.15, 0.08)';

/* ───────────── Sector looks ───────────── */

// Colours are sRGB hex; three converts them to linear for lighting. Space stays a deep blue rather than
// black, and the nebulae are kept soft so the asteroids and pickups always read clearly against them.
export const PALETTES = {
  belt: {
    deep: 0x0b0d1e, a: 0x4d3fa6, b: 0xd9824e, fog: 0x10122a, fogNear: 50, fogFar: 112,
    key: 0xffe0c4, rim: 0x7aa8ff, hemi: 0xc9d2ff, ground: 0x2a2236, rock: 0x9b8f86, streak: 0xcfe9ff, scrap: 0x2bd6c8, offset: [0.0, 0.0],
    body: { kind: 'giant', a: 0xd9a26e, b: 0x8a5233, c: 0xf2dfc0, atmo: 0xffa46a, ring: 0xcdb08c, position: [88, 38, -150], radius: 22, bands: 13, tilt: 0.42 },
  },
  nebula: {
    deep: 0x120b20, a: 0xb84a9c, b: 0x4aa6d6, fog: 0x1b1030, fogNear: 34, fogFar: 100,
    key: 0xffd8f0, rim: 0xb48cff, hemi: 0xe0c8ff, ground: 0x2c1f38, rock: 0x978aa0, streak: 0xf0d8ff, scrap: 0xffbf3d, offset: [0.37, 0.21],
    body: null,
  },
  wreck: {
    deep: 0x08121c, a: 0x2b6f88, b: 0x9ad6e8, fog: 0x0c1a26, fogNear: 46, fogFar: 110,
    key: 0xe2f4ff, rim: 0x6fe0d8, hemi: 0xc4e6f5, ground: 0x1c2630, rock: 0x8c99a3, streak: 0xd8f6ff, scrap: 0x2bd6c8, offset: [-0.31, 0.27],
    body: { kind: 'ice', a: 0xa9dcf2, b: 0x3e6f92, c: 0xf0fbff, atmo: 0x86e0f0, ring: 0xbfe2f0, position: [-86, 34, -150], radius: 19, bands: 6, tilt: -0.3 },
  },
  storm: {
    deep: 0x160b0a, a: 0xa8432a, b: 0xd99a4a, fog: 0x21110d, fogNear: 42, fogFar: 108,
    key: 0xffc49a, rim: 0xff9a66, hemi: 0xf2cdb8, ground: 0x2e1d18, rock: 0x7f7068, streak: 0xffe4cc, scrap: 0x2bd6c8, offset: [0.24, -0.33],
    body: { kind: 'sun', a: 0xff6a2a, b: 0xffc87a, c: 0xfff0d0, atmo: 0xff8a4a, ring: null, position: [62, 30, -150], radius: 17, bands: 0, tilt: 0 },
  },
};

/* ───────────── Sky: baked nebula, stars and a distant body ───────────── */

const BAKE_FRAGMENT = /* glsl */`
  uniform float uSeed;
  varying vec2 vUv;
  ${NOISE_GLSL}
  float fbm(vec3 p) { float v = 0.0; float a = 0.5; for (int i = 0; i < 7; i++) { v += a * noise(p); p = p * 2.02 + 0.31; a *= 0.5; } return v; }
  void main() {
    vec3 p = vec3((vUv - 0.5) * 3.2, uSeed);
    float warp = fbm(p * 0.9);
    float warp2 = fbm(p * 1.7 + vec3(warp * 1.6, 2.1, 0.0));
    float clouds = fbm(p * 1.25 + vec3(warp2 * 1.8, warp * 1.2, 0.0));
    float ridges = 1.0 - abs(fbm(p * 3.4 + vec3(clouds * 2.2, warp2, 0.0)) * 2.0 - 1.0);
    float dust = fbm(p * 2.1 + vec3(4.1, 1.7, 2.3) + clouds * 1.3);
    float clusters = fbm(p * 0.8 + 9.0);
    float edge = smoothstep(0.5, 0.34, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)));
    gl_FragColor = vec4(
      smoothstep(0.32, 0.92, clouds) * edge,
      pow(ridges, 7.0) * smoothstep(0.35, 0.8, clouds) * edge,
      smoothstep(0.5, 0.82, dust),
      pow(smoothstep(0.45, 0.85, clusters), 2.0) * edge);
  }
`;

// The sky's colour in any direction. The dome draws it, and the fog uses it too, so distant objects
// fade into the actual nebula behind them rather than into one flat colour.
const SKY_UNIFORMS_GLSL = /* glsl */`
  uniform sampler2D uNebula;
  uniform vec3 uDeep;
  uniform vec3 uA;
  uniform vec3 uB;
  uniform vec2 uOffset;
  uniform float uTime;
  uniform float uFade;
`;
const SKY_COLOR_GLSL = /* glsl */`
  vec3 skyColor(vec3 d) {
    vec2 g = d.xy / max(-d.z, 0.08);
    float angle = uTime * 0.004;
    g = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * g;
    vec4 n = texture2D(uNebula, clamp(g / 3.0 + 0.5 + uOffset * 0.35, 0.0, 1.0));
    vec3 color = uDeep * (0.9 + 0.35 * (1.0 - abs(d.y)));
    color += (uA * pow(n.r, 1.5) * 0.3 + uB * n.g * 0.26 + mix(uA, uB, 0.5) * n.a * 0.07) * uFade;
    return color * (1.0 - n.b * 0.45);
  }
`;
const SKY_FRAGMENT = /* glsl */`
  ${SKY_UNIFORMS_GLSL}
  varying vec3 vDir;
  ${SKY_COLOR_GLSL}
  void main() {
    gl_FragColor = vec4(skyColor(normalize(vDir)), 1.0);
    ${OUTPUT_GLSL}
  }
`;

// Several shader patches can stack on one material; the cache key keeps each combination separate.
function addPatch(material, key, patch) {
  const patches = (material.userData.patches ??= []);
  patches.push({ key, patch });
  material.onBeforeCompile = shader => patches.forEach(entry => entry.patch(shader));
  material.customProgramCacheKey = () => patches.map(entry => entry.key).join('+');
  return material;
}

// Swaps three's flat fog for the sky itself: a fogged pixel takes the colour of the nebula behind it.
export function skyFog(material, skyUniforms) {
  return addPatch(material, 'skyfog', shader => {
    Object.assign(shader.uniforms, skyUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <fog_pars_vertex>', '#include <fog_pars_vertex>\nvarying vec3 vSkyDir;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvSkyDir = mvPosition.xyz * mat3(viewMatrix);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <fog_pars_fragment>', `#include <fog_pars_fragment>\nvarying vec3 vSkyDir;\n${SKY_UNIFORMS_GLSL}\n${SKY_COLOR_GLSL}`)
      .replace('#include <fog_fragment>', /* glsl */`
        #ifdef USE_FOG
          vec3 behind = skyColor(normalize(vSkyDir));
          #if defined( TONE_MAPPING )
            behind = toneMapping(behind);
          #endif
          behind = linearToOutputTexel(vec4(behind, 1.0)).rgb;
          gl_FragColor.rgb = mix(gl_FragColor.rgb, behind, smoothstep(fogNear, fogFar, vFogDepth));
        #endif`);
  });
}

const PLANET_FRAGMENT = /* glsl */`
  uniform sampler3D uNoise;
  uniform vec3 uA;
  uniform vec3 uB;
  uniform vec3 uC;
  uniform vec3 uAtmo;
  uniform vec3 uLight;
  uniform float uBands;
  uniform float uSun;
  uniform float uTime;
  uniform float uFade;
  varying vec3 vNormal;
  varying vec3 vLocal;
  varying vec3 vView;
  void main() {
    vec3 n = normalize(vNormal);
    vec3 p = normalize(vLocal);
    float facing = max(dot(n, normalize(vView)), 0.0);
    float rim = pow(1.0 - facing, 3.0);
    vec4 broad = texture(uNoise, p * 0.45 + vec3(0.0, 0.0, uTime * 0.003));
    vec4 fine = texture(uNoise, p * 1.4 + vec3(uTime * 0.002, 0.0, 0.0));
    float turbulence = dot(broad, ${OCTAVES});
    float band = sin(p.y * uBands + turbulence * 5.0 + fine.g * 1.5) * 0.5 + 0.5;
    vec3 surface = mix(uA, uB, band);
    surface = mix(surface, uC, smoothstep(0.56, 0.78, dot(fine, ${OCTAVES})) * 0.55);
    surface *= 0.86 + fine.a * 0.28;
    float light = smoothstep(-0.15, 0.65, dot(n, normalize(uLight)));
    vec3 lit = surface * (0.06 + light * 1.0) + uAtmo * rim * (0.12 + light * 0.8);
    // A star instead: no night side, a granulated surface that darkens towards the limb.
    float granules = dot(texture(uNoise, p * 2.6 + vec3(uTime * 0.01)), ${OCTAVES});
    vec3 star = mix(uA, uB, granules) * (0.7 + granules * 0.6) * (0.55 + 0.45 * pow(facing, 0.6)) + uAtmo * rim * 1.1;
    gl_FragColor = vec4(mix(lit, star, uSun), uFade);
    ${OUTPUT_GLSL}
  }
`;

const RING_FRAGMENT = /* glsl */`
  uniform sampler3D uNoise;
  uniform vec3 uColor;
  uniform float uFade;
  varying vec3 vLocal;
  void main() {
    float r = length(vLocal.xy);
    float t = (r - 1.35) / 0.95;
    float bands = dot(texture(uNoise, vec3(t * 1.7, 0.31, 0.62)), vec4(0.2, 0.3, 0.3, 0.2));
    float gaps = smoothstep(0.2, 0.32, abs(fract(t * 3.0 + 0.15) - 0.5));
    float alpha = smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.85, t) * (0.25 + bands * 0.75) * (0.5 + gaps * 0.5) * 0.75;
    gl_FragColor = vec4(uColor * (0.55 + bands * 0.6), alpha * uFade);
    ${OUTPUT_GLSL}
  }
`;

const STAR_VERTEX = /* glsl */`
  attribute float size;
  attribute float phase;
  uniform float uTime;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    vColor = color;
    vTwinkle = 0.88 + 0.12 * sin(uTime * (0.8 + phase) + phase * 12.0);
    gl_PointSize = size * uPixelRatio;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const STAR_FRAGMENT = /* glsl */`
  uniform float uFade;
  varying vec3 vColor;
  varying float vTwinkle;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float core = smoothstep(1.0, 0.0, d);
    gl_FragColor = vec4(vColor * vTwinkle * (0.55 + 0.45 * uFade), core * core);
    ${OUTPUT_GLSL}
  }
`;

const worldVertex = /* glsl */`
  varying vec3 vNormal; varying vec3 vView; varying vec3 vLocal;
  void main() {
    vLocal = position;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vView = cameraPosition - world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }`;

const color = hex => new THREE.Color(hex);

export function createSky(renderer, noise) {
  // The nebula is rendered once into a texture; each sector recolours and shifts it.
  const detail = window.matchMedia('(pointer: coarse)').matches ? 1024 : 2048;
  const nebula = new THREE.WebGLRenderTarget(detail, detail, { depthBuffer: false });
  const bakeScene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { uSeed: { value: 3.7 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: BAKE_FRAGMENT,
  }));
  bakeScene.add(quad);
  const previous = renderer.getRenderTarget();
  renderer.setRenderTarget(nebula);
  renderer.render(bakeScene, new THREE.Camera());
  renderer.setRenderTarget(previous);
  quad.geometry.dispose();
  quad.material.dispose();

  const group = new THREE.Group();
  const fade = { value: 1 };
  const skyUniforms = {
    uNebula: { value: nebula.texture }, uDeep: { value: color(0) }, uA: { value: color(0) }, uB: { value: color(0) },
    uOffset: { value: new THREE.Vector2() }, uTime: { value: 0 }, uFade: fade,
  };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(190, 48, 24), new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    vertexShader: 'varying vec3 vDir; void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: SKY_FRAGMENT,
    side: THREE.BackSide, depthWrite: false, fog: false,
  }));
  dome.renderOrder = -3;
  group.add(dome);

  // Stars sit inside the dome, mostly ahead of the ship where the camera looks.
  const starCount = 1800;
  const starPositions = new Float32Array(starCount * 3);
  const starColors = new Float32Array(starCount * 3);
  const starSizes = new Float32Array(starCount);
  const starPhases = new Float32Array(starCount);
  const tints = [color(0xffffff), color(0xcfe0ff), color(0xffe6cc), color(0xd8fff8)];
  const direction = new THREE.Vector3();
  for (let i = 0; i < starCount; i++) {
    do direction.set(Math.random() * 2 - 1, Math.random() * 2 - 1, -Math.random() * 1.2 - 0.05).normalize(); while (direction.z > -0.15);
    direction.multiplyScalar(170).toArray(starPositions, i * 3);
    const bright = Math.random() ** 7;
    const tint = tints[(Math.random() * tints.length) | 0];
    const level = 0.22 + bright * 1.3;
    starColors.set([tint.r * level, tint.g * level, tint.b * level], i * 3);
    starSizes[i] = 1.1 + bright * 2.6;
    starPhases[i] = Math.random();
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
  starGeometry.setAttribute('size', new THREE.BufferAttribute(starSizes, 1));
  starGeometry.setAttribute('phase', new THREE.BufferAttribute(starPhases, 1));
  const starUniforms = { uTime: { value: 0 }, uPixelRatio: { value: renderer.getPixelRatio() }, uFade: fade };
  const stars = new THREE.Points(starGeometry, new THREE.ShaderMaterial({
    uniforms: starUniforms, vertexShader: STAR_VERTEX, fragmentShader: STAR_FRAGMENT,
    vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }));
  stars.renderOrder = -2;
  stars.frustumCulled = false;
  group.add(stars);

  // One distant body per sector: a ringed giant, an ice world or a star. It fades out for each warp.
  const planetUniforms = {
    uNoise: { value: noise }, uA: { value: color(0) }, uB: { value: color(0) }, uC: { value: color(0) }, uAtmo: { value: color(0) },
    uLight: { value: new THREE.Vector3(-0.6, 0.35, 0.7) }, uBands: { value: 10 }, uSun: { value: 0 }, uTime: { value: 0 }, uFade: fade,
  };
  const body = new THREE.Group();
  const planet = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), new THREE.ShaderMaterial({
    uniforms: planetUniforms, vertexShader: worldVertex, fragmentShader: PLANET_FRAGMENT,
    transparent: true, depthWrite: false, fog: false,
  }));
  planet.renderOrder = -1;
  const ringUniforms = { uNoise: { value: noise }, uColor: { value: color(0) }, uFade: fade };
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.35, 2.3, 160, 1), new THREE.ShaderMaterial({
    uniforms: ringUniforms,
    vertexShader: 'varying vec3 vLocal; void main() { vLocal = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: RING_FRAGMENT,
    side: THREE.DoubleSide, transparent: true, depthWrite: false, fog: false,
  }));
  ring.rotation.x = -1.25;
  ring.renderOrder = -1;
  const haloMaterial = new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const halo = new THREE.Sprite(haloMaterial);
  halo.renderOrder = -2;
  body.add(halo, planet, ring);
  group.add(body);

  let bodyAnchor = new THREE.Vector3();
  let haloOpacity = 0;

  return {
    group,
    uniforms: skyUniforms,
    // Eases the sky towards a sector's colours (THREE.Color values). t = 1 snaps.
    blend(look, t) {
      skyUniforms.uDeep.value.lerp(look.deep, t);
      skyUniforms.uA.value.lerp(look.a, t);
      skyUniforms.uB.value.lerp(look.b, t);
    },
    // Swaps what cannot blend (cloud layout, the distant body) while a warp has the sky faded down.
    snap(palette) {
      skyUniforms.uOffset.value.fromArray(palette.offset);
      const config = palette.body;
      body.visible = Boolean(config);
      if (!config) return;
      bodyAnchor = new THREE.Vector3(...config.position);
      planet.scale.setScalar(config.radius);
      ring.scale.setScalar(config.radius);
      ring.visible = Boolean(config.ring);
      ring.rotation.y = config.tilt;
      planetUniforms.uA.value.set(config.a);
      planetUniforms.uB.value.set(config.b);
      planetUniforms.uC.value.set(config.c);
      planetUniforms.uAtmo.value.set(config.atmo);
      planetUniforms.uBands.value = config.bands;
      planetUniforms.uSun.value = config.kind === 'sun' ? 1 : 0;
      if (config.ring) ringUniforms.uColor.value.set(config.ring);
      haloMaterial.color.set(config.atmo);
      haloOpacity = config.kind === 'sun' ? 0.42 : 0.2;
      halo.scale.setScalar(config.radius * (config.kind === 'sun' ? 4.2 : 3));
    },
    // 0–1: how much of the nebula and distant body show. Warps dip it to hide the sector swap.
    set fade(value) { fade.value = value; haloMaterial.opacity = haloOpacity * value; },
    // The sky is infinitely far away: it follows the camera, so only turning the camera moves it.
    update(camera, time) {
      group.position.copy(camera.position);
      body.position.copy(bodyAnchor);
      skyUniforms.uTime.value = time;
      starUniforms.uTime.value = time;
      planetUniforms.uTime.value = time;
      planet.rotation.y = time * 0.01;
    },
    setPixelRatio(ratio) { starUniforms.uPixelRatio.value = ratio; },
    dispose() { nebula.dispose(); haloMaterial.map.dispose(); },
  };
}

/* ───────────── The ship ───────────── */

// Painted hull panels: seams, rivets, vents, an orange band and the registration. The second canvas is
// the matching height map, so the seams catch the light.
function hullTextures(maxAnisotropy) {
  const width = 1024, height = 512;
  const random = seeded(5);
  const canvases = [0, 1].map(() => Object.assign(document.createElement('canvas'), { width, height }));
  const [paint, relief] = canvases.map(canvas => canvas.getContext('2d'));
  paint.fillStyle = '#d6d1c7';
  paint.fillRect(0, 0, width, height);
  relief.fillStyle = '#808080';
  relief.fillRect(0, 0, width, height);
  const dot = (context, x, y, radius, fill) => { context.fillStyle = fill; context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill(); };
  for (let y = 0; y < height;) {
    const rowHeight = 40 + Math.floor(random() * 4) * 16;
    for (let x = 0; x < width;) {
      const panelWidth = 64 + Math.floor(random() * 6) * 24;
      const shade = 198 + random() * 24;
      paint.fillStyle = `rgb(${shade + 4}, ${shade}, ${shade - 7})`;
      paint.fillRect(x, y, panelWidth, rowHeight);
      paint.strokeStyle = 'rgba(50, 46, 56, 0.6)';
      paint.lineWidth = 2;
      paint.strokeRect(x + 1, y + 1, panelWidth - 2, rowHeight - 2);
      relief.strokeStyle = '#2e2e2e';
      relief.lineWidth = 3;
      relief.strokeRect(x + 1, y + 1, panelWidth - 2, rowHeight - 2);
      if (random() < 0.5) {
        for (let rx = x + 9; rx < x + panelWidth - 6; rx += 12) { dot(paint, rx, y + 7, 1.5, 'rgba(70, 66, 76, 0.65)'); dot(relief, rx, y + 7, 1.8, '#b4b4b4'); }
      }
      if (random() < 0.14 && panelWidth > 90 && rowHeight > 50) {
        const vx = x + 14, vy = y + 12, vw = panelWidth - 28, vh = Math.min(22, rowHeight - 24);
        paint.fillStyle = 'rgba(40, 38, 48, 0.85)';
        paint.fillRect(vx, vy, vw, vh);
        relief.fillStyle = '#3a3a3a';
        relief.fillRect(vx, vy, vw, vh);
        for (let sx = vx + 4; sx < vx + vw - 2; sx += 7) { paint.fillStyle = 'rgba(120, 116, 128, 0.7)'; paint.fillRect(sx, vy + 3, 3, vh - 6); relief.fillStyle = '#9a9a9a'; relief.fillRect(sx, vy + 3, 3, vh - 6); }
      }
      x += panelWidth;
    }
    y += rowHeight;
  }
  paint.fillStyle = 'rgba(255, 106, 43, 0.95)';
  paint.fillRect(0, height * 0.6, width, 26);
  paint.fillStyle = 'rgba(34, 32, 42, 0.9)';
  paint.fillRect(0, height * 0.6 + 31, width, 4);
  paint.font = 'bold 30px "Geist Mono", ui-monospace, monospace';
  paint.fillStyle = 'rgba(38, 36, 46, 0.82)';
  paint.fillText('OZ-01', 150, height * 0.52);
  paint.fillText('OZ-01', 662, height * 0.52);
  for (let i = 0; i < 3000; i++) {
    paint.fillStyle = `rgba(64, 58, 62, ${random() * 0.07})`;
    paint.fillRect(random() * width, random() * height, 2 + random() * 7, 1 + random() * 3);
  }
  return canvases.map((canvas, i) => {
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(8, maxAnisotropy);
    if (i === 0) texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  });
}

const FLAME_FRAGMENT = /* glsl */`
  uniform float uTime;
  uniform float uPower;
  uniform vec3 uCore;
  uniform vec3 uEdge;
  varying vec2 vUv;
  ${NOISE_GLSL}
  void main() {
    float along = 1.0 - vUv.y;
    float flicker = noise(vec3(vUv.x * 9.0, vUv.y * 5.0 - uTime * 14.0, uTime * 1.5));
    float alpha = pow(along, 2.2) * (0.28 + 0.24 * flicker);
    vec3 heat = mix(uEdge, uCore, pow(along, 3.0)) * (0.65 + uPower * 0.55);
    gl_FragColor = vec4(heat, alpha);
    ${OUTPUT_GLSL}
  }
`;

const SHIELD_FRAGMENT = /* glsl */`
  uniform vec3 uColor;
  uniform float uStrength;
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vLocal;
  void main() {
    float facing = abs(dot(normalize(vNormal), normalize(vView)));
    float fresnel = pow(1.0 - facing, 3.0);
    float cells = abs(sin(vLocal.x * 14.0) * sin(vLocal.y * 14.0 + uTime * 1.5) * sin(vLocal.z * 14.0));
    float alpha = (fresnel * 0.75 + smoothstep(0.8, 1.0, cells) * 0.18 * fresnel) * uStrength;
    gl_FragColor = vec4(uColor * (0.6 + fresnel * 1.1), alpha);
    ${OUTPUT_GLSL}
  }
`;

const hdr = (hex, boost) => new THREE.Color(hex).multiplyScalar(boost);
const basic = (hex, boost = 1) => new THREE.MeshBasicMaterial({ color: hdr(hex, boost) });
const additiveSprite = (texture, opacity = 0.5) => new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity, fog: false });

function extrude(points, depth, bevel = 0.02) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 8 });
}

// Bakes every static mesh under `root` into one mesh per material, so the whole ship costs a handful of
// draw calls. Meshes in `keep` (flames, lamps) stay separate because they animate.
function mergeStatic(root, keep) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const buckets = new Map();
  const merged = [];
  root.traverse(object => {
    if (!object.isMesh || keep.has(object)) return;
    const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld));
    for (const name of Object.keys(geometry.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geometry.deleteAttribute(name);
    if (!geometry.attributes.uv) geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
    if (!buckets.has(object.material)) buckets.set(object.material, []);
    buckets.get(object.material).push(geometry);
    merged.push(object);
  });
  merged.forEach(object => { object.removeFromParent(); object.geometry.dispose(); });
  for (const [material, geometries] of buckets) {
    root.add(new THREE.Mesh(mergeGeometries(geometries), material));
    geometries.forEach(geometry => geometry.dispose());
  }
}

// A twin-nacelle scout with Bandit in the canopy. Forward is -z; the camera sits behind it.
export function buildShip(renderer) {
  const ship = new THREE.Group();
  const model = new THREE.Group();
  ship.add(model);
  const [panelMap, panelRelief] = hullTextures(renderer.capabilities.getMaxAnisotropy());
  const hull = new THREE.MeshStandardMaterial({ map: panelMap, bumpMap: panelRelief, bumpScale: 2.5, roughness: 0.44, metalness: 0.28, envMapIntensity: 0.9 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xff6a2b, roughness: 0.38, metalness: 0.22 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x45444f, roughness: 0.3, metalness: 0.92, side: THREE.DoubleSide });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1b23, roughness: 0.55, metalness: 0.45, side: THREE.DoubleSide });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x9ff8ef, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.32, clearcoat: 1, depthWrite: false, envMapIntensity: 1.4 });
  const engineCore = basic(0xff8a3d, 1.15);
  const keep = new Set();
  const add = (mesh, x = 0, y = 0, z = 0, parent = model) => { mesh.position.set(x, y, z); parent.add(mesh); return mesh; };

  // Fuselage: a flattened body of revolution wearing the panel paint.
  const profile = [[0, -1.3], [0.16, -1.29], [0.3, -1.18], [0.38, -0.95], [0.43, -0.55], [0.45, -0.1], [0.42, 0.35], [0.34, 0.78], [0.22, 1.08], [0.1, 1.3], [0.025, 1.42], [0, 1.44]];
  const fuselage = add(new THREE.Mesh(new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 48), hull));
  fuselage.rotation.x = -Math.PI / 2;
  fuselage.scale.z = 0.78;
  const band = add(new THREE.Mesh(new THREE.TorusGeometry(0.445, 0.02, 8, 48), metal), 0, 0, 0.12);
  band.scale.y = 0.78;
  add(new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.62, 4, 12).rotateX(Math.PI / 2), accent), 0, 0.31, 0.38);
  [-1, 1].forEach(side => add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.95), metal), side * 0.43, 0.02, -0.15));
  add(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.52), metal), 0, -0.32, 0.12);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.04, 0.36), dark), 0, -0.375, 0.12);
  [-1, 1].forEach(side => {
    const antenna = add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.34, 6), metal), side * 0.1, 0.42, 0.78);
    antenna.rotation.x = 0.55;
  });

  // Swept wings with a slight dihedral, a metal leading edge, tip pods, lamps and two pylons each.
  const navLights = [];
  const lampGlow = glowTexture();
  [-1, 1].forEach(side => {
    const wing = new THREE.Group();
    wing.rotation.z = side * 0.07;
    model.add(wing);
    const plate = add(new THREE.Mesh(extrude([[0.25, 0.2], [1.55, -0.62], [1.62, -0.9], [0.3, -0.98]].map(([x, y]) => [x * side, y]), 0.055), hull), 0, -0.1, 0, wing);
    plate.rotation.x = -Math.PI / 2;
    const edge = add(new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.035, 0.045), metal), side * 0.9, -0.07, 0.21, wing);
    edge.rotation.y = -side * Math.atan2(0.82, 1.3);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.52, 14).rotateX(Math.PI / 2), accent), side * 1.62, -0.07, 0.74, wing);
    add(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 14).rotateX(-Math.PI / 2), metal), side * 1.62, -0.07, 0.42, wing);
    const lamp = add(new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), basic(side < 0 ? 0xff3355 : 0x45ff9a, 1.6)), side * 1.62, -0.07, 0.38, wing);
    keep.add(lamp);
    const glow = new THREE.Sprite(additiveSprite(lampGlow, 0.7));
    glow.material.color.set(side < 0 ? 0xff3355 : 0x45ff9a);
    glow.scale.setScalar(0.42);
    glow.position.copy(lamp.position);
    wing.add(glow);
    navLights.push({ lamp, glow, phase: side < 0 ? 0 : 0.5 });
    [0.88, 1.18].forEach((reach, i) => {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.09, 0.26), metal), side * reach, -0.17, 0.32 + i * 0.12, wing);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.5, 12).rotateX(Math.PI / 2), i ? hull : metal), side * reach, -0.24, 0.36 + i * 0.12, wing);
      add(new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.12, 12).rotateX(-Math.PI / 2), accent), side * reach, -0.24, 0.05 + i * 0.12, wing);
    });
  });

  // Twin nacelles plus the main engine; each has a ribbed nozzle, a hot core, a flame and a glow.
  const flames = [];
  const glows = [];
  const glowOrange = glowTexture('rgba(255,150,70,1)', 'rgba(255,106,43,0)');
  const addEngine = (x, y, z, radius, length) => {
    const nozzle = add(new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.15, radius * 0.95, 0.24, 32, 1, true), metal), x, y, z);
    nozzle.rotation.x = Math.PI / 2;
    [0.04, -0.04].forEach(offset => add(new THREE.Mesh(new THREE.TorusGeometry(radius * 1.02, 0.012, 6, 32), dark), x, y, z + offset));
    add(new THREE.Mesh(new THREE.CircleGeometry(radius * 0.92, 32), engineCore), x, y, z - 0.05);
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPower: { value: 0.5 }, uCore: { value: color(0xffd9a8) }, uEdge: { value: color(0xff5a1f) } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: FLAME_FRAGMENT,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    // Anchored at the nozzle, so stretching it only lengthens the tail.
    const flame = add(new THREE.Mesh(new THREE.ConeGeometry(radius * 0.9, length, 24, 1, true).translate(0, length / 2, 0), material), x, y, z);
    flame.rotation.x = Math.PI / 2;
    keep.add(flame);
    const glow = new THREE.Sprite(additiveSprite(glowOrange, 0.28));
    glow.scale.setScalar(radius * 4.5);
    glow.position.set(x, y, z + 0.12);
    model.add(glow);
    flames.push({ mesh: flame, material });
    glows.push({ sprite: glow, size: radius * 4.5, phase: x * 3 });
  };
  [-1, 1].forEach(side => {
    const nacelle = add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 1.05, 32), hull), side * 0.62, -0.06, 0.4);
    nacelle.rotation.x = Math.PI / 2;
    add(new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 10, 32), metal), side * 0.62, -0.06, -0.12);
    const intake = add(new THREE.Mesh(new THREE.CircleGeometry(0.14, 24), dark), side * 0.62, -0.06, -0.1);
    intake.rotation.y = Math.PI;
    add(new THREE.Mesh(new THREE.TorusGeometry(0.188, 0.02, 8, 32), accent), side * 0.62, -0.06, 0.3);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.3), dark), side * 0.62, 0.13, 0.5);
    addEngine(side * 0.62, -0.06, 0.98, 0.17, 0.7);
  });
  addEngine(0, 0, 1.3, 0.22, 0.95);

  // Canted twin tail fins with dark caps.
  [-1, 1].forEach(side => {
    const holder = new THREE.Group();
    holder.position.set(side * 0.16, 0.2, 0.5);
    holder.rotation.z = -side * 0.38;
    model.add(holder);
    const fin = add(new THREE.Mesh(extrude([[0, 0], [0.55, 0], [0.66, 0.5], [0.42, 0.52]], 0.035, 0.012), accent), 0, 0, 0, holder);
    fin.rotation.y = -Math.PI / 2;
    add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.26), dark), 0, 0.51, 0.54, holder);
  });

  // Bandit rides in the canopy: masked face, ears and a glass bubble with a metal frame.
  const canopy = new THREE.Group();
  canopy.position.set(0, 0.24, -0.4);
  model.add(canopy);
  const fur = new THREE.MeshStandardMaterial({ color: 0x9b97aa, roughness: 0.85 });
  const furDark = new THREE.MeshStandardMaterial({ color: 0x5a566a, roughness: 0.8 });
  const maskMaterial = new THREE.MeshStandardMaterial({ color: 0x17161d, roughness: 0.6 });
  add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 16), fur), 0, 0.13, 0, canopy);
  [-1, 1].forEach(side => {
    const ear = add(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.14, 12), furDark), side * 0.095, 0.28, 0.02, canopy);
    ear.rotation.z = -side * 0.35;
  });
  const mask = add(new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.038, 8, 24), maskMaterial), 0, 0.15, 0, canopy);
  mask.scale.set(1, 1, 0.65);
  const dome = add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), glass), 0, 0, 0, canopy);
  dome.scale.set(1, 0.95, 1.75);
  add(new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.022, 8, 48).rotateX(Math.PI / 2).scale(1, 1, 1.75), metal), 0, 0, 0, canopy);
  add(new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.013, 6, 24, Math.PI).rotateY(Math.PI / 2).scale(1, 0.95, 1.75), metal), 0, 0, 0, canopy);

  mergeStatic(model, keep);

  // A shield bubble the size of the hitbox, shown while the ship cannot be hurt.
  const shieldMaterial = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color(0x5be7da) }, uStrength: { value: 0 }, uTime: { value: 0 } },
    vertexShader: worldVertex, fragmentShader: SHIELD_FRAGMENT,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const shield = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), shieldMaterial);
  shield.visible = false;
  ship.add(shield);

  ship.scale.setScalar(0.85);
  return { ship, model, flames, glows, navLights, shield, shieldMaterial, textures: [lampGlow, glowOrange, panelMap, panelRelief] };
}

/* ───────────── Rocks ───────────── */

// A cratered asteroid. `heat` marks crater floors, which glow on burning meteors.
function rockGeometry(seed, detail = 10) {
  const random = seeded(seed);
  let geometry = new THREE.IcosahedronGeometry(1, detail);
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  geometry = mergeVertices(geometry);
  const craters = Array.from({ length: detail > 4 ? 11 : 5 }, () => ({
    center: new THREE.Vector3(random() * 2 - 1, random() * 2 - 1, random() * 2 - 1).normalize(),
    radius: 0.14 + random() * 0.34,
    depth: 0.07 + random() * 0.11,
  }));
  const stretch = new THREE.Vector3(0.85 + random() * 0.35, 0.75 + random() * 0.3, 0.9 + random() * 0.3);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const heat = new Float32Array(position.count);
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i).normalize();
    const shape = 0.74 + fbm3(v.x * 1.5 + seed, v.y * 1.5, v.z * 1.5, 3) * 0.52;
    const ridge = Math.abs(noise3(v.x * 11 + seed, v.y * 11, v.z * 11) - 0.5) * 0.07;
    const grain = (fbm3(v.x * 7 + seed, v.y * 7, v.z * 7, 3) - 0.5) * 0.16 - ridge;
    let crater = 0;
    let floor = 0;
    for (const c of craters) {
      const x = v.distanceTo(c.center) / c.radius;
      if (x < 1.25) {
        crater += x < 1 ? (x * x - 1) * c.depth : 0;
        crater += Math.exp(-((x - 1) ** 2) / 0.012) * c.depth * 0.4;
        floor = Math.max(floor, 1 - x);
      }
    }
    const radius = shape + grain + crater;
    position.setXYZ(i, v.x * radius * stretch.x, v.y * radius * stretch.y, v.z * radius * stretch.z);
    const patch = fbm3(v.x * 3 + 9, v.y * 3, v.z * 3 + seed, 3);
    const tone = Math.max(0.24, 0.5 + patch * 0.45 - floor * 0.32 + grain * 1.5);
    colors.set([tone * (0.97 + patch * 0.08), tone, tone * (0.97 - patch * 0.06)], i * 3);
    heat[i] = Math.min(1, floor * 2.2 + Math.max(0, -grain) * 4);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('heat', new THREE.BufferAttribute(heat, 1));
  geometry.computeVertexNormals();
  return geometry;
}

// Gives a standard material rock-surface detail from the noise volume: mottled colour, a fine bumpy
// relief that lights properly, and a soft rim so silhouettes stand out against the sky. With `heat`
// the crater floors glow, for burning meteors.
function rockSurface(material, noise, rim, { heat = false } = {}) {
  return addPatch(material, heat ? 'rock-heat' : 'rock', shader => {
    shader.uniforms.uNoise = { value: noise };
    shader.uniforms.uRim = rim;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vRockPos;${heat ? '\nattribute float heat;\nvarying float vHeat;' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvRockPos = position;${heat ? '\nvHeat = heat;' : ''}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */`#include <common>
        uniform highp sampler3D uNoise;
        uniform vec3 uRim;
        varying vec3 vRockPos;
        ${heat ? 'varying float vHeat;' : ''}
        // The relief comes from smooth value noise computed here rather than from the noise texture:
        // its slope is continuous, so close rocks light evenly instead of showing texel facets.
        // The fine grain only appears where a rock is big enough on screen to show it without
        // aliasing (footprint is the surface size of one pixel).
        float rockHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float rockNoise(vec3 x) {
          vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(rockHash(i), rockHash(i + vec3(1, 0, 0)), f.x), mix(rockHash(i + vec3(0, 1, 0)), rockHash(i + vec3(1, 1, 0)), f.x), f.y),
                     mix(mix(rockHash(i + vec3(0, 0, 1)), rockHash(i + vec3(1, 0, 1)), f.x), mix(rockHash(i + vec3(0, 1, 1)), rockHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
        }
        float rockHeight(vec3 p, float footprint) {
          float h = rockNoise(p * 2.6) * 0.5 + rockNoise(p * 5.3 + 1.7) * 0.25;
          return h + rockNoise(p * 11.0 + 3.1) * 0.14 * smoothstep(0.03, 0.008, footprint);
        }
        // Bump mapping from a procedural height (Mikkelsen's surface gradient), independent of distance.
        vec3 rockRelief(vec3 surfacePosition, vec3 surfaceNormal, float height, float faceDirection) {
          vec3 sigmaX = dFdx(surfacePosition);
          vec3 sigmaY = dFdy(surfacePosition);
          vec3 r1 = cross(sigmaY, surfaceNormal);
          vec3 r2 = cross(surfaceNormal, sigmaX);
          float determinant = dot(sigmaX, r1) * faceDirection;
          vec3 gradient = sign(determinant) * (dFdx(height) * r1 + dFdy(height) * r2);
          return normalize(abs(determinant) * surfaceNormal - gradient);
        }`)
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
        vec4 rockTone = texture(uNoise, vRockPos * 0.6 + 2.3);
        diffuseColor.rgb *= 0.62 + dot(rockTone.rgb, vec3(0.42, 0.3, 0.18)) * 0.95;`)
      .replace('#include <normal_fragment_maps>', /* glsl */`#include <normal_fragment_maps>
        normal = rockRelief(-vViewPosition, normal, rockHeight(vRockPos, length(fwidth(vRockPos))) * 0.3, faceDirection);`)
      .replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
        ${heat ? 'totalEmissiveRadiance *= vHeat * vHeat * (0.5 + 0.9 * rockTone.g);' : ''}
        totalEmissiveRadiance += uRim * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.5) * 0.3;`);
  });
}

const CORE_FRAGMENT = /* glsl */`
  uniform sampler3D uNoise;
  uniform float uTime;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vLocal;
  void main() {
    float fresnel = pow(1.0 - max(dot(normalize(vNormal), normalize(vView)), 0.0), 2.0);
    float plasma = dot(texture(uNoise, vLocal * 1.6 + vec3(0.0, 0.0, uTime * 0.35)), ${OCTAVES});
    vec3 hot = mix(vec3(1.0, 0.3, 0.06), vec3(1.0, 0.8, 0.45), smoothstep(0.3, 0.7, plasma));
    gl_FragColor = vec4(hot * (0.85 + fresnel * 1.2 + plasma * 0.5), 1.0);
    ${OUTPUT_GLSL}
  }
`;

const GATE_FRAGMENT = /* glsl */`
  uniform vec3 uColor;
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    float r = length(vUv - 0.5) * 2.0;
    float sweep = 0.5 + 0.5 * sin(r * 16.0 - uTime * 4.0);
    float alpha = smoothstep(1.0, 0.7, r) * (0.04 + sweep * 0.04) + smoothstep(0.88, 1.0, r) * 0.16;
    gl_FragColor = vec4(uColor, alpha);
    ${OUTPUT_GLSL}
  }
`;

// Shared geometry and materials for everything that flies at the ship, plus a factory per kind.
// Every group that carries a glow keeps it in userData.halo, so the engine can shrink it as the
// object passes the camera.
export function createKit(powers, noise, skyUniforms) {
  const textures = {
    white: glowTexture(),
    cyan: glowTexture('rgba(91,231,218,1)', 'rgba(91,231,218,0)'),
    orange: glowTexture('rgba(255,120,50,1)', 'rgba(255,106,43,0)'),
    magenta: glowTexture('rgba(255,80,200,1)', 'rgba(255,80,200,0)'),
  };
  const rim = { value: new THREE.Color(0x7aa8ff) };
  const rockGeometries = [1.3, 2.9, 4.4, 6.1, 7.7].map(seed => rockGeometry(seed));
  const farGeometry = rockGeometry(3.3, 3);
  const rockMaterial = rockSurface(new THREE.MeshStandardMaterial({ color: 0x9b8f86, vertexColors: true, roughness: 0.94, metalness: 0.04, envMapIntensity: 0.4 }), noise, rim);
  const burning = rockSurface(new THREE.MeshStandardMaterial({ color: 0x4d413c, vertexColors: true, roughness: 0.9, metalness: 0.05, emissive: hdr(0xff5a1a, 1.6) }), noise, rim, { heat: true });

  // Scrap: a bevelled hex nut that glows at the edges.
  const nutShape = new THREE.Shape();
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; nutShape[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 0.32, Math.sin(a) * 0.32); }
  const hole = new THREE.Path();
  hole.absarc(0, 0, 0.13, 0, Math.PI * 2, true);
  nutShape.holes.push(hole);
  const nutGeometry = new THREE.ExtrudeGeometry(nutShape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 2, curveSegments: 18 }).center();
  const scrapMaterial = new THREE.MeshStandardMaterial({ color: 0xd8fffa, metalness: 0.85, roughness: 0.24, emissive: hdr(0x2bd6c8, 0.9) });
  const scrapHalo = additiveSprite(textures.cyan, 0.32);

  // Energy core: a plasma ball inside two spinning rings.
  const coreMaterial = new THREE.ShaderMaterial({ uniforms: { uNoise: { value: noise }, uTime: { value: 0 } }, vertexShader: worldVertex, fragmentShader: CORE_FRAGMENT });
  const coreGeometry = new THREE.SphereGeometry(0.3, 32, 20);
  const coreRingGeometry = new THREE.TorusGeometry(0.56, 0.022, 8, 64);
  const coreRingMaterial = basic(0xff8a3d, 1.2);
  const coreHalo = additiveSprite(textures.orange, 0.45);

  // Shield cell: a crystal with a bright heart.
  const crystalGeometry = new THREE.OctahedronGeometry(0.42, 0);
  const crystalMaterial = new THREE.MeshPhysicalMaterial({ color: 0xe9fffd, roughness: 0.08, metalness: 0.1, clearcoat: 1, emissive: hdr(0x5be7da, 0.35), flatShading: true, transparent: true, opacity: 0.88 });
  const heartGeometry = new THREE.OctahedronGeometry(0.17, 0);
  const heartMaterial = basic(0x9ffcf3, 1.4);
  const cyanHalo = additiveSprite(textures.cyan, 0.38);

  // Power-ups: a wire cage around a glowing core, coloured by type.
  const cageGeometry = new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.62, 0));
  const powerCoreGeometry = new THREE.IcosahedronGeometry(0.26, 1);
  const orbitGeometry = new THREE.TorusGeometry(0.82, 0.018, 6, 64);
  const powerLooks = Object.fromEntries(Object.entries(powers).map(([type, power]) => [type, {
    cage: new THREE.LineBasicMaterial({ color: hdr(power.color, 1.4) }),
    core: basic(power.color, 1.35),
    halo: (() => { const m = additiveSprite(textures.white, 0.42); m.color.set(power.color); return m; })(),
  }]));

  // Ion mine: a dark core with spikes and slowly pulsing rings.
  const mineCoreGeometry = new THREE.IcosahedronGeometry(0.34, 2);
  const mineCoreMaterial = new THREE.MeshStandardMaterial({ color: 0x2b2034, roughness: 0.35, metalness: 0.85, emissive: hdr(0xff4fbf, 0.6) });
  const spikeDirections = new THREE.IcosahedronGeometry(1, 0).attributes.position;
  const spikes = [];
  const seen = new Set();
  for (let i = 0; i < spikeDirections.count; i++) {
    const dir = new THREE.Vector3().fromBufferAttribute(spikeDirections, i).normalize();
    const key = dir.toArray().map(n => n.toFixed(2)).join();
    if (seen.has(key)) continue;
    seen.add(key);
    const cone = new THREE.ConeGeometry(0.07, 0.36, 8);
    cone.translate(0, 0.48, 0);
    cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
    spikes.push(cone);
  }
  const spikeGeometry = mergeGeometries(spikes);
  spikes.forEach(g => g.dispose());
  const spikeMaterial = new THREE.MeshStandardMaterial({ color: 0x6a6378, roughness: 0.3, metalness: 0.9 });
  const arcGeometry = new THREE.TorusGeometry(0.72, 0.025, 6, 48);
  const arcMaterial = new THREE.MeshBasicMaterial({ color: hdr(0xff6fd8, 1.3), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const magentaHalo = additiveSprite(textures.magenta, 0.4);

  // Girder: an I-beam with hazard caps and a slow warning beacon.
  const beamGeometry = mergeGeometries([
    new THREE.BoxGeometry(1, 0.06, 0.34).translate(0, 0.17, 0),
    new THREE.BoxGeometry(1, 0.06, 0.34).translate(0, -0.17, 0),
    new THREE.BoxGeometry(1, 0.3, 0.06),
  ]);
  const beamMaterial = new THREE.MeshStandardMaterial({ color: 0x939ca8, roughness: 0.45, metalness: 0.85 });
  const capGeometry = new THREE.BoxGeometry(0.16, 0.42, 0.42);
  const capMaterial = new THREE.MeshStandardMaterial({ color: 0x3a2a18, roughness: 0.5, metalness: 0.4, emissive: hdr(0xff8a1c, 0.75) });
  const beaconGeometry = new THREE.SphereGeometry(0.09, 12, 8);
  const beaconOn = hdr(0xff3344, 1.6);
  const beaconOff = hdr(0xff3344, 0.3);
  const beaconMaterial = new THREE.MeshBasicMaterial({ color: beaconOn.clone() });
  const redHalo = additiveSprite(textures.white, 0.6);
  redHalo.color.set(0xff3344);

  // Ring gate: fly through the middle.
  const gateGeometry = new THREE.TorusGeometry(1.35, 0.075, 16, 96);
  const gateMaterial = new THREE.MeshStandardMaterial({ color: 0xffd27a, roughness: 0.25, metalness: 0.9, emissive: hdr(0xffb547, 0.9) });
  const beadGeometry = mergeGeometries(Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    return new THREE.SphereGeometry(0.06, 8, 6).translate(Math.cos(a) * 1.35, Math.sin(a) * 1.35, 0.09);
  }));
  const beadMaterial = basic(0xfff3d6, 1.4);
  const veilMaterial = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: color(0xffd27a) }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: GATE_FRAGMENT,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const veilGeometry = new THREE.CircleGeometry(1.32, 48);

  // Everything solid fades out of the sky with distance instead of popping in.
  [rockMaterial, burning, scrapMaterial, coreRingMaterial, crystalMaterial, heartMaterial, mineCoreMaterial, spikeMaterial, beamMaterial, capMaterial, beaconMaterial, gateMaterial, beadMaterial,
    ...Object.values(powerLooks).flatMap(look => [look.cage, look.core])].forEach(material => skyFog(material, skyUniforms));

  const sprite = (material, size) => { const s = new THREE.Sprite(material); s.scale.setScalar(size); return s; };
  const mesh = (geometry, material) => new THREE.Mesh(geometry, material);
  const withHalo = (group, halo, size) => { group.add(halo); halo.scale.setScalar(size); group.userData.halo = halo; group.userData.haloSize = size; return group; };

  const make = {
    rock() { const group = new THREE.Group(); group.add(mesh(rockGeometries[0], rockMaterial)); return group; },
    meteor() { const group = new THREE.Group(); group.add(mesh(rockGeometries[0], burning)); return withHalo(group, sprite(coreHalo, 1), 2.4); },
    scrap() { const group = new THREE.Group(); group.add(mesh(nutGeometry, scrapMaterial)); return withHalo(group, sprite(scrapHalo, 1), 1.1); },
    core() {
      const group = new THREE.Group();
      const a = mesh(coreRingGeometry, coreRingMaterial); a.rotation.x = 1.2;
      const b = mesh(coreRingGeometry, coreRingMaterial); b.rotation.y = 1.2;
      group.add(mesh(coreGeometry, coreMaterial), a, b);
      return withHalo(group, sprite(coreHalo, 1), 1.8);
    },
    shield() { const group = new THREE.Group(); group.add(mesh(crystalGeometry, crystalMaterial), mesh(heartGeometry, heartMaterial)); return withHalo(group, sprite(cyanHalo, 1), 1.4); },
    power(type) {
      const look = powerLooks[type];
      const group = new THREE.Group();
      const orbit = mesh(orbitGeometry, look.core); orbit.rotation.x = 1.1;
      group.add(new THREE.LineSegments(cageGeometry, look.cage), mesh(powerCoreGeometry, look.core), orbit);
      return withHalo(group, sprite(look.halo, 1), 2);
    },
    mine() {
      const group = new THREE.Group();
      const a = mesh(arcGeometry, arcMaterial);
      const b = mesh(arcGeometry, arcMaterial); b.rotation.x = Math.PI / 2;
      group.add(mesh(mineCoreGeometry, mineCoreMaterial), mesh(spikeGeometry, spikeMaterial), a, b);
      return withHalo(group, sprite(magentaHalo, 1), 1.8);
    },
    girder() {
      const group = new THREE.Group();
      const beam = mesh(beamGeometry, beamMaterial);
      const left = mesh(capGeometry, capMaterial);
      const right = mesh(capGeometry, capMaterial);
      const beacon = mesh(beaconGeometry, beaconMaterial);
      beacon.position.y = 0.24;
      const beaconGlow = sprite(redHalo, 0.9);
      beaconGlow.position.y = 0.24;
      group.add(beam, left, right, beacon, beaconGlow);
      group.userData.parts = { beam, left, right };
      return group;
    },
    gate() {
      const group = new THREE.Group();
      group.add(mesh(gateGeometry, gateMaterial), mesh(beadGeometry, beadMaterial), mesh(veilGeometry, veilMaterial));
      return group;
    },
  };

  return {
    make,
    rim,
    rockGeometries,
    farGeometry,
    rockMaterial,
    scrapMaterial,
    // Shared materials animate once per frame instead of per object. Everything eases; nothing strobes.
    update(time) {
      coreMaterial.uniforms.uTime.value = time;
      veilMaterial.uniforms.uTime.value = time;
      const pulse = 0.5 + 0.5 * Math.sin(time * 3.2);
      mineCoreMaterial.emissiveIntensity = 0.45 + pulse * 0.6;
      arcMaterial.opacity = 0.35 + pulse * 0.4;
      magentaHalo.opacity = 0.28 + pulse * 0.22;
      const beacon = 0.5 + 0.5 * Math.sin(time * 4);
      beaconMaterial.color.lerpColors(beaconOff, beaconOn, beacon);
      redHalo.opacity = 0.15 + beacon * 0.5;
      capMaterial.emissiveIntensity = 0.6 + pulse * 0.3;
    },
    // A few of everything, so their shaders compile and draw once before the first flight.
    previews() {
      return [make.rock(), make.meteor(), make.scrap(), make.core(), make.shield(), ...Object.keys(powers).map(make.power), make.mine(), make.girder(), make.gate()];
    },
    dispose() {
      Object.values(textures).forEach(texture => texture.dispose());
    },
  };
}

/* ───────────── Scenery and guides ───────────── */

// Asteroids drifting far outside the flight lane give the scene depth. They never cross the lane,
// share the rock material, and cost a single draw call.
export function createFarField(kit, count = 44) {
  const mesh = new THREE.InstancedMesh(kit.farGeometry, kit.rockMaterial, count);
  mesh.frustumCulled = false;
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  const rocks = Array.from({ length: count }, () => ({ position: new THREE.Vector3(), turn: new THREE.Vector3(), spin: new THREE.Vector3(), size: 1 }));
  const place = (rock, z) => {
    const angle = Math.random() * Math.PI * 2;
    const reach = 11 + Math.random() * 38;
    rock.position.set(Math.cos(angle) * reach * 1.5, 0.4 + Math.sin(angle) * reach * 0.75, z);
    rock.turn.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    rock.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.5);
    rock.size = 0.9 + Math.random() ** 2 * 4.5;
  };
  rocks.forEach(rock => place(rock, -195 + Math.random() * 200));
  return {
    mesh,
    update(dt, speed) {
      for (let i = 0; i < count; i++) {
        const rock = rocks[i];
        rock.position.z += speed * 0.3 * dt;
        if (rock.position.z > 14) place(rock, -195);
        rock.turn.addScaledVector(rock.spin, dt);
        rotation.setFromEuler(euler.set(rock.turn.x, rock.turn.y, rock.turn.z));
        mesh.setMatrixAt(i, matrix.compose(rock.position, rotation, scale.setScalar(rock.size)));
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// Warning rings in the ship's plane: each shows where a hazard will cross it and how big it is, so the
// depth of an incoming rock never has to be guessed. Also draws the steering reticle. One draw call.
export function createMarkers(max = 32) {
  const geometry = new THREE.PlaneGeometry(2, 2);
  const tint = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const form = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aTint', tint);
  geometry.setAttribute('aForm', form);
  const material = new THREE.ShaderMaterial({
    vertexShader: /* glsl */`
      attribute vec4 aTint;
      attribute vec2 aForm;
      varying vec2 vUv;
      varying vec4 vTint;
      varying vec2 vForm;
      void main() {
        vUv = uv * 2.0 - 1.0;
        vTint = aTint;
        vForm = aForm;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      varying vec4 vTint;
      varying vec2 vForm;
      void main() {
        float d;
        float inside;
        if (vForm.x < 0.5) {
          float r = length(vUv);
          d = abs(r - 0.92);
          inside = 1.0 - smoothstep(0.8, 0.92, r);
        } else {
          vec2 q = abs(vUv * vec2(vForm.y, 1.0)) - vec2(vForm.y - 0.25, 0.75);
          float box = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.17;
          d = abs(box);
          inside = 1.0 - smoothstep(-0.05, 0.0, box);
        }
        float pixel = fwidth(d);
        float line = 1.0 - smoothstep(pixel * 0.9, pixel * 2.2, d);
        float alpha = (line + inside * 0.1) * vTint.a;
        if (alpha < 0.003) discard;
        gl_FragColor = vec4(vTint.rgb, alpha);
        ${OUTPUT_GLSL}
      }`,
    transparent: true, depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, max);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  mesh.count = 0;
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const axis = new THREE.Vector3(0, 0, 1);
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  let count = 0;
  const push = (x, y, sx, sy, angle, shade, alpha, shape, aspect) => {
    if (count >= max || alpha < 0.005) return;
    mesh.setMatrixAt(count, matrix.compose(position.set(x, y, 0), rotation.setFromAxisAngle(axis, angle), scale.set(sx, sy, 1)));
    tint.setXYZW(count, shade.r, shade.g, shade.b, alpha);
    form.setXY(count, shape, aspect);
    count += 1;
  };
  return {
    mesh,
    begin() { count = 0; },
    ring(x, y, radius, shade, alpha) { push(x, y, radius, radius, 0, shade, alpha, 0, 1); },
    bar(x, y, length, width, angle, shade, alpha) { push(x, y, length / 2, width / 2, angle, shade, alpha, 1, length / width); },
    end() {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      tint.needsUpdate = true;
      form.needsUpdate = true;
    },
  };
}
