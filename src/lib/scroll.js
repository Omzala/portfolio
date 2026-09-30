import Lenis from 'lenis';

let lenis = null;
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Inertia scrolling for the whole page. Returns a cleanup function.
export function startSmoothScroll() {
  if (reduced()) return () => {};
  lenis = new Lenis({ duration: 1.1, smoothWheel: true, wheelMultiplier: 0.95 });
  let raf = requestAnimationFrame(function loop(time) { lenis?.raf(time); raf = requestAnimationFrame(loop); });
  return () => { cancelAnimationFrame(raf); lenis?.destroy(); lenis = null; };
}

// Glides to a section and moves keyboard focus there, like a native in-page link would.
export function scrollToId(id) {
  const target = document.getElementById(id);
  if (!target) return;
  if (lenis) lenis.scrollTo(target, { duration: 1.4 });
  else target.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth' });
  if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
  target.focus({ preventScroll: true });
  history.replaceState(null, '', `${location.pathname}${location.search}${id === 'home' ? '' : `#${id}`}`);
}

// Jumps straight to a page offset (used to bring a focused card into view).
export function scrollToY(y) {
  if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
  else window.scrollTo({ top: y, behavior: 'instant' });
}

export const pauseScroll = () => lenis?.stop();
export const resumeScroll = () => lenis?.start();
