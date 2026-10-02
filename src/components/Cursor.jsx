import { useEffect, useRef, useState } from 'react';
import { finePointer } from './ui.jsx';

// A dot that tracks exactly and a ring that trails it; [data-cursor] elements put a label in the ring.
// Cards under the pointer catch its light: --mx/--my place their glow and rim (see "Ambient details" in the CSS).
export default function Cursor() {
  const dot = useRef(null);
  const ring = useRef(null);
  const [label, setLabel] = useState('');
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !finePointer()) return;
    document.documentElement.classList.add('has-cursor');
    let x = -100, y = -100, rx = x, ry = y, raf = 0;
    const move = event => {
      x = event.clientX; y = event.clientY;
      dot.current.classList.add('on');
      ring.current.classList.add('on');
      const labelled = event.target.closest?.('[data-cursor]');
      setLabel(labelled ? labelled.getAttribute('data-cursor') : '');
      ring.current.classList.toggle('hover', Boolean(event.target.closest?.('a, button, input, textarea, label, [role="application"]')));
      const card = event.target.closest?.('.card, .pcard');
      if (card) {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${x - rect.left}px`);
        card.style.setProperty('--my', `${y - rect.top}px`);
      }
    };
    const leave = () => { dot.current.classList.remove('on'); ring.current.classList.remove('on'); };
    const down = () => ring.current.classList.add('down');
    const up = () => ring.current.classList.remove('down');
    const tick = () => {
      rx += (x - rx) * 0.16; ry += (y - ry) * 0.16;
      dot.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      ring.current.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    document.addEventListener('pointerleave', leave);
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      document.documentElement.classList.remove('has-cursor');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      document.removeEventListener('pointerleave', leave);
    };
  }, []);
  return <>
    <div className="cursor-dot" ref={dot} aria-hidden="true" />
    <div className={label ? 'cursor-ring labelled' : 'cursor-ring'} ref={ring} aria-hidden="true"><span>{label}</span></div>
  </>;
}
