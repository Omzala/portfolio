import { useEffect, useRef, useState } from 'react';
import { toolbelt } from '../data.js';

// Tool pills with real physics: they drop into the card, you can fling them around, and Zero-G floats them.
export default function Toolbelt() {
  const box = useRef(null);
  const pills = useRef([]);
  const world = useRef(null);
  const [zeroG, setZeroG] = useState(false);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const element = box.current;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let cleanup = () => {};
    let cancelled = false;
    const observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      let Matter;
      try { Matter = (await import('matter-js')).default; } catch { return; }
      if (cancelled) return;
      const { Engine, Bodies, Body, Composite, Constraint } = Matter;
      const engine = Engine.create({ gravity: { x: 0, y: 1 } });
      let { width, height } = element.getBoundingClientRect();
      const wallOptions = { isStatic: true, restitution: 0.4, friction: 0.3 };
      let walls = [];
      const buildWalls = () => {
        Composite.remove(engine.world, walls);
        walls = [
          Bodies.rectangle(width / 2, height + 50, width * 2, 100, wallOptions),
          Bodies.rectangle(width / 2, -50, width * 2, 100, wallOptions),
          Bodies.rectangle(-50, height / 2, 100, height * 4, wallOptions),
          Bodies.rectangle(width + 50, height / 2, 100, height * 4, wallOptions),
        ];
        Composite.add(engine.world, walls);
      };
      buildWalls();
      const bodies = pills.current.map((pill, i) => {
        const w = pill.offsetWidth;
        const h = pill.offsetHeight;
        const body = Bodies.rectangle(40 + ((i * 97) % Math.max(width - 80, 1)), 60 + (i % 3) * 30, w, h, { chamfer: { radius: h / 2 - 1 }, restitution: 0.55, friction: 0.08, frictionAir: 0.012, density: 0.002 });
        Body.setAngle(body, (Math.random() - 0.5) * 0.8);
        return { body, pill, w, h };
      });
      Composite.add(engine.world, bodies.map(({ body }) => body));
      setLive(true);

      // Dragging: a spring from the grabbed point to the pointer.
      let grab = null;
      const local = event => { const rect = element.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; };
      const down = event => {
        const hit = bodies.find(({ pill }) => pill === event.target.closest('.pill'));
        if (!hit) return;
        event.preventDefault();
        element.setPointerCapture(event.pointerId);
        const point = local(event);
        // pointA is a world-oriented offset from the body's centre; Matter rotates it with the body.
        const offset = { x: point.x - hit.body.position.x, y: point.y - hit.body.position.y };
        grab = Constraint.create({ bodyA: hit.body, pointA: offset, pointB: point, stiffness: 0.12, damping: 0.08, length: 0 });
        Composite.add(engine.world, grab);
        element.classList.add('grabbing');
      };
      const move = event => { if (grab) grab.pointB = local(event); };
      const up = () => { if (grab) { Composite.remove(engine.world, grab); grab = null; element.classList.remove('grabbing'); } };
      element.addEventListener('pointerdown', down);
      element.addEventListener('pointermove', move);
      element.addEventListener('pointerup', up);
      element.addEventListener('pointercancel', up);

      let raf = 0;
      let visible = true;
      let last = performance.now();
      const tick = now => {
        const dt = Math.min(now - last, 16.667);
        last = now;
        if (engine.gravity.y === 0) bodies.forEach(({ body }) => {
          if (Math.random() < 0.02) Body.applyForce(body, body.position, { x: (Math.random() - 0.5) * 0.004 * body.mass, y: (Math.random() - 0.5) * 0.004 * body.mass });
        });
        Engine.update(engine, dt);
        bodies.forEach(({ body, pill, w, h }) => { pill.style.transform = `translate3d(${body.position.x - w / 2}px, ${body.position.y - h / 2}px, 0) rotate(${body.angle}rad)`; });
        raf = requestAnimationFrame(tick);
      };
      const sync = () => {
        const run = visible && !document.hidden;
        if (run && !raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
        if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
      };
      const seen = new IntersectionObserver(([item]) => { visible = item.isIntersecting; sync(); });
      seen.observe(element);
      document.addEventListener('visibilitychange', sync);
      const resize = new ResizeObserver(() => {
        ({ width, height } = element.getBoundingClientRect());
        buildWalls();
        bodies.forEach(({ body }) => { if (body.position.x > width - 20 || body.position.y > height) Body.setPosition(body, { x: Math.min(body.position.x, width - 60), y: 40 }); });
      });
      resize.observe(element);
      sync();
      world.current = { setGravity: value => { engine.gravity.y = value; bodies.forEach(({ body }) => Body.setVelocity(body, { x: (Math.random() - 0.5) * 4, y: value ? 0 : -3 - Math.random() * 4 })); } };
      cleanup = () => {
        cancelAnimationFrame(raf);
        seen.disconnect();
        resize.disconnect();
        document.removeEventListener('visibilitychange', sync);
        element.removeEventListener('pointerdown', down);
        element.removeEventListener('pointermove', move);
        element.removeEventListener('pointerup', up);
        element.removeEventListener('pointercancel', up);
        Composite.clear(engine.world, false);
        Engine.clear(engine);
        world.current = null;
      };
    }, { rootMargin: '0px 0px -20% 0px' });
    observer.observe(element);
    return () => { cancelled = true; observer.disconnect(); cleanup(); };
  }, []);

  const toggle = () => { world.current?.setGravity(zeroG ? 1 : 0); setZeroG(!zeroG); };

  return <div className="card toolbelt">
    <div className="card-head">
      <span className="card-label">Toolbelt · {live ? 'drag me' : 'my stack'}</span>
      <button type="button" className="switch" role="switch" aria-checked={zeroG} onClick={toggle} disabled={!live}>Zero-G <span className="switch-track"><span className="switch-thumb" /></span></button>
    </div>
    <ul className="sr-only">{toolbelt.map(({ label }) => <li key={label}>{label}</li>)}</ul>
    <div className={live ? 'pill-box live' : 'pill-box'} ref={box} data-cursor={live ? 'Drag' : undefined} aria-hidden="true">
      {toolbelt.map(({ label, tone }, i) => <span key={label} className={`pill pill-${tone}`} ref={node => { pills.current[i] = node; }}>{label}</span>)}
    </div>
  </div>;
}
