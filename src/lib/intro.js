// The launch intro covers the page while the heavy start-up work happens: web fonts, WebGL set-up and
// shader compiles. Each 3D scene reports in with introDone(), and the countdown only starts once all of
// them have finished (or a time limit passes), so none of that work competes with the intro animations.
const JOBS = ['starfield', 'raccoon', 'mothership', 'arcade'];
const FONTS = ['800 1em Unbounded', '1em Geist', '1em "Geist Mono"', 'italic 1em "Instrument Serif"'];

const jobs = new Map(JOBS.map(name => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return [name, { promise, resolve }];
}));

export const introSkipped = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches || /[?&]nointro\b/.test(location.search);

// Marks a start-up job as finished. Calling it again does nothing.
export const introDone = name => jobs.get(name)?.resolve();

// Resolves once the fonts and every job are ready, or after `limit` ms, whichever comes first.
export function introReady(limit) {
  const fonts = Promise.all(FONTS.map(font => document.fonts.load(font))).catch(() => {});
  const ready = Promise.all([fonts, ...[...jobs.values()].map(job => job.promise)]);
  return Promise.race([ready, new Promise(resolve => setTimeout(resolve, limit))]);
}
