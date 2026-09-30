import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Creates a transparent renderer lit for deep space: a dim fill, a warm key and a cyan rim.
// Returns null when WebGL is unavailable so callers can show their fallback.
export function createStage(host, { maxPixelRatio = 1.75, antialias = true, reflections = false, lights = true } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias, alpha: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  let environment = null;
  if (reflections) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    // Only soft reflections are needed, so a small cube map looks the same and builds far faster.
    environment = pmrem.fromScene(room, 0.04, 0.1, 100, { size: 64 });
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.45;
    room.dispose?.();
    pmrem.dispose();
  }
  if (lights) {
    scene.add(new THREE.HemisphereLight(0xcfd4ff, 0x120d18, 0.9));
    const key = new THREE.DirectionalLight(0xffd2b0, 2.2);
    key.position.set(5, 6, 7);
    const rim = new THREE.DirectionalLight(0x5be7da, 2.4);
    rim.position.set(-6, 2, -4);
    const warm = new THREE.PointLight(0xff6a2b, 18, 14, 1.6);
    warm.position.set(2.5, -2, 3);
    scene.add(key, rim, warm);
  }

  const dispose = () => {
    scene.traverse(object => {
      object.geometry?.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => { material?.map?.dispose(); material?.dispose(); });
    });
    environment?.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
  return { renderer, scene, dispose };
}

// Runs `frame(dt, elapsed)` only while `target` is on screen and the tab is visible.
export function runWhileVisible(target, frame, { alwaysOn = false } = {}) {
  let raf = 0;
  let visible = alwaysOn;
  let last = performance.now();
  let elapsed = 0;
  const tick = now => {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    elapsed += dt;
    frame(dt, elapsed);
    raf = requestAnimationFrame(tick);
  };
  const sync = () => {
    const shouldRun = visible && !document.hidden;
    if (shouldRun && !raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
    if (!shouldRun && raf) { cancelAnimationFrame(raf); raf = 0; }
  };
  const observer = alwaysOn ? null : new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }, { rootMargin: '120px' });
  observer?.observe(target);
  document.addEventListener('visibilitychange', sync);
  sync();
  return () => {
    cancelAnimationFrame(raf);
    raf = 0;
    observer?.disconnect();
    document.removeEventListener('visibilitychange', sync);
  };
}

// A soft round sprite texture, used for stars, glows and sparks.
export function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.35, inner.replace(/[\d.]+\)$/, '0.45)'));
  gradient.addColorStop(1, outer);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
