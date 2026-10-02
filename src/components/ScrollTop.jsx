import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useMotionValueEvent, useScroll, useSpring } from 'framer-motion';
import { ArrowUp } from 'lucide-react';
import { ease } from './ui.jsx';
import { scrollToId } from '../lib/scroll.js';

// A small orb that appears once you leave the hero; its ring fills with your progress down the page.
// It steps aside at the footer, which has its own "Back to orbit" button.
export default function ScrollTop() {
  const { scrollY, scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 24, mass: 0.3 });
  const [pastHero, setPastHero] = useState(false);
  const [atFooter, setAtFooter] = useState(false);
  useMotionValueEvent(scrollY, 'change', value => setPastHero(value > window.innerHeight * 0.8));
  useEffect(() => {
    const footer = document.querySelector('.footer');
    if (!footer) return;
    const observer = new IntersectionObserver(([entry]) => setAtFooter(entry.isIntersecting), { rootMargin: '0px 0px -120px 0px' });
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);
  return <AnimatePresence>
    {pastHero && !atFooter && <motion.button type="button" className="scroll-top" aria-label="Back to top" onClick={() => scrollToId('home')} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={{ duration: 0.4, ease }}>
      <svg className="scroll-top-ring" viewBox="0 0 52 52" aria-hidden="true">
        <circle cx="26" cy="26" r="24" />
        <motion.circle cx="26" cy="26" r="24" style={{ pathLength: progress }} />
      </svg>
      <ArrowUp size={18} />
    </motion.button>}
  </AnimatePresence>;
}
