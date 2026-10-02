import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { compileScene, createStage, glowTexture, prefersReducedMotion, runWhileVisible } from './stage.js';
import { introDone } from '../lib/intro.js';

const DEPTH = 420;

function planet(radius, color, ring) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 3), new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true }));
  group.add(body);
  if (ring) {
    const band = new THREE.Mesh(new THREE.RingGeometry(radius * 1.45, radius * 2.1, 96), new THREE.MeshBasicMaterial({ color: ring, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    band.rotation.x = Math.PI / 2.35;
    group.add(band);
  }
  return group;
}

// The page flies through a star tunnel: scrolling pushes the camera forward and fast scrolls stretch into warp.
export default function Starfield() {
  const host = useRef(null);
  useEffect(() => {
    const element = host.current;
    const stage = createStage(element, { maxPixelRatio: 1, antialias: false });
    if (!stage) { introDone('starfield'); return; }
    const { renderer, scene, dispose } = stage;
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 600);
    camera.position.set(0, 0, 12);

    const small = window.innerWidth < 760;
    const count = small ? 1400 : 3000;
    const base = new Float32Array(count * 3);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const palette = [new THREE.Color(0xffffff), new THREE.Color(0xffffff), new THREE.Color(0xffffff), new THREE.Color(0x5be7da), new THREE.Color(0xff8a4c), new THREE.Color(0xb3a6ff)];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 3 + Math.pow(Math.random(), 0.7) * 60;
      base[i * 3] = Math.cos(angle) * radius;
      base[i * 3 + 1] = Math.sin(angle) * radius;
      base[i * 3 + 2] = Math.random() * DEPTH;
      const color = palette[(Math.random() * palette.length) | 0];
      const dim = 0.45 + Math.random() * 0.55;
      colors.set([color.r * dim, color.g * dim, color.b * dim], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const starMaterial = new THREE.PointsMaterial({ size: 0.55, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
    scene.add(new THREE.Points(geometry, starMaterial));

    const nebulae = [
      { color: 'rgba(255,106,43,0.55)', x: 34, y: -6, z: -120, s: 120 },
      { color: 'rgba(91,231,218,0.4)', x: -40, y: -60, z: -140, s: 140 },
      { color: 'rgba(157,138,255,0.45)', x: 30, y: -120, z: -130, s: 130 },
      { color: 'rgba(255,106,43,0.4)', x: -30, y: -180, z: -150, s: 150 },
    ].map(({ color, x, y, z, s }) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(color, color.replace(/[\d.]+\)$/, '0)'), 128), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 }));
      sprite.scale.setScalar(s);
      sprite.position.set(x, y, z);
      sprite.userData.baseY = y;
      scene.add(sprite);
      return sprite;
    });

    const planets = [
      { mesh: planet(4.2, 0xb8390a, 0xffb38a), x: small ? 13 : 22, y: -46, z: -40 },
      { mesh: planet(2.2, 0x2a8f89), x: small ? -13 : -20, y: -84, z: -30 },
      // Rises with the footer; shifted down by the mothership band's height (~880px × 0.012) to stay there.
      { mesh: planet(3.2, 0x5a4fb0, 0xc7b8ff), x: small ? 13 : 18, y: -135.5, z: -36 },
    ];
    planets.forEach(({ mesh, x, y, z }) => { mesh.position.set(x, y, z); mesh.rotation.z = 0.3; scene.add(mesh); });

    const pointer = { x: 0, y: 0 };
    const onPointer = event => { pointer.x = event.clientX / window.innerWidth - 0.5; pointer.y = event.clientY / window.innerHeight - 0.5; };
    const resize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    };

    let lastScroll = window.scrollY;
    let warp = 0;
    const place = (elapsed, motion) => {
      const scroll = window.scrollY;
      const velocity = scroll - lastScroll;
      lastScroll = scroll;
      warp += (Math.min(Math.abs(velocity), 90) / 90 - warp) * 0.08;
      const travel = scroll * 0.09 + (motion ? elapsed * 1.6 : 0);
      for (let i = 0; i < count; i++) {
        positions[i * 3] = base[i * 3];
        positions[i * 3 + 1] = base[i * 3 + 1];
        positions[i * 3 + 2] = ((base[i * 3 + 2] + travel) % DEPTH) - DEPTH + 11;
      }
      geometry.attributes.position.needsUpdate = true;
      starMaterial.size = 0.55 + warp * 1.4;
      camera.fov = 60 + warp * 14;
      camera.updateProjectionMatrix();
      const lift = scroll * 0.012;
      planets.forEach(({ mesh, y }) => { mesh.position.y = y + lift; if (motion) mesh.rotation.y += 0.0015; });
      nebulae.forEach(sprite => { sprite.position.y = sprite.userData.baseY + scroll * 0.03; });
    };
    const renderStatic = () => { place(0, false); renderer.render(scene, camera); };

    resize();
    window.addEventListener('resize', resize);
    // Shaders compile in parallel first, so the first frame (and the intro over it) never stalls.
    let stop = () => {};
    let disposed = false;
    compileScene(renderer, scene, camera).then(() => {
      if (disposed) return;
      renderStatic();
      introDone('starfield');
      if (prefersReducedMotion()) {
        window.addEventListener('resize', renderStatic);
        window.addEventListener('scroll', renderStatic, { passive: true });
      } else {
        window.addEventListener('pointermove', onPointer, { passive: true });
        stop = runWhileVisible(element, (dt, elapsed) => {
          camera.position.x += (pointer.x * 3 - camera.position.x) * 0.03;
          camera.position.y += (-pointer.y * 2 - camera.position.y) * 0.03;
          camera.lookAt(0, 0, -40);
          place(elapsed, true);
          renderer.render(scene, camera);
        }, { alwaysOn: true });
      }
    });
    return () => {
      disposed = true;
      stop();
      window.removeEventListener('resize', resize);
      window.removeEventListener('resize', renderStatic);
      window.removeEventListener('scroll', renderStatic);
      window.removeEventListener('pointermove', onPointer);
      dispose();
    };
  }, []);
  return <div className="starfield" ref={host} aria-hidden="true" />;
}
