import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ease } from './ui.jsx';
import { introReady } from '../lib/intro.js';

const LINES = ['Fuelling the rocket', 'Waking Bandit up', 'Plotting a course'];
const DURATION = 1300;
// The longest the countdown holds at 000 for the 3D scenes and fonts before it starts anyway.
const MAX_WAIT = 2500;

// A short launch countdown that lifts away like a curtain. It holds at 000 while the scenes behind it
// compile, then counts on a quiet main thread so every frame of the intro and the reveal lands.
export default function Preloader({ onDone }) {
  const [count, setCount] = useState(0);
  const bar = useRef(null);
  useEffect(() => {
    let live = true;
    let raf = 0;
    let timer = 0;
    introReady(MAX_WAIT).then(() => {
      if (!live) return;
      // The bar runs on the compositor (easeOutCubic, like the count), so it never stutters.
      bar.current.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: DURATION, easing: 'cubic-bezier(0.33, 1, 0.68, 1)', fill: 'forwards' });
      const start = performance.now();
      raf = requestAnimationFrame(function tick(now) {
        const t = Math.min(Math.max((now - start) / DURATION, 0), 1);
        setCount(Math.round((1 - Math.pow(1 - t, 3)) * 100));
        if (t < 1) raf = requestAnimationFrame(tick);
        else timer = setTimeout(onDone, 180);
      });
    });
    return () => { live = false; cancelAnimationFrame(raf); clearTimeout(timer); };
  }, [onDone]);
  // `transform` (rather than `y`) lets the curtain lift as a compositor animation.
  return <motion.div className="preloader" role="status" aria-label="Loading" initial={{ transform: 'translateY(0%)' }} exit={{ transform: 'translateY(-100%)', transition: { duration: 0.9, ease } }}>
    <div className="preloader-inner">
      <span className="preloader-line">{LINES[Math.min(Math.floor(count / 34), LINES.length - 1)]}…</span>
      <span className="preloader-count">{String(count).padStart(3, '0')}</span>
    </div>
    <div className="preloader-bar" ref={bar} />
  </motion.div>;
}
