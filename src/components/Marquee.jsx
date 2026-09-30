import { useRef } from 'react';
import { motion, useAnimationFrame, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform, useVelocity } from 'framer-motion';
import { marquee } from '../data.js';

const wrap = (min, max, value) => { const range = max - min; return ((((value - min) % range) + range) % range) + min; };

// Runs on its own and speeds up (or reverses) with the scroll.
function Row({ items, speed, className, separator }) {
  const reduce = useReducedMotion();
  const base = useMotionValue(0);
  const { scrollY } = useScroll();
  const velocity = useSpring(useVelocity(scrollY), { damping: 50, stiffness: 400 });
  const factor = useTransform(velocity, [-2000, 0, 2000], [-4, 0, 4], { clamp: false });
  const x = useTransform(base, value => `${wrap(-50, 0, value)}%`);
  const direction = useRef(1);
  useAnimationFrame((_, delta) => {
    if (reduce) return;
    let move = direction.current * speed * (delta / 1000);
    if (factor.get() < 0) direction.current = -1; else if (factor.get() > 0) direction.current = 1;
    move += direction.current * move * Math.abs(factor.get());
    base.set(base.get() + move);
  });
  return <div className={`marquee-row ${className}`}>
    <motion.div className="marquee-track" style={{ x }}>
      {[0, 1].map(copy => <div className="marquee-group" key={copy} aria-hidden={copy ? 'true' : undefined}>
        {items.map(item => <span key={item}>{item}<i aria-hidden="true">{separator}</i></span>)}
      </div>)}
    </motion.div>
  </div>;
}

export default function Marquee() {
  return <section className="marquee" aria-label={`Tools I use: ${marquee.join(', ')}`}>
    <div aria-hidden="true">
      <Row items={marquee} speed={-3} className="marquee-accent" separator="✦" />
      <Row items={['Full stack', 'MERN', 'AI integrations', '3D on the web', 'Pixel-pushing', 'Clean APIs']} speed={2.2} className="marquee-dark" separator="—" />
    </div>
  </section>;
}
