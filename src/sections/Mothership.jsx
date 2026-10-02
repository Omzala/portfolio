import { useEffect, useRef, useState } from 'react';
import { FadeUp, Kicker, RevealText } from '../components/ui.jsx';
import { introDone, introSkipped } from '../lib/intro.js';

// Bandit's mothership cruises through a wide band below the arcade: it glides across as the page
// scrolls past, escorted by two shuttles, beaming scrap up through its tractor beam.
export default function Mothership() {
  const stage = useRef(null);
  const speed = useRef(null);
  const scrap = useRef(null);
  const [failed, setFailed] = useState(false);

  // Like the arcade, the scene boots behind the intro curtain, or near the viewport without it.
  useEffect(() => {
    const element = stage.current;
    let cancelled = false;
    let ship = null;
    const boot = async () => {
      try {
        const { createMothership } = await import('../three/mothership.js');
        if (cancelled) return;
        ship = createMothership(element, { speed: speed.current, scrap: scrap.current });
        if (!ship) { setFailed(true); return; }
        await ship.ready;
      } catch { setFailed(true); }
      finally { introDone('mothership'); }
    };
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      boot();
    }, { rootMargin: '600px' });
    if (introSkipped()) observer.observe(element);
    else boot();
    return () => { cancelled = true; observer.disconnect(); ship?.dispose(); };
  }, []);

  return <section id="mothership" className="bay" aria-label="Bandit's mothership, the Trash Panda">
    <div className="bay-stage" ref={stage} aria-hidden="true" />
    <div className="bay-inner shell">
      <div className="bay-copy">
        <Kicker index="HQ">The mothership</Kicker>
        <RevealText>Home base: the <em>Trash Panda</em></RevealText>
        <FadeUp as="p" className="section-lede">Bandit's mothership. Every bit of scrap you grab in the arcade gets beamed up into its hangar.</FadeUp>
      </div>
      <FadeUp className="bay-telemetry">
        <div><span>Velocity</span><strong ref={speed}>0.42c</strong></div>
        <div><span>Scrap hauled</span><strong ref={scrap}>004 212</strong></div>
        <div><span>Escorts</span><strong>2 shuttles</strong></div>
        <div><span>Status</span><strong><i className="pulse-dot" /> {failed ? 'Out of range' : 'Cruising'}</strong></div>
      </FadeUp>
    </div>
  </section>;
}
