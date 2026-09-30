import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ease } from './ui.jsx';

const LINES = ['Fuelling the rocket', 'Waking Bandit up', 'Plotting a course'];

// A short launch countdown that lifts away like a curtain.
export default function Preloader({ onDone }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const duration = 1300;
    let raf = requestAnimationFrame(function tick(now) {
      const t = Math.min((now - start) / duration, 1);
      setCount(Math.round((1 - Math.pow(1 - t, 3)) * 100));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setTimeout(onDone, 180);
    });
    return () => cancelAnimationFrame(raf);
  }, [onDone]);
  return <motion.div className="preloader" role="status" aria-label="Loading" initial={{ y: 0 }} exit={{ y: '-100%', transition: { duration: 0.9, ease } }}>
    <div className="preloader-inner">
      <span className="preloader-line">{LINES[Math.min(Math.floor(count / 34), LINES.length - 1)]}…</span>
      <span className="preloader-count">{String(count).padStart(3, '0')}</span>
    </div>
    <div className="preloader-bar" style={{ transform: `scaleX(${count / 100})` }} />
  </motion.div>;
}
