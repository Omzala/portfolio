import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Globe2, Rocket, RotateCcw, Smartphone, Trophy, UserRound } from 'lucide-react';
import { FadeUp, Kicker, RevealText, ease } from '../components/ui.jsx';
import { cleanName, loadBoard, personalBest, readPilot, savePilot, submitScore } from '../lib/leaderboard.js';

const KEYS = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down' };
const pad = value => String(value).padStart(6, '0');

function Legend() {
  return <div className="legend">
    <div><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 21 7v10l-9 5-9-5V7z" className="lg-cyan" /><circle cx="12" cy="12" r="3.5" className="lg-cyan" /></svg><strong>Scrap</strong><span>10 × combo. Chain them.</span></div>
    <div><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" className="lg-orange" /><circle cx="12" cy="12" r="4.5" className="lg-orange-fill" /></svg><strong>Core</strong><span>Rare. Flat 50 points.</span></div>
    <div><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 12 12 21 4 12Z" className="lg-light" /></svg><strong>Shield</strong><span>Patches one hit back up.</span></div>
    <div><svg viewBox="0 0 90 80" aria-hidden="true"><path d="M20 8 60 2l26 28-8 36-38 12L6 58 2 24Z" className="lg-rock" /></svg><strong>Rock</strong><span>Costs a shield, resets combo.</span></div>
  </div>;
}

export default function Arcade() {
  const host = useRef(null);
  const engine = useRef(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [count, setCount] = useState(3);
  const [pilot, setPilot] = useState(readPilot);
  const [hud, setHud] = useState({ score: 0, combo: 1, shields: 3, speed: 0 });
  const [result, setResult] = useState(null);
  const [board, setBoard] = useState({ mode: 'loading', scores: [] });
  const [best, setBest] = useState(personalBest);
  const [error, setError] = useState('');
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const pilotRef = useRef(pilot);
  pilotRef.current = pilot;

  useEffect(() => { let alive = true; loadBoard().then(data => { if (alive) setBoard(data); }); return () => { alive = false; }; }, []);

  const finish = useCallback(async ({ score, bestCombo, duration }) => {
    setPhase('over');
    setResult({ score, bestCombo, saving: true });
    const saved = await submitScore({ name: pilotRef.current, score, duration });
    setBoard({ mode: saved.mode, scores: saved.scores });
    setBest(personalBest());
    setResult({ score, bestCombo, id: saved.id, rank: saved.rank, mode: saved.mode });
  }, []);

  // The 3D engine loads once the arcade is close to the viewport.
  useEffect(() => {
    const element = host.current;
    let cancelled = false;
    const observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      try {
        const { createScavenger } = await import('../three/scavenger.js');
        if (cancelled) return;
        const instance = createScavenger(element, { onHud: setHud, onOver: summary => finish(summary) });
        if (!instance) { setFailed(true); return; }
        engine.current = instance;
        setLoaded(true);
      } catch { setFailed(true); }
    }, { rootMargin: '500px' });
    observer.observe(element);
    return () => { cancelled = true; observer.disconnect(); engine.current?.dispose(); engine.current = null; };
  }, [finish]);

  useEffect(() => {
    if (phase !== 'countdown') return;
    if (count === 0) { engine.current?.start(); setPhase('playing'); host.current?.focus({ preventScroll: true }); return; }
    const timer = setTimeout(() => setCount(value => value - 1), 520);
    return () => clearTimeout(timer);
  }, [phase, count]);

  const launch = event => {
    event?.preventDefault();
    const name = cleanName(pilot);
    if (!name) { setError('Your pilot needs a name for the board.'); return; }
    if (!engine.current) return;
    setError('');
    setPilot(name);
    savePilot(name);
    setResult(null);
    setHud({ score: 0, combo: 1, shields: 3, speed: 0 });
    setCount(3);
    setPhase('countdown');
  };
  const changePilot = () => { engine.current?.idle(); setResult(null); setPhase('idle'); };

  const onPointerMove = event => {
    if (phaseRef.current !== 'playing' || !engine.current) return;
    const rect = host.current.getBoundingClientRect();
    engine.current.setPointer((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
  };
  const onKey = down => event => {
    const direction = KEYS[event.key];
    if (direction && phaseRef.current === 'playing') { event.preventDefault(); engine.current?.setKey(direction, down); }
    if (down && (event.key === ' ' || event.key === 'Enter') && event.target === host.current && phaseRef.current === 'over') { event.preventDefault(); launch(); }
  };

  const rows = Array.from({ length: 8 }, (_, i) => board.scores[i] ?? null);
  const status = failed ? 'unsupported' : phase;

  return <section id="arcade" className="arcade shell">
    <div className="section-head">
      <div>
        <Kicker index="03">The arcade</Kicker>
        <RevealText>Space <em>scavenger</em></RevealText>
      </div>
      <FadeUp as="p" className="section-lede">Fly Bandit through the asteroid belt, grab the scrap, dodge the rocks. Sign your pilot name and chase the top of the board.</FadeUp>
    </div>

    <div className="arcade-grid">
      <FadeUp className="game-frame">
        <div className={`game-stage phase-${phase}`} ref={host} tabIndex={0} role="application" aria-roledescription="game" aria-label="Space Scavenger. Steer with the mouse, touch, or the arrow keys." data-status={status} data-score={hud.score} onPointerMove={onPointerMove} onPointerDown={onPointerMove} onKeyDown={onKey(true)} onKeyUp={onKey(false)}>
          <div className="hud" aria-hidden={phase !== 'playing'}>
            <span className="hud-score"><small>Score</small> <strong>{pad(hud.score)}</strong></span>
            <span className={hud.combo > 1 ? 'hud-combo hot' : 'hud-combo'}><small>Combo </small>×{hud.combo}</span>
            <span className="hud-shields" aria-label={`${hud.shields} shields left`}><small>Shields</small> {[0, 1, 2].map(i => <i key={i} className={i < hud.shields ? 'on' : ''} />)}</span>
          </div>
          <span className="sr-only" aria-live="polite">{phase === 'playing' ? `${hud.shields} shields` : ''}</span>

          <AnimatePresence mode="wait">
            {phase === 'idle' && <motion.form key="idle" className="game-panel" onSubmit={launch} initial={{ opacity: 0, y: 30, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -20, scale: 0.96 }} transition={{ duration: 0.45, ease }}>
              <span className="panel-kicker">Pre-flight check</span>
              <strong className="panel-title">Sign in, pilot.</strong>
              <label className="field">
                <span>Pilot name <small>(shown on the leaderboard)</small></span>
                <span className="field-input"><UserRound size={18} aria-hidden="true" /><input value={pilot} onChange={event => { setPilot(event.target.value.slice(0, 14)); setError(''); }} maxLength={14} placeholder="e.g. Ada" autoComplete="nickname" aria-invalid={Boolean(error)} aria-describedby="pilot-error" /></span>
              </label>
              <span id="pilot-error" className="field-error" role="alert">{error}</span>
              <button type="submit" className="btn btn-accent btn-wide" disabled={!loaded}>{failed ? '3D not available here' : loaded ? <>Launch <Rocket size={18} /></> : 'Warming up engines…'}</button>
              <span className="panel-hint">Mouse, touch or ← ↑ → ↓ to steer</span>
            </motion.form>}
            {phase === 'countdown' && <motion.span key={`c${count}`} className="countdown" initial={{ opacity: 0, scale: 2.2 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={{ duration: 0.4, ease }}>{count || 'GO'}</motion.span>}
            {phase === 'over' && result && <motion.div key="over" className="game-panel center" initial={{ opacity: 0, y: 30, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.45, ease, delay: 0.3 }}>
              <span className="panel-kicker warn">Mission over</span>
              <strong className="panel-score">{pad(result.score)}</strong>
              <span className="panel-sub" role="status">{result.saving ? 'Logging your flight…' : <>{pilot} {result.rank ? <>placed <b>#{result.rank}</b></> : 'is on the board'} · best combo ×{result.bestCombo}</>}</span>
              <span className="panel-actions">
                <button type="button" className="btn btn-accent" onClick={launch}><RotateCcw size={17} /> Play again</button>
                <button type="button" className="btn btn-ghost" onClick={changePilot}>Change pilot</button>
              </span>
            </motion.div>}
          </AnimatePresence>
          {failed && <p className="game-fallback">This browser can't run WebGL, so the arcade is grounded. The leaderboard still works →</p>}
          <div className="stage-foot" aria-hidden="true"><span>Pilot · {cleanName(pilot) || 'unsigned'}</span><span>Best · {pad(best)}</span></div>
        </div>
      </FadeUp>

      <FadeUp className="board-col" delay={0.1}>
        <div className="card board">
          <div className="board-head">
            <strong><Trophy size={20} /> Top pilots</strong>
            <span className="board-mode">{board.mode === 'global' ? <><Globe2 size={14} /> Global</> : board.mode === 'local' ? <><Smartphone size={14} /> This device</> : 'Loading…'}</span>
          </div>
          <ol className="board-list">
            {rows.map((row, i) => row
              ? <motion.li key={row.id ?? `${row.name}-${row.score}-${i}`} layout className={`${row.id && row.id === result?.id ? 'me' : ''} ${i === 0 ? 'first' : ''}`} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, ease, delay: i * 0.03 }}>
                  <span className="rank">{i + 1}</span><span className="who">{row.name}</span><span className="pts">{pad(row.score)}</span>
                </motion.li>
              : <li key={`empty-${i}`} className={i === 0 ? 'empty first' : 'empty'}><span className="rank">{i + 1}</span><span className="who">{i === 0 ? 'Your name here' : '— — —'}</span><span className="pts">{i === 0 ? 'claim it' : '000000'}</span></li>)}
          </ol>
          {board.mode === 'local' && <p className="board-note">Scores are saved in this browser.</p>}
        </div>
        <div className="card legend-card"><Legend /></div>
      </FadeUp>
    </div>
  </section>;
}
