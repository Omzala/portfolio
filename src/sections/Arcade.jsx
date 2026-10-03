import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useReducedMotion } from 'framer-motion';
import { ArrowUp, Crown, Flame, Gauge, Hourglass, Magnet, Rocket, RotateCcw, Smartphone, Sparkles, Trophy, UserRound, Zap } from 'lucide-react';
import { FadeUp, Kicker, RevealText, ease } from '../components/ui.jsx';
import { introDone, introSkipped } from '../lib/intro.js';
import { POWERS, SECTOR_BONUS, SECTOR_SECONDS, SECTORS } from '../lib/arcade.js';
import { TIERS, TOP, claimRun, finishRun, loadBoard, rememberedName, startRun, tierFor } from '../lib/leaderboard.js';

const KEYS = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down' };
const PERIODS = [['all', 'All time'], ['week', 'This week'], ['day', 'Today']];
const POWER_ICONS = { magnet: Magnet, overdrive: Zap, chrono: Hourglass };
const EMPTY_HUD = { score: 0, combo: 1, shields: 3, speed: 0, sector: 0, loop: 0, progress: 0, warp: false, power: null, powerLeft: 0, multiplier: 1 };
const pad = value => String(value).padStart(6, '0');
const two = value => String(value).padStart(2, '0');
const clock = seconds => `${Math.floor(seconds / 60)}:${two(Math.floor(seconds % 60))}`;
const panelMotion = { initial: { opacity: 0, y: 30, scale: 0.96 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, scale: 0.96 } };
// Every pilot gets a stable colour and monogram from their callsign.
const hue = name => [...name.toLowerCase()].reduce((total, char) => (total * 31 + char.charCodeAt(0)) % 360, 17);
const initials = name => name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => [...word][0]).join('').toUpperCase() || '?';

function resetsIn(iso) {
  const minutes = Math.max(1, Math.round((new Date(iso) - Date.now()) / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

/* ───────────── In-flight overlays ───────────── */

// Owns the per-tick numbers, so ten updates a second never re-render the rest of the arcade.
function Hud({ connect, phase }) {
  const [hud, setHud] = useState(EMPTY_HUD);
  const [hits, setHits] = useState(0);
  const shields = useRef(3);
  useEffect(() => {
    connect.current = next => {
      if (next.shields < shields.current) setHits(count => count + 1);
      shields.current = next.shields;
      setHud(next);
    };
    return () => { connect.current = null; };
  }, [connect]);
  const sector = SECTORS[hud.sector];
  const power = hud.power && POWERS[hud.power];
  const PowerIcon = hud.power && POWER_ICONS[hud.power];
  return <div className={phase === 'playing' || phase === 'countdown' ? 'hud live' : 'hud'} aria-hidden="true" style={{ '--sector': sector.color }}>
    <div className="hud-score">
      <small>Score</small>
      <strong>{pad(hud.score)}</strong>
      <span className={hud.combo > 1 ? 'hud-combo hot' : 'hud-combo'}><Flame size={12} /> ×{hud.combo}{hud.multiplier > 1 && <em>scrap ×{hud.multiplier}</em>}</span>
    </div>
    <div className={hud.warp ? 'hud-sector warping' : 'hud-sector'}>
      <span className="hud-sector-name"><i />{hud.warp ? 'Warp jump' : <>Sector {two(hud.sector + 1)}<b>{sector.name}</b></>}{hud.loop > 0 && <em>Loop {hud.loop + 1}</em>}</span>
      <span className="hud-track"><i style={{ transform: `scaleX(${hud.progress})` }} /></span>
    </div>
    <div className="hud-shields-box">
      <small>Shields</small>
      <span key={hits} className={hits ? 'hud-shields hit' : 'hud-shields'}>{[0, 1, 2].map(i => <i key={i} className={i < hud.shields ? 'on' : ''} />)}</span>
    </div>
    <AnimatePresence>
      {power && <motion.div key={hud.power} className="hud-power" style={{ '--power': power.color }} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 14 }} transition={{ duration: 0.35, ease }}>
        <span className="hud-power-ring">
          <svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" /><circle cx="18" cy="18" r="15" style={{ strokeDashoffset: 94.25 * (1 - hud.powerLeft) }} /></svg>
          <PowerIcon size={15} />
        </span>
        <span><b>{power.name}</b><small>{Math.max(1, Math.ceil(hud.powerLeft * power.seconds))}s</small></span>
      </motion.div>}
    </AnimatePresence>
    <div className="hud-speed"><Gauge size={14} /> {hud.speed.toLocaleString('en')}<small>km/s</small></div>
  </div>;
}

// Sector arrivals and power-ups get a moment centre stage; hits are announced to screen readers.
function Banner({ connect, phase }) {
  const [banner, setBanner] = useState(null);
  const [said, setSaid] = useState('');
  useEffect(() => {
    connect.current = event => {
      if (event.type === 'sector') {
        const sector = SECTORS[event.sector];
        setBanner({ id: performance.now(), kicker: `Sector ${two(event.sector + 1)}${event.loop ? ` · Loop ${event.loop + 1}` : ''}`, title: sector.name, sub: sector.rule, color: sector.color });
        setSaid(`Sector ${event.sector + 1}: ${sector.name}. ${sector.rule}`);
      } else if (event.type === 'power') {
        const power = POWERS[event.power];
        setBanner({ id: performance.now(), kicker: 'Power-up', title: `${power.name} online`, sub: power.rule, color: power.color });
        setSaid(`${power.name} online. ${power.rule}`);
      } else if (event.type === 'hit') {
        setSaid(event.shields > 0 ? `Hit. ${event.shields} shield${event.shields === 1 ? '' : 's'} left.` : 'Ship down.');
      }
    };
    return () => { connect.current = null; };
  }, [connect]);
  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setBanner(null), 2600);
    return () => clearTimeout(timer);
  }, [banner]);
  return <>
    <span className="sr-only" aria-live="polite">{phase === 'playing' ? said : ''}</span>
    {/* One banner at a time: a new one waits for the last to slip away rather than printing over it. */}
    <AnimatePresence mode="wait">
      {banner && phase === 'playing' && <motion.div key={banner.id} className="stage-banner" style={{ '--tone': banner.color }} initial={{ opacity: 0, y: -18, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.5, ease } }} exit={{ opacity: 0, y: -10, scale: 0.98, transition: { duration: 0.2, ease } }}>
        <span className="banner-kicker">{banner.kicker}</span>
        <strong>{banner.title}</strong>
        <span className="banner-sub">{banner.sub}</span>
      </motion.div>}
    </AnimatePresence>
  </>;
}

function CountUp({ value }) {
  const node = useRef(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) { node.current.textContent = pad(value); return undefined; }
    const controls = animate(0, value, { duration: 1.3, ease: [0.16, 1, 0.3, 1], onUpdate: latest => { if (node.current) node.current.textContent = pad(Math.round(latest)); } });
    return () => controls.stop();
  }, [value, reduce]);
  return <span ref={node}>{pad(reduce ? value : 0)}</span>;
}

function TierProgress({ score }) {
  const tier = tierFor(score);
  if (!tier.next) return <span className="tier-progress"><span className="tier-bar"><i style={{ transform: 'scaleX(1)' }} /></span><small>Top tier: {tier.name}</small></span>;
  const from = TIERS[tier.level].min;
  const share = (score - from) / (TIERS[tier.level + 1].min - from);
  return <span className="tier-progress"><span className="tier-bar"><i style={{ transform: `scaleX(${share})` }} /></span><small>{tier.next.needed} pts to {tier.next.name}</small></span>;
}

/* ───────────── Leaderboard ───────────── */

function Avatar({ name, className = 'avatar' }) {
  return <span className={className} style={{ '--hue': hue(name) }} aria-hidden="true">{initials(name)}</span>;
}

function Seat({ row, place }) {
  const tier = tierFor(row.score);
  return <motion.li layout className={`seat p${place}${row.me ? ' me' : ''}`} initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease, delay: place * 0.06 }}>
    <span className="seat-avatar-wrap">
      {place === 1 && <Crown className="seat-crown" size={18} aria-hidden="true" />}
      <Avatar name={row.name} className="seat-avatar" />
    </span>
    <span className="who">{row.name}{row.me && <small className="you-tag">you</small>}</span>
    <span className="pts">{pad(row.score)}</span>
    <span className={`tier t${tier.level}`}>{tier.name}</span>
    <span className="seat-base"><span className="sr-only">Rank </span>{row.rank}</span>
  </motion.li>;
}

function OpenSeat({ place }) {
  return <li className={`seat p${place} open`}>
    <span className="seat-avatar-wrap"><span className="seat-avatar">?</span></span>
    <span className="who">{place === 1 ? 'Your name here' : 'Open seat'}</span>
    <span className="pts">{place === 1 ? 'claim it' : '000000'}</span>
    <span className="seat-base"><span className="sr-only">Rank </span>{place}</span>
  </li>;
}

function BoardRow({ row, top, delay }) {
  const tier = tierFor(row.score);
  return <motion.li layout className={row.me ? 'row me' : 'row'} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, ease, delay }}>
    <span className="rank">{row.rank}</span>
    <Avatar name={row.name} />
    <span className="who">{row.name}{row.me && <small className="you-tag">you</small>}<small className={`row-tier t${tier.level}`}>{tier.name}{row.bestCombo > 1 && <> · ×{row.bestCombo}</>}</small></span>
    <span className="pts">{pad(row.score)}</span>
    <i className="row-bar" aria-hidden="true" style={{ transform: `scaleX(${Math.max(0.04, row.score / top)})` }} />
  </motion.li>;
}

const Leaderboard = memo(function Leaderboard({ board, period, onPeriod }) {
  const scores = board.scores ?? [];
  const top = scores[0]?.score || 1;
  const meOutside = board.me && !scores.some(row => row.me);
  const filled = Math.max(3, scores.length);
  const blanks = Math.max(0, TOP - filled - (meOutside ? 2 : 0));
  return <div className="card board">
    <div className="board-head">
      <span className="board-title">
        <span className="board-icon"><Trophy size={19} /></span>
        <span><strong>Top pilots</strong><small>{board.total ? `${board.total} pilot${board.total === 1 ? '' : 's'} on this board` : 'No flights yet. Be the first.'}</small></span>
      </span>
      <span className={`board-mode ${board.mode}`}>{board.mode === 'global' ? <><i className="live-dot" /> Global</> : board.mode === 'local' ? <><Smartphone size={13} /> This device</> : 'Loading…'}</span>
    </div>
    <div className="board-tabs" role="group" aria-label="Leaderboard period">
      {PERIODS.map(([value, label]) => <button key={value} type="button" aria-pressed={period === value} className={period === value ? 'on' : ''} onClick={() => onPeriod(value)}>
        {period === value && <motion.span className="board-tab-pill" layoutId="board-tab" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
        <span>{label}</span>
      </button>)}
    </div>
    <ol className="board-list" aria-busy={board.mode === 'loading'}>
      {[0, 1, 2].map(i => scores[i] ? <Seat key={scores[i].key} row={scores[i]} place={i + 1} /> : <OpenSeat key={`open-${i}`} place={i + 1} />)}
      {scores.slice(3).map((row, i) => <BoardRow key={row.key} row={row} top={top} delay={i * 0.03} />)}
      {meOutside && <><li className="gap" aria-hidden="true">⋯</li><BoardRow key="me" row={{ ...board.me, me: true }} top={top} delay={0.2} /></>}
      {Array.from({ length: blanks }, (_, i) => <li key={`empty-${i}`} className="row empty"><span className="rank">{filled + i + 1}</span><span className="avatar" aria-hidden="true" /><span className="who">— — —</span><span className="pts">000000</span></li>)}
    </ol>
    {board.me && <div className="board-me">
      <Avatar name={board.me.name} />
      <span>You're <b>#{board.me.rank}</b>{board.total >= 10 && board.me.topPercent <= 50 && <> · top {board.me.topPercent}%</>}<small>{board.me.ahead ? `${board.me.ahead.gap} pts to pass ${board.me.ahead.name}` : 'Nobody above you. Hold the line.'}</small></span>
    </div>}
    <p className="board-note">
      {board.resetsAt ? <>Resets in {resetsIn(board.resetsAt)} · </> : null}
      {board.mode === 'local' ? 'Scores are saved in this browser.' : 'A cookie remembers your pilot on this device. No sign-up needed.'}
    </p>
  </div>;
});

/* ───────────── Field guide ───────────── */

const icon = children => <svg viewBox="0 0 24 24" aria-hidden="true">{children}</svg>;
const GUIDE = {
  pickups: [
    { name: 'Scrap', text: '10 × combo. Chain them.', tone: '#5be7da', art: icon(<><path d="M12 2.5 20.5 7.3v9.4L12 21.5 3.5 16.7V7.3z" /><circle cx="12" cy="12" r="3.6" /></>) },
    { name: 'Core', text: 'Flat 50, worth more each loop.', tone: '#ff6a2b', art: icon(<><circle cx="12" cy="12" r="4.6" className="fill" /><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-25 12 12)" /></>) },
    { name: 'Shield cell', text: 'Patches one hit back up.', tone: '#f3f0e8', art: icon(<><path d="M12 2 20 12 12 22 4 12Z" /><path d="M12 8 15 12 12 16 9 12Z" className="fill" /></>) },
    ...Object.entries(POWERS).map(([type, power]) => ({ name: power.name, text: `${power.rule} ${power.seconds}s.`, tone: power.color, Icon: POWER_ICONS[type] })),
  ],
  hazards: [
    { name: 'Rock', text: 'Costs a shield and your combo.', tone: '#9a8f96', art: icon(<path d="M5.7 3.6 16.1 2l6.8 7.3-2.1 9.4-9.9 3.1-8.8-5.2L1 7.7Z" className="fill" />) },
    { name: 'Ion mine', text: 'Nebula. Drifts towards you.', tone: '#ff5fd2', art: icon(<><circle cx="12" cy="12" r="5" className="fill" />{[0, 45, 90, 135, 180, 225, 270, 315].map(a => <path key={a} d="M12 4.2V1.5" transform={`rotate(${a} 12 12)`} />)}</>) },
    { name: 'Girder', text: 'Wreckage. Spins, so time it.', tone: '#ffb547', art: icon(<><path d="M3 15.5 18.5 4l2.5 3.4L5.5 19z" className="fill" /><path d="M3 15.5 5.5 19M18.5 4 21 7.4" /></>) },
    { name: 'Meteor', text: 'Storm. Cuts in from the side.', tone: '#ff8a4c', art: icon(<><circle cx="15.5" cy="15.5" r="4.5" className="fill" /><path d="M12 12 4 4M13.5 9.5 8 4M9.5 13.5 4 8" /></>) },
    { name: 'Warning ring', text: 'Where a hazard will cross. Red: move.', tone: '#ff5a46', art: icon(<><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="2" className="fill" /></>) },
  ],
};

function FieldGuide() {
  const [tab, setTab] = useState('pickups');
  return <div className="card guide">
    <div className="guide-head">
      <strong>Field guide</strong>
      <div className="guide-tabs" role="group" aria-label="Field guide section">
        {[['pickups', 'Pickups'], ['hazards', 'Hazards'], ['sectors', 'Sectors']].map(([value, label]) => <button key={value} type="button" aria-pressed={tab === value} className={tab === value ? 'on' : ''} onClick={() => setTab(value)}>{label}</button>)}
      </div>
    </div>
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.25, ease }}>
        {tab === 'sectors'
          ? <ol className="guide-sectors">
            {SECTORS.map((sector, i) => <li key={sector.id} style={{ '--tone': sector.color }}><span className="guide-num">{two(i + 1)}</span><span><strong>{sector.name}</strong><small>{sector.rule}</small></span></li>)}
            <li className="guide-note">Every {SECTOR_SECONDS}s you warp on (+{SECTOR_BONUS}). After the storm the belt comes round again, faster.</li>
          </ol>
          : <ul className="guide-grid">
            {GUIDE[tab].map(item => <li key={item.name} style={{ '--tone': item.tone }}>
              <span className="guide-icon">{item.Icon ? <item.Icon size={17} /> : item.art}</span>
              <span><strong>{item.name}</strong><small>{item.text}</small></span>
            </li>)}
          </ul>}
      </motion.div>
    </AnimatePresence>
  </div>;
}

/* ───────────── The arcade ───────────── */

export default function Arcade() {
  const host = useRef(null);
  const engine = useRef(null);
  const run = useRef(null);
  const flight = useRef(0);
  const hudApi = useRef(null);
  const bannerApi = useRef(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [count, setCount] = useState(3);
  const [debrief, setDebrief] = useState(null);
  const [landed, setLanded] = useState(null);
  const [claimed, setClaimed] = useState(null);
  const [name, setName] = useState(rememberedName);
  const [error, setError] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [period, setPeriod] = useState('all');
  const [board, setBoard] = useState({ mode: 'loading', scores: [] });
  const [profile, setProfile] = useState({ name: rememberedName(), best: 0, rank: null, flights: 0 });
  const [refresh, setRefresh] = useState(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const showBoard = useCallback(data => {
    setBoard(data);
    if (data.period !== 'all') return;
    setProfile(current => ({ name: data.pilot?.name || data.me?.name || current.name, best: data.me?.score ?? 0, rank: data.me?.rank ?? null, flights: data.pilot?.flights ?? current.flights }));
    if (data.pilot?.name) setName(value => value || data.pilot.name);
  }, []);

  useEffect(() => {
    let alive = true;
    loadBoard(period).then(data => { if (alive) showBoard(data); }).catch(() => { if (alive) setBoard({ mode: 'local', scores: [] }); });
    return () => { alive = false; };
  }, [period, refresh, showBoard]);

  const finish = useCallback(async summary => {
    const id = flight.current;
    setPhase('over');
    setDebrief(summary);
    setLanded({ score: summary.score, bestCombo: summary.bestCombo, saving: true });
    const result = await finishRun(await run.current, summary);
    if (flight.current !== id) return;
    setLanded(result);
    if (result.name) setName(value => value || result.name);
  }, []);

  // The 3D engine boots behind the intro curtain, so its WebGL set-up never interrupts a scroll.
  // Without the intro it loads once the arcade is close to the viewport.
  useEffect(() => {
    const element = host.current;
    let cancelled = false;
    const boot = async () => {
      try {
        const { createScavenger } = await import('../three/scavenger.js');
        if (cancelled) return;
        const instance = createScavenger(element, { onHud: data => hudApi.current?.(data), onEvent: event => bannerApi.current?.(event), onOver: summary => finish(summary) });
        if (!instance) { setFailed(true); return; }
        engine.current = instance;
        if (import.meta.env.DEV) window.__arcade = instance;
        await instance.ready;
        if (!cancelled) setLoaded(true);
      } catch { setFailed(true); }
      finally { introDone('arcade'); }
    };
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      boot();
    }, { rootMargin: '500px' });
    if (introSkipped()) observer.observe(element);
    else boot();
    return () => { cancelled = true; observer.disconnect(); engine.current?.dispose(); engine.current = null; };
  }, [finish]);

  useEffect(() => {
    if (phase !== 'countdown') return;
    if (count === 0) { engine.current?.start(); setPhase('playing'); host.current?.focus({ preventScroll: true }); return; }
    const timer = setTimeout(() => setCount(value => value - 1), 520);
    return () => clearTimeout(timer);
  }, [phase, count]);

  // No name needed to fly: the server starts timing the flight and the pilot cookie identifies the player.
  const launch = event => {
    event?.preventDefault();
    if (!engine.current) return;
    flight.current += 1;
    run.current = startRun();
    setLanded(null);
    setDebrief(null);
    setClaimed(null);
    setError('');
    hudApi.current?.(EMPTY_HUD);
    setCount(3);
    setPhase('countdown');
  };

  const claim = async event => {
    event.preventDefault();
    if (!landed || landed.saving || claiming) return;
    setClaiming(true);
    setError('');
    try {
      const data = await claimRun(landed, name);
      setName(data.name);
      showBoard(data);
      if (period !== 'all') setRefresh(value => value + 1);
      setClaimed(data);
      setPhase('claimed');
    } catch (problem) {
      setError(problem.status ? problem.message : 'The leaderboard is unreachable. Try again in a moment.');
    } finally {
      setClaiming(false);
    }
  };

  const onPointerMove = event => {
    if (phaseRef.current !== 'playing' || !engine.current) return;
    const rect = host.current.getBoundingClientRect();
    engine.current.setPointer((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height, event.pointerType);
  };
  const onKey = down => event => {
    const direction = KEYS[event.key];
    if (direction && phaseRef.current === 'playing') { event.preventDefault(); engine.current?.setKey(direction, down); }
    if (down && (event.key === ' ' || event.key === 'Enter') && event.target === host.current && ['over', 'claimed'].includes(phaseRef.current)) { event.preventDefault(); launch(); }
  };

  const status = failed ? 'unsupported' : phase;
  const tier = landed && tierFor(Math.max(landed.score, profile.best));
  const me = claimed?.me;
  const moved = me && claimed.previousRank ? claimed.previousRank - me.rank : 0;
  const reached = debrief && SECTORS[debrief.sector];

  return <section id="arcade" className="arcade shell">
    <div className="section-head">
      <div>
        <Kicker index="03">The arcade</Kicker>
        <RevealText>Space <em>scavenger</em></RevealText>
      </div>
      <FadeUp as="p" className="section-lede">Fly Bandit through four sectors that change as you go: the asteroid belt, an ion nebula, a wreckage field and a meteor storm. Grab scrap, ride the power-ups, then sign your flight and chase the top of the board.</FadeUp>
    </div>

    <div className="arcade-grid">
      <FadeUp className="game-frame">
        <div className={`game-stage phase-${phase}`} ref={host} tabIndex={0} role="application" aria-roledescription="game" aria-label="Space Scavenger. Steer with the mouse, touch, or the arrow keys." data-status={status} onPointerMove={onPointerMove} onPointerDown={onPointerMove} onKeyDown={onKey(true)} onKeyUp={onKey(false)}>
          <Hud connect={hudApi} phase={phase} />
          <Banner connect={bannerApi} phase={phase} />

          <AnimatePresence mode="wait">
            {phase === 'idle' && <motion.div key="idle" className="game-panel briefing" {...panelMotion} transition={{ duration: 0.45, ease }}>
              <span className="panel-kicker">Pre-flight check</span>
              <strong className="panel-title">{profile.name ? <>Welcome back, {profile.name}.</> : 'Ready to fly?'}</strong>
              {profile.rank
                ? <span className="panel-sub">You're <b>#{profile.rank}</b> all time with {pad(profile.best)}. Beat it.</span>
                : <span className="panel-sub">No sign-up. Fly first, put your name on the board after.</span>}
              <ol className="route" aria-label="Flight route">
                {SECTORS.map(sector => <li key={sector.id} style={{ '--tone': sector.color }}><i /><span>{sector.name}</span></li>)}
              </ol>
              <button type="button" className="btn btn-accent btn-wide" onClick={launch} disabled={!loaded}>{failed ? '3D not available here' : loaded ? <>Launch <Rocket size={18} /></> : 'Warming up engines…'}</button>
              <span className="panel-hint"><span className="keys" aria-hidden="true"><kbd>←</kbd><kbd>↑</kbd><kbd>→</kbd><kbd>↓</kbd></span> The ship flies to your pointer, finger or arrow keys</span>
              <span className="panel-hint rings"><span><i aria-hidden="true" />Red rings mark where a hazard will cross your path</span></span>
            </motion.div>}
            {phase === 'countdown' && <motion.span key={`c${count}`} className="countdown" initial={{ opacity: 0, scale: 2.2 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={{ duration: 0.4, ease }}>{count || 'GO'}</motion.span>}
            {phase === 'over' && landed && <motion.form key="over" className="game-panel center debrief" onSubmit={claim} {...panelMotion} transition={{ duration: 0.45, ease, delay: 0.3 }}>
              <span className="panel-kicker warn">Mission over</span>
              <strong className="panel-score"><CountUp value={landed.score} /></strong>
              <span className="chips">
                {!landed.saving && landed.isNewBest && <span className="chip hot"><Sparkles size={13} /> New personal best</span>}
                <span className={`chip tier t${tier.level}`}>{tier.name}</span>
              </span>
              {debrief && <dl className="debrief-stats">
                <div><dt>Flight</dt><dd>{clock(debrief.duration)}</dd></div>
                <div style={{ '--tone': reached.color }}><dt>Reached</dt><dd className="reached">{reached.short}{debrief.loop > 0 && <small> · L{debrief.loop + 1}</small>}</dd></div>
                <div><dt>Best combo</dt><dd>×{debrief.bestCombo}</dd></div>
                <div><dt>Scrap</dt><dd>{debrief.stats.scrap}</dd></div>
              </dl>}
              <span className="panel-sub" role="status">{landed.saving ? 'Logging your flight…'
                : landed.isNewBest
                  ? landed.rank === 1 ? <>That's the <b>#1</b> score. Claim the crown.</> : <>Claim it and you'd be <b>#{landed.rank}</b> of {landed.totalPilots} pilots{landed.rank <= TOP ? ', on the top board' : ''}.</>
                  : <>Your best of {pad(landed.previousBest)} still holds <b>#{landed.rank}</b>. This one can still top today's or this week's board.</>}
              </span>
              <TierProgress score={Math.max(landed.score, profile.best)} />
              <label className="field claim-field">
                <span className="sr-only">Callsign for the leaderboard</span>
                <span className="field-input"><UserRound size={18} aria-hidden="true" /><input value={name} onChange={event => { setName(event.target.value.slice(0, 14)); setError(''); }} maxLength={14} placeholder="Your callsign" autoComplete="nickname" aria-invalid={Boolean(error)} aria-describedby="pilot-error" /></span>
              </label>
              <span id="pilot-error" className="field-error" role="alert">{error}</span>
              <span className="panel-actions">
                <button type="submit" className="btn btn-accent" disabled={landed.saving || claiming}><Trophy size={17} /> {claiming ? 'Saving…' : landed.saving ? 'Logging…' : landed.isNewBest ? `Claim #${landed.rank}` : 'Save flight'}</button>
                <button type="button" className="btn btn-ghost" onClick={launch}><RotateCcw size={17} /> Play again</button>
              </span>
            </motion.form>}
            {phase === 'claimed' && me && <motion.div key="claimed" className="game-panel center" {...panelMotion} transition={{ duration: 0.45, ease }}>
              <span className="panel-kicker">On the board</span>
              <strong className="panel-score rank-score">#{me.rank}</strong>
              <span className="chips">
                {claimed.previousRank === null ? <span className="chip hot"><Sparkles size={13} /> New entry</span>
                  : moved > 0 ? <span className="chip hot"><ArrowUp size={13} /> Up {moved} place{moved === 1 ? '' : 's'}</span>
                    : <span className="chip">Holding #{me.rank}</span>}
                {me.rank === 1 && <span className="chip gold"><Crown size={13} /> Top pilot</span>}
              </span>
              <span className="panel-sub" role="status">{claimed.name}, {claimed.total >= 10 ? `you're in the top ${me.topPercent}% of ${claimed.total} pilots.` : `that's #${me.rank} of ${claimed.total} pilot${claimed.total === 1 ? '' : 's'}.`}{me.ahead ? <> {me.ahead.gap} pts to pass {me.ahead.name} (#{me.ahead.rank}).</> : ' Nobody is above you.'}</span>
              <span className="panel-actions">
                <button type="button" className="btn btn-accent" onClick={launch}><RotateCcw size={17} /> Play again</button>
              </span>
            </motion.div>}
          </AnimatePresence>
          {failed && <p className="game-fallback">This browser can't run WebGL, so the arcade is grounded. The leaderboard still works →</p>}
          <div className="stage-foot" aria-hidden="true"><span>Pilot · {profile.name || 'Guest'}</span><span>Best · {pad(profile.best)}</span></div>
        </div>
      </FadeUp>

      <FadeUp className="board-col" delay={0.1}>
        <Leaderboard board={board} period={period} onPeriod={setPeriod} />
        <FieldGuide />
      </FadeUp>
    </div>
  </section>;
}
