import React, { Suspense, useEffect, useRef } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring } from 'framer-motion';

export const finePointer = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;
export const ease = [0.22, 1, 0.36, 1];

// Keeps the page alive if a 3D chunk fails to download or throws.
export class Safe3D extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback ?? null : <Suspense fallback={this.props.fallback ?? null}>{this.props.children}</Suspense>; }
}

// Pulls its child toward the cursor, then springs back.
export function Magnetic({ children, strength = 0.35, className = '' }) {
  const ref = useRef(null);
  const x = useSpring(useMotionValue(0), { stiffness: 220, damping: 16, mass: 0.4 });
  const y = useSpring(useMotionValue(0), { stiffness: 220, damping: 16, mass: 0.4 });
  const reduce = useReducedMotion();
  const move = event => {
    if (reduce || !finePointer()) return;
    const rect = ref.current.getBoundingClientRect();
    x.set((event.clientX - rect.left - rect.width / 2) * strength);
    y.set((event.clientY - rect.top - rect.height / 2) * strength);
  };
  const leave = () => { x.set(0); y.set(0); };
  return <motion.span ref={ref} className={`magnetic ${className}`} style={{ x, y }} onPointerMove={move} onPointerLeave={leave}>{children}</motion.span>;
}

// Words slide up from behind a mask as the heading enters the viewport.
export function RevealText({ as = 'h2', children, className = '', delay = 0 }) {
  const Tag = motion[as];
  const parts = React.Children.toArray(children).flatMap((child, index) => typeof child === 'string'
    ? child.split(/(\s+)/).filter(Boolean).map((word, i) => (/^\s+$/.test(word) ? ' ' : { key: `${index}-${i}`, node: word }))
    : [{ key: `${index}-el`, node: child }]);
  return <Tag className={`reveal-text ${className}`} initial="hidden" whileInView="shown" viewport={{ once: true, margin: '0px 0px -12% 0px' }} transition={{ staggerChildren: 0.06, delayChildren: delay }}>
    {parts.map((part, i) => part === ' ' ? ' ' : <span className="word-mask" key={part.key ?? i}><motion.span className="word" variants={{ hidden: { y: '110%', rotate: 4 }, shown: { y: '0%', rotate: 0, transition: { duration: 0.9, ease } } }}>{part.node}</motion.span></span>)}
  </Tag>;
}

export function Kicker({ index, children }) {
  return <motion.span className="kicker" initial={{ opacity: 0, x: -16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.7, ease }}>[ {index} ] {children}</motion.span>;
}

export function FadeUp({ children, delay = 0, className = '', as = 'div', ...props }) {
  const Tag = motion[as];
  return <Tag className={className} initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '0px 0px -8% 0px' }} transition={{ duration: 0.9, ease, delay }} {...props}>{children}</Tag>;
}

// Pointer-driven 3D tilt with a moving highlight (reads --mx/--my in CSS).
export function useTilt(max = 10) {
  const ref = useRef(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches || !finePointer()) return;
    const move = event => {
      const rect = element.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;
      element.style.setProperty('--rx', `${(-py * max).toFixed(2)}deg`);
      element.style.setProperty('--ry', `${(px * max).toFixed(2)}deg`);
      element.style.setProperty('--mx', `${((px + 0.5) * 100).toFixed(1)}%`);
      element.style.setProperty('--my', `${((py + 0.5) * 100).toFixed(1)}%`);
    };
    const leave = () => { element.style.setProperty('--rx', '0deg'); element.style.setProperty('--ry', '0deg'); };
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerleave', leave);
    return () => { element.removeEventListener('pointermove', move); element.removeEventListener('pointerleave', leave); };
  }, [max]);
  return ref;
}

export function Github({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 19c-4.3 1.3-4.3-2.2-6-2.7m12 5v-3.4c.1-1-.3-1.8-.8-2.2 2.8-.3 5.8-1.4 5.8-6.2 0-1.4-.5-2.5-1.3-3.4.1-.3.6-1.6-.1-3.4 0 0-1.1-.4-3.6 1.3a12 12 0 0 0-6 0C6.5 2.3 5.4 2.7 5.4 2.7c-.7 1.8-.2 3.1-.1 3.4C4.5 7 4 8.1 4 9.5c0 4.8 3 5.9 5.8 6.2-.5.4-.9 1.3-.8 2.2v3.4" /></svg>; }
export function Linkedin({ size = 24 }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M7 10v7M11 17v-7m0 3a3 3 0 0 1 6 0v4" /><circle cx="7" cy="7" r=".5" fill="currentColor" /></svg>; }
