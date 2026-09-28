import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export default function Sculpture() {
  const container = useRef(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const host = container.current;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); } catch { setFailed(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 50);
    camera.position.set(0, 0, 9.7);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, 0.04);
    scene.environment = environment.texture;
    const material = new THREE.MeshPhysicalMaterial({ color: 0xb2a3ed, metalness: .9, roughness: .22, clearcoat: 1, clearcoatRoughness: .13, iridescence: .48, iridescenceIOR: 1.35, iridescenceThicknessRange: [100, 350], envMapIntensity: 1.2 });
    const geometry = new THREE.TorusKnotGeometry(1.48, .53, 220, 40, 2, 3);
    const knot = new THREE.Mesh(geometry, material);
    knot.rotation.set(.3, -.35, -.4);
    scene.add(knot);
    const key = new THREE.DirectionalLight(0xe6deff, 5); key.position.set(-3, 4, 4); scene.add(key);
    const rim = new THREE.PointLight(0x9771ff, 45, 20); rim.position.set(3, 1, 2); scene.add(rim);
    const bottom = new THREE.PointLight(0xc5f58a, 15, 20); bottom.position.set(-3, -3, 2); scene.add(bottom);
    const starsGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(45 * 3);
    for (let i = 0; i < positions.length; i++) positions[i] = (Math.random() - .5) * 9;
    starsGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starsMaterial = new THREE.PointsMaterial({ color: 0xc9baf4, size: .018, transparent: true, opacity: .45 });
    const stars = new THREE.Points(starsGeo, starsMaterial); scene.add(stars);
    const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = motionQuery.matches;
    let inView = true;
    let frame = 0;
    let elapsed = 0;
    let last = performance.now();
    const target = { x: 0, y: 0 };
    const pointer = { x: 0, y: 0 };
    const render = () => renderer.render(scene, camera);
    const animate = now => {
      frame = 0;
      const delta = Math.min((now - last) / 1000, .05); last = now;
      if (!reduced) { elapsed += delta; pointer.x += (target.x - pointer.x) * .045; pointer.y += (target.y - pointer.y) * .045; knot.rotation.y = -.35 + elapsed * .13 + pointer.x * .35; knot.rotation.x = .3 + Math.sin(elapsed * .3) * .15 + pointer.y * .2; knot.rotation.z = -.4 + Math.sin(elapsed * .2) * .12; knot.position.y = Math.sin(elapsed * .7) * .1; stars.rotation.y = elapsed * .025; }
      render();
      if (!reduced && inView && !document.hidden) frame = requestAnimationFrame(animate);
    };
    const sync = () => { if (frame) cancelAnimationFrame(frame); frame = 0; if (inView && !document.hidden) { last = performance.now(); frame = requestAnimationFrame(animate); } };
    const resize = new ResizeObserver(() => { const { width, height } = host.getBoundingClientRect(); if (!width || !height) return; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); render(); }); resize.observe(host);
    const visibility = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync(); }); visibility.observe(host);
    const onMove = e => { const rect = host.getBoundingClientRect(); target.x = (e.clientX - rect.left) / rect.width - .5; target.y = (e.clientY - rect.top) / rect.height - .5; };
    const onLeave = () => { target.x = 0; target.y = 0; };
    const onMotion = e => { reduced = e.matches; sync(); };
    const onLost = e => { e.preventDefault(); setFailed(true); if (frame) cancelAnimationFrame(frame); };
    host.addEventListener('pointermove', onMove); host.addEventListener('pointerleave', onLeave);
    renderer.domElement.addEventListener('webglcontextlost', onLost);
    document.addEventListener('visibilitychange', sync); motionQuery.addEventListener('change', onMotion);
    sync();
    return () => { cancelAnimationFrame(frame); resize.disconnect(); visibility.disconnect(); document.removeEventListener('visibilitychange', sync); motionQuery.removeEventListener('change', onMotion); host.removeEventListener('pointermove', onMove); host.removeEventListener('pointerleave', onLeave); renderer.domElement.removeEventListener('webglcontextlost', onLost); geometry.dispose(); material.dispose(); starsGeo.dispose(); starsMaterial.dispose(); environment.dispose(); room.dispose(); pmrem.dispose(); renderer.dispose(); renderer.domElement.remove(); };
  }, []);
  return <div ref={container} className={`sculpture-canvas ${failed ? 'is-fallback' : ''}`} role="img" aria-label="A slowly rotating, reflective lavender 3D knot that responds to your cursor">{failed && <div className="sculpture-fallback"/>}</div>;
}
