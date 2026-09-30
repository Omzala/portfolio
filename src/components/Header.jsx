import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useScroll, useSpring } from 'framer-motion';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { Magnetic, ease } from './ui.jsx';
import { email, github, linkedin } from '../data.js';

export const sections = [['Home', 'home'], ['About', 'about'], ['Work', 'work'], ['Arcade', 'arcade'], ['Contact', 'contact']];

export function useIST() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const format = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
    const update = () => setTime(format.format(new Date()));
    update();
    const interval = setInterval(update, 15000);
    return () => clearInterval(interval);
  }, []);
  return time;
}

export default function Header({ ready }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState('home');
  const [scrolled, setScrolled] = useState(false);
  const time = useIST();
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 24, mass: 0.3 });

  useEffect(() => {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) setActive(entry.target.id); }), { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach(([, id]) => { const section = document.getElementById(id); if (section) observer.observe(section); });
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { observer.disconnect(); window.removeEventListener('scroll', onScroll); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = event => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', close);
    document.documentElement.classList.add('menu-open');
    return () => { document.removeEventListener('keydown', close); document.documentElement.classList.remove('menu-open'); };
  }, [open]);

  return <motion.header className={scrolled ? 'site-header scrolled' : 'site-header'} initial={{ y: -90, opacity: 0 }} animate={ready ? { y: 0, opacity: 1 } : {}} transition={{ duration: 0.9, ease, delay: 0.5 }}>
    <motion.div className="scroll-progress" style={{ scaleX: progress }} aria-hidden="true" />
    <a className="logo" href="#home" aria-label="Om Zala, back to top"><span className="logo-mark">oz</span><span className="logo-text">om zala</span></a>
    <nav className="nav-desktop" aria-label="Main navigation">
      {sections.map(([label, id]) => <a key={id} href={`#${id}`} className={active === id ? 'active' : ''} aria-current={active === id ? 'true' : undefined}>
        {active === id && <motion.span className="nav-pill" layoutId="nav-pill" transition={{ type: 'spring', stiffness: 380, damping: 32 }} />}
        <span className="nav-label">{label}</span>
      </a>)}
    </nav>
    <div className="header-end">
      <span className="header-time" aria-label={`Local time in Vadodara: ${time}`}>IST {time}</span>
      <Magnetic><a className="btn btn-accent btn-small nav-cta" href="#contact">Let's talk <ArrowUpRight size={16} /></a></Magnetic>
      <button type="button" className="icon-btn menu-btn" aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? 'Close navigation' : 'Open navigation'} onClick={() => setOpen(value => !value)}>{open ? <X size={20} /> : <Menu size={20} />}</button>
    </div>
    {createPortal(<AnimatePresence>
      {open && <motion.div id="mobile-menu" className="mobile-menu" initial={{ clipPath: 'circle(0% at 100% 0%)' }} animate={{ clipPath: 'circle(150% at 100% 0%)' }} exit={{ clipPath: 'circle(0% at 100% 0%)' }} transition={{ duration: 0.7, ease }}>
        <nav aria-label="Mobile navigation">
          {sections.map(([label, id], i) => <motion.a key={id} href={`#${id}`} className={active === id ? 'active' : ''} onClick={() => setOpen(false)} initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 + i * 0.06, duration: 0.6, ease }}>
            <small>0{i}</small>{label}
          </motion.a>)}
        </nav>
        <div className="mobile-menu-foot">
          <a href={`mailto:${email}`}>{email}</a>
          <span><a href={github} target="_blank" rel="noreferrer">GitHub</a> · <a href={linkedin} target="_blank" rel="noreferrer">LinkedIn</a></span>
        </div>
      </motion.div>}
    </AnimatePresence>, document.body)}
  </motion.header>;
}
