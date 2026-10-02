import React, { lazy, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatePresence, MotionConfig } from 'framer-motion';
import Cursor from './components/Cursor.jsx';
import Header from './components/Header.jsx';
import Marquee from './components/Marquee.jsx';
import Preloader from './components/Preloader.jsx';
import ScrollTop from './components/ScrollTop.jsx';
import TouchLight from './components/TouchLight.jsx';
import { Safe3D } from './components/ui.jsx';
import Hero from './sections/Hero.jsx';
import About from './sections/About.jsx';
import Work from './sections/Work.jsx';
import Arcade from './sections/Arcade.jsx';
import { Contact, Footer } from './sections/Contact.jsx';
import { introSkipped } from './lib/intro.js';
import { scrollToId, startSmoothScroll } from './lib/scroll.js';
import './styles.css';

const Starfield = lazy(() => import('./three/Starfield.jsx'));

function App() {
  const [loading, setLoading] = useState(() => !introSkipped());
  const done = useCallback(() => setLoading(false), []);

  useEffect(() => startSmoothScroll(), []);
  // In-page links glide through Lenis and move focus to the section they name.
  useEffect(() => {
    const onClick = event => {
      const link = event.target.closest?.('a[href^="#"]');
      if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey) return;
      const id = link.getAttribute('href').slice(1);
      if (!id || !document.getElementById(id)) return;
      event.preventDefault();
      scrollToId(id);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  return <MotionConfig reducedMotion="user">
    <a className="skip-link" href="#main">Skip to content</a>
    <AnimatePresence>{loading && <Preloader key="preloader" onDone={done} />}</AnimatePresence>
    <div className="space" aria-hidden="true" />
    <Safe3D><Starfield /></Safe3D>
    <div className="grain" aria-hidden="true" />
    <Cursor />
    <TouchLight />
    <Header ready={!loading} />
    <main id="main">
      <Hero ready={!loading} />
      <Marquee />
      <About />
      <Work />
      <Arcade />
      <Contact />
    </main>
    <Footer />
    <ScrollTop />
  </MotionConfig>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
