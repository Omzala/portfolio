import { lazy, useEffect, useRef, useState } from 'react';
import { animate, motion, useInView, useMotionValue, useReducedMotion, useScroll, useSpring, useTransform } from 'framer-motion';
import { ArrowUpRight, Gamepad2, Hand } from 'lucide-react';
import { Magnetic, Safe3D, ease } from '../components/ui.jsx';
import RaccoonArt from '../components/RaccoonArt.jsx';
import { banditLines } from '../data.js';

const Raccoon = lazy(() => import('../three/Raccoon.jsx'));
const NAME = 'OM ZALA'.split('');

export function CountUp({ to, suffix = '', className = '' }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-10% 0px' });
  const [value, setValue] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!inView) return;
    if (reduce) { setValue(to); return; }
    const controls = animate(0, to, { duration: 1.6, ease, onUpdate: latest => setValue(Math.round(latest)) });
    return () => controls.stop();
  }, [inView, to, reduce]);
  return <strong ref={ref} className={className}>{value}{suffix}</strong>;
}

// Letters rise into place on load, then drift apart as the hero scrolls away.
function Letter({ letter, offset, spread }) {
  const x = useTransform(spread, value => `${offset * value * 22}%`);
  return <span className="letter-mask" aria-hidden="true">
    <motion.span className="letter" variants={{ hidden: { y: '105%' }, shown: { y: '0%', transition: { duration: 1.1, ease } } }} style={{ x }}>{letter === ' ' ? ' ' : letter}</motion.span>
  </span>;
}

function Chip({ children, tone, className, depth, mouse }) {
  const x = useTransform(mouse.x, value => value * depth);
  const y = useTransform(mouse.y, value => value * depth);
  return <motion.span className={`float-chip ${className}`} style={{ x, y }} aria-hidden="true"><i className={`dot dot-${tone}`} />{children}</motion.span>;
}

export default function Hero({ ready }) {
  const ref = useRef(null);
  const [pokes, setPokes] = useState(0);
  const reduce = useReducedMotion();
  const poke = () => setPokes(count => count + 1);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start start', 'end start'] });
  const p = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.4 });
  const nameY = useTransform(p, [0, 1], ['0%', '-40%']);
  const nameOpacity = useTransform(p, [0, 0.75], [1, 0]);
  const raccoonY = useTransform(p, [0, 1], ['0%', '-55%']);
  const raccoonScale = useTransform(p, [0, 1], [1, 0.62]);
  const raccoonRotate = useTransform(p, [0, 1], [0, -18]);
  const planetY = useTransform(p, [0, 1], ['0%', '38%']);
  const planetScale = useTransform(p, [0, 1], [1, 1.35]);
  const copyY = useTransform(p, [0, 1], ['0%', '-60%']);
  const copyOpacity = useTransform(p, [0, 0.6], [1, 0]);

  const mouse = { x: useSpring(useMotionValue(0), { stiffness: 60, damping: 18 }), y: useSpring(useMotionValue(0), { stiffness: 60, damping: 18 }) };
  const onMove = event => {
    if (reduce) return;
    mouse.x.set(event.clientX / window.innerWidth - 0.5);
    mouse.y.set(event.clientY / window.innerHeight - 0.5);
  };

  const show = ready ? 'shown' : 'hidden';
  return <section id="home" ref={ref} className="hero" onPointerMove={onMove}>
    <motion.div className="hero-meta shell" initial={{ opacity: 0 }} animate={ready ? { opacity: 1 } : {}} transition={{ delay: 0.9, duration: 0.8 }}>
      <span>[ 00 ] Portfolio — 2026</span>
      <span className="status"><span className="pulse-dot" /> Open to full stack &amp; MERN roles</span>
      <span className="coords">22.31° N — 73.18° E</span>
    </motion.div>

    <motion.h1 className="hero-name" aria-label="Om Zala" style={{ y: nameY, opacity: nameOpacity }} initial="hidden" animate={show} transition={{ staggerChildren: 0.06, delayChildren: 0.15 }}>
      {NAME.map((letter, i) => <Letter key={i} letter={letter} offset={i - (NAME.length - 1) / 2} spread={p} />)}
    </motion.h1>

    <motion.div className="planet-wrap" style={{ y: planetY, scale: planetScale }} aria-hidden="true">
      <motion.div className="planet" initial={{ scale: 0.4, opacity: 0 }} animate={ready ? { scale: 1, opacity: 1 } : {}} transition={{ duration: 1.4, ease, delay: 0.2 }} />
      <motion.div className="planet-ring" initial={{ scaleX: 0.2, opacity: 0 }} animate={ready ? { scaleX: 1, opacity: 1 } : {}} transition={{ duration: 1.4, ease, delay: 0.45 }} />
    </motion.div>

    <motion.div className="raccoon-stage" style={{ y: raccoonY, scale: raccoonScale, rotate: raccoonRotate }} data-cursor="Poke">
      <motion.div className="raccoon-enter" initial={{ opacity: 0, y: 120 }} animate={ready ? { opacity: 1, y: 0 } : {}} transition={{ duration: 1.3, ease, delay: 0.35 }}>
        <Safe3D fallback={<div className="raccoon is-fallback"><RaccoonArt /></div>}><Raccoon pokes={pokes} onPoke={poke} /></Safe3D>
        <p className="bubble" aria-live="polite" key={pokes}>{banditLines[pokes % banditLines.length]}</p>
        <Chip mouse={mouse} depth={-40} tone="cyan" className="chip-a">React</Chip>
        <Chip mouse={mouse} depth={55} tone="orange" className="chip-b">Gemini AI</Chip>
        <Chip mouse={mouse} depth={-28} tone="light" className="chip-c">Node.js</Chip>
        <Chip mouse={mouse} depth={36} tone="cyan" className="chip-d">MongoDB</Chip>
      </motion.div>
    </motion.div>

    <motion.div className="hero-bottom shell" style={{ y: copyY, opacity: copyOpacity }}>
      <motion.div className="hero-intro" initial={{ opacity: 0, y: 30 }} animate={ready ? { opacity: 1, y: 0 } : {}} transition={{ duration: 1, ease, delay: 0.8 }}>
        <p>Full stack developer from Vadodara, India. I build <em>delightful</em> MERN apps with a sprinkle of AI, and sweat the tiny details.</p>
        <div className="hero-actions">
          <Magnetic><a className="btn btn-light" href="#work" data-cursor="Go">See the work <ArrowUpRight size={18} /></a></Magnetic>
          <Magnetic><a className="btn btn-ghost" href="#arcade"><Gamepad2 size={18} /> Play the arcade</a></Magnetic>
          <button type="button" className="btn btn-ghost poke-btn" onClick={poke}><Hand size={17} /> Poke Bandit</button>
        </div>
      </motion.div>
      <motion.div className="hero-stats" initial={{ opacity: 0, y: 30 }} animate={ready ? { opacity: 1, y: 0 } : {}} transition={{ duration: 1, ease, delay: 0.95 }}>
        <div><CountUp to={10} suffix="+" /><span>projects shipped</span></div>
        <div><CountUp to={1} suffix="+" /><span>year building products</span></div>
        <div><strong className="accent">∞</strong><span>curiosity</span></div>
      </motion.div>
    </motion.div>

    <a className="scroll-cue" href="#about" aria-label="Scroll to About"><span>Scroll</span><i /></a>
  </section>;
}
