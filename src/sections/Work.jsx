import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion, useScroll, useSpring, useTransform } from 'framer-motion';
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Check, GraduationCap, ListChecks, Lock, MapPin, Plane, Rocket, TrendingUp, Wallet, X } from 'lucide-react';
import { FadeUp, Github, Kicker, Magnetic, RevealText, ease, useTilt } from '../components/ui.jsx';
import { filters, github, projects } from '../data.js';
import { pauseScroll, resumeScroll, scrollToY } from '../lib/scroll.js';

const icons = { map: MapPin, book: BookOpen, plane: Plane, rocket: Rocket, tasks: ListChecks, trend: TrendingUp, cap: GraduationCap, wallet: Wallet, calendar: CalendarDays };
const number = project => String(projects.indexOf(project) + 1).padStart(2, '0');
const host = url => url.replace(/^https?:\/\//, '').replace(/\/$/, '');
// Set on pointer-down so the focus that follows a click is not treated as keyboard focus.
const pointerFocus = { current: false };
const markPointerFocus = () => { pointerFocus.current = true; setTimeout(() => { pointerFocus.current = false; }); };

function useMedia(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return matches;
}

function BrowserMock({ project }) {
  const Icon = icons[project.icon];
  return <div className="mock" aria-hidden="true">
    <div className="mock-bar"><i /><i /><i /><span>{project.url ? host(project.url) : 'private deployment'}</span></div>
    <div className="mock-body">
      <div className="mock-side"><b /><i /><i /><i /><i /></div>
      <div className="mock-main">
        <div className="mock-tiles"><span className="mock-tile hot"><Icon size={26} strokeWidth={1.6} /></span><span className="mock-tile" /><span className="mock-tile" /></div>
        <div className="mock-chart"><svg viewBox="0 0 300 110" preserveAspectRatio="none"><path d="M0 92 C34 84 50 50 84 58 C118 66 134 28 168 36 C202 44 218 14 252 20 C276 25 292 10 300 6" /></svg></div>
        <div className="mock-rows"><i /><i /></div>
      </div>
    </div>
  </div>;
}

function ProjectCard({ project, onOpen, onFocus }) {
  const tilt = useTilt(8);
  return <motion.article layout layoutId={`card-${project.id}`} className="pcard" style={{ '--tone': project.color }} initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.6, ease }}>
    <button type="button" className="pcard-hit" onPointerDown={markPointerFocus} onClick={() => onOpen(project)} onFocus={onFocus} aria-label={`Open ${project.name}`} data-cursor="Open" />
    <div className="pcard-top">
      <span className="chips"><span className="chip chip-tone">{project.filter}</span><span className="chip">{project.role}</span></span>
      <span className="pcard-num outline-text">{number(project)}</span>
    </div>
    <div className="pcard-mock tilt" ref={tilt}><BrowserMock project={project} /></div>
    <div className="pcard-bottom">
      <motion.h3 layoutId={`title-${project.id}`}>{project.name}</motion.h3>
      <p className="pcard-type">{project.type}</p>
      <div className="pcard-foot">
        <span className="tags">{project.tags.slice(0, 3).map(tag => <span key={tag}>{tag}</span>)}</span>
        <span className="pcard-open">Open file <ArrowUpRight size={16} /></span>
      </div>
    </div>
  </motion.article>;
}

function ProjectModal({ project, list, onClose, onStep }) {
  const close = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    close.current?.focus({ preventScroll: true });
    pauseScroll();
    document.documentElement.classList.add('modal-open');
    const onKey = event => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') onStep(1);
      if (event.key === 'ArrowLeft') onStep(-1);
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('modal-open');
      resumeScroll();
      previous?.focus?.({ preventScroll: true });
    };
  }, [onClose, onStep]);
  const Icon = icons[project.icon];
  const index = list.indexOf(project);
  return <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
    <motion.div layoutId={`card-${project.id}`} className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" style={{ '--tone': project.color }} onClick={event => event.stopPropagation()} transition={{ duration: 0.55, ease }} data-lenis-prevent>
      <div className="modal-glow" aria-hidden="true" />
      <div className="modal-top">
        <span className="chips"><span className="chip chip-tone">{project.filter}</span><span className="chip">{project.role}</span></span>
        <button type="button" ref={close} className="icon-btn" onClick={onClose} aria-label="Close project"><X size={20} /></button>
      </div>
      <div className="modal-grid">
        <motion.div className="modal-copy" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6, ease }} key={project.id}>
          <span className="modal-num outline-text" aria-hidden="true">{number(project)}</span>
          <motion.h3 id="modal-title" layoutId={`title-${project.id}`}>{project.name}</motion.h3>
          <p className="pcard-type">{project.type}</p>
          <p className="modal-desc">{project.description}</p>
          <ul className="feature-list">{project.features.map(feature => <li key={feature}><Check size={17} />{feature}</li>)}</ul>
          <div className="tags">{project.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
          <div className="modal-actions">
            {project.url
              ? <Magnetic><a className="btn btn-light" href={project.url} target="_blank" rel="noreferrer">{project.url.includes('github.com') ? 'Explore the code' : 'Visit project'} <ArrowUpRight size={18} /></a></Magnetic>
              : <p className="private-note"><Lock size={16} /> Business application · Public demo unavailable</p>}
          </div>
        </motion.div>
        <motion.div className="modal-visual" initial={{ opacity: 0, rotateY: -25, x: 40 }} animate={{ opacity: 1, rotateY: -12, x: 0 }} transition={{ delay: 0.25, duration: 0.8, ease }} key={`v-${project.id}`}>
          <BrowserMock project={project} />
          <span className="modal-badge" aria-hidden="true"><Icon size={34} strokeWidth={1.6} /></span>
        </motion.div>
      </div>
      {list.length > 1 && <div className="modal-nav">
        <span className="mono">{String(index + 1).padStart(2, '0')} / {String(list.length).padStart(2, '0')}</span>
        <span>
          <button type="button" className="icon-btn" onClick={() => onStep(-1)} aria-label="Previous project"><ArrowLeft size={19} /></button>
          <button type="button" className="icon-btn solid" onClick={() => onStep(1)} aria-label="Next project"><ArrowRight size={19} /></button>
        </span>
      </div>}
    </motion.div>
  </motion.div>;
}

export default function Work() {
  const [filter, setFilter] = useState('All');
  const [open, setOpen] = useState(null);
  const wide = useMedia('(min-width: 900px)');
  const wrap = useRef(null);
  const track = useRef(null);
  const [distance, setDistance] = useState(0);
  const list = projects.filter(project => filter === 'All' || project.filter === filter);

  useLayoutEffect(() => {
    if (!wide) { setDistance(0); return; }
    const measure = () => setDistance(Math.max(0, track.current.scrollWidth - window.innerWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track.current);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [wide, filter]);

  const { scrollYProgress } = useScroll({ target: wrap, offset: ['start start', 'end end'] });
  const smooth = useSpring(scrollYProgress, { stiffness: 160, damping: 32, mass: 0.35 });
  const x = useTransform(smooth, value => -value * distance);
  const bar = useTransform(smooth, [0, 1], [0, 1]);

  // Keyboard focus on an off-screen card scrolls the page until the track brings it into view.
  // Pointer presses also focus the card, but must not move the page between mouse-down and click.
  const focusCard = event => {
    if (pointerFocus.current) return;
    if (!wide || !distance) return;
    const sticky = wrap.current.querySelector('.work-sticky');
    sticky.scrollLeft = 0;
    const card = event.currentTarget.closest('.pcard');
    const target = Math.min(distance, Math.max(0, card.offsetLeft - (window.innerWidth - card.offsetWidth) / 2));
    const top = wrap.current.getBoundingClientRect().top + window.scrollY;
    scrollToY(top + (target / distance) * (wrap.current.offsetHeight - window.innerHeight));
  };

  const onClose = useCallback(() => setOpen(null), []);
  const onStep = useCallback(step => setOpen(current => {
    if (!current) return current;
    const visible = projects.filter(project => filter === 'All' || project.filter === filter);
    return visible[(visible.indexOf(current) + step + visible.length) % visible.length];
  }), [filter]);

  return <section id="work" className="work">
    <div className="shell section-head">
      <div>
        <Kicker index="02">Mission files</Kicker>
        <RevealText>Things I've <em>launched</em></RevealText>
      </div>
      <FadeUp className="filters" role="group" aria-label="Filter projects">
        {filters.map(item => <button type="button" key={item} className={filter === item ? 'filter active' : 'filter'} aria-pressed={filter === item} onClick={() => setFilter(item)}>
          {filter === item && <motion.span className="filter-pill" layoutId="filter-pill" transition={{ type: 'spring', stiffness: 400, damping: 34 }} />}
          <span>{item}</span><small>{projects.filter(project => item === 'All' || project.filter === item).length}</small>
        </button>)}
      </FadeUp>
    </div>

    <LayoutGroup>
      <div className="work-wrap" ref={wrap} style={wide ? { height: `calc(100vh + ${distance}px)` } : undefined}>
        <div className="work-sticky">
          <motion.div className="work-track" ref={track} style={wide ? { x } : undefined}>
            <div className="work-intro" aria-hidden={!wide}>
              <strong>{list.length}</strong>
              <p>{list.length === 1 ? 'mission' : 'missions'} on file.<br />{wide ? 'Keep scrolling to fly through them.' : 'Tap any file to open it.'}</p>
              {wide && <span className="work-arrow"><ArrowRight size={22} /></span>}
            </div>
            <AnimatePresence mode="popLayout">
              {list.map(project => <ProjectCard key={project.id} project={project} onOpen={setOpen} onFocus={focusCard} />)}
            </AnimatePresence>
            <a className="work-outro" href={github} target="_blank" rel="noreferrer" data-cursor="GitHub">
              <Github size={34} />
              <strong>Want the full logbook?</strong>
              <span>More experiments on GitHub <ArrowUpRight size={16} /></span>
            </a>
          </motion.div>
          {wide && <div className="work-progress" aria-hidden="true"><motion.i style={{ scaleX: bar }} /></div>}
        </div>
      </div>
      <AnimatePresence>
        {open && <ProjectModal key="modal" project={open} list={list} onClose={onClose} onStep={onStep} />}
      </AnimatePresence>
    </LayoutGroup>
  </section>;
}
