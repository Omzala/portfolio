import { useEffect } from 'react';
import { finePointer } from './ui.jsx';

const noop = () => {};

// The touch-screen stand-in for the cursor's light: a card glows and its rim lights up under your finger,
// follows it while it moves, then fades once you let go (see "Touch screens" in the CSS).
export default function TouchLight() {
  useEffect(() => {
    if (finePointer() || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let lit = null;
    let timer = 0;
    const place = event => {
      const rect = lit.getBoundingClientRect();
      lit.style.setProperty('--mx', `${event.clientX - rect.left}px`);
      lit.style.setProperty('--my', `${event.clientY - rect.top}px`);
    };
    const down = event => {
      const card = event.target.closest?.('.card, .pcard, .social');
      if (!card) return;
      clearTimeout(timer);
      if (lit !== card) lit?.classList.remove('lit');
      lit = card;
      place(event);
      card.classList.add('lit');
    };
    const move = event => { if (lit) place(event); };
    const up = () => {
      const card = lit;
      clearTimeout(timer);
      timer = setTimeout(() => { card?.classList.remove('lit'); if (lit === card) lit = null; }, 380);
    };
    document.addEventListener('pointerdown', down, { passive: true });
    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    // iOS Safari only applies :active styles (the button and card presses) once a touch listener exists.
    document.addEventListener('touchstart', noop, { passive: true });
    return () => {
      clearTimeout(timer);
      lit?.classList.remove('lit');
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      document.removeEventListener('touchstart', noop);
    };
  }, []);
  return null;
}
