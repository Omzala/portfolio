import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, Crown, Globe2, Medal, Rocket, RotateCcw, Smartphone, Sparkles, Trophy, UserRound } from 'lucide-react';
import { FadeUp, Kicker, RevealText, ease } from '../components/ui.jsx';
import { introDone, introSkipped } from '../lib/intro.js';
import { TOP, claimRun, finishRun, loadBoard, rememberedName, startRun, tierFor } from '../lib/leaderboard.js';

const KEYS = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down' };
const PERIODS = [['all', 'All time'], ['week', 'This week'], ['day', 'Today']];
const pad = value => String(value).padStart(6, '0');
const panelMotion = { initial: { opacity: 0, y: 30, scale: 0.96 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, scale: 0.96 } };

function resetsIn(iso) {
  const minutes = Math.max(1, Math.round((new Date(iso) - Date.now()) / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

function Legend() {
  return <div className="legend">
    <div><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 21 7v10l-9 5-9-5V7z" className="lg-cyan" /><circle cx="12" cy="12" r="3.5" className="lg-cyan" /></svg><strong>Scrap</strong><span>10 × combo. Chain them.</span></div>
    <div><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" className="lg-orange" /><circle cx="12" cy="12" r="4.5" className="lg-orange-fill" /></svg><strong>Core</strong><span>Rare. Flat 50 points.</span></div>
    <div><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 12 12 21 4 12Z" className="lg-light" /></svg><strong>Shield</strong><span>Patches one hit back up.</span></div>
    <div><svg viewBox="0 0 90 80" aria-hidden="true"><path d="M20 8 60 2l26 28-8 36-38 12L6 58 2 24Z" className="lg-rock" /></svg><strong>Rock</strong><span>Costs a shield, resets combo.</span></div>
  </div>;
}

function RankBadge({ rank }) {
  if (rank > 3) return <span className="rank">{rank}</span>;
  const Icon = rank === 1 ? Crown : Medal;
  return <span className={`rank medal m${rank}`} aria-label={`Rank ${rank}`}><Icon size={15} aria-hidden="true" />{rank}</span>;
}

function BoardRow({ row, delay }) {
  const tier = tierFor(row.score);
  return <motion.li layout className={`${row.me ? 'me' : ''} ${row.rank === 1 ? 'first' : ''}`} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, ease, delay }}>
    <RankBadge rank={row.rank} />
    <span className="who">{row.name}{row.me && <small className="you-tag">you</small>}</span>
    <span className={`tier t${tier.level}`}>{tier.name}</span>
    <span className="pts">{pad(row.score)}</span>
  </motion.li>;
}

function Leaderboard({ board, period, onPeriod }) {
  const scores = board.scores ?? [];
  const meOutside = board.me && !scores.some(row => row.me);
  const blanks = Math.max(0, (meOutside ? TOP - 2 : TOP) - scores.length);
  return <div className="card board">
    <div className="board-head">
      <strong><Trophy size={20} /> Top pilots</strong>
      <span className="board-mode">{board.mode === 'global' ? <><Globe2 size={14} /> Global</> : board.mode === 'local' ? <><Smartphone size={14} /> This device</> : 'Loading…'}</span>
    </div>
    <div className="board-tabs" role="group" aria-label="Leaderboard period">
      {PERIODS.map(([value, label]) => <button key={value} type="button" aria-pressed={period === value} className={period === value ? 'on' : ''} onClick={() => onPeriod(value)}>{label}</button>)}
    </div>
    <ol className="board-list" aria-busy={board.mode === 'loading'}>
      {scores.map((row, i) => <BoardRow key={row.key} row={row} delay={i * 0.03} />)}
      {meOutside && <><li className="gap" aria-hidden="true">⋯</li><BoardRow key="me" row={{ ...board.me, me: true }} delay={0.3} /></>}
      {Array.from({ length: blanks }, (_, i) => {
        const first = !scores.length && i === 0;
        return <li key={`empty-${i}`} className={first ? 'empty first' : 'empty'}><span className="rank">{scores.length + i + 1}</span><span className="who">{first ? 'Your name here' : '— — —'}</span><span className="pts">{first ? 'claim it' : '000000'}</span></li>;
      })}
    </ol>
    {board.me && <p className="board-me">You're <b>#{board.me.rank}</b>{board.total >= 10 && <> · top {board.me.topPercent}%</>}{board.me.ahead ? <> · {board.me.ahead.gap} pts to pass {board.me.ahead.name}</> : <> · nobody above you</>}</p>}
    <p className="board-note">
      {board.total ? `${board.total} pilot${board.total === 1 ? '' : 's'} on this board` : 'No flights yet. Be the first.'}
      {board.resetsAt && <> · resets in {resetsIn(board.resetsAt)}</>}
    </p>
    <p className="board-note small">{board.mode === 'local' ? 'Scores are saved in this browser.' : 'A cookie remembers your pilot on this device. No sign-up needed.'}</p>
  </div>;
}

export default function Arcade() {
  const host = useRef(null);
  const engine = useRef(null);
  const run = useRef(null);
  const flight = useRef(0);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [count, setCount] = useState(3);
  const [hud, setHud] = useState({ score: 0, combo: 1, shields: 3, speed: 0 });
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
        const instance = createScavenger(element, { onHud: setHud, onOver: summary => finish(summary) });
        if (!instance) { setFailed(true); return; }
        engine.current = instance;
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
    setClaimed(null);
    setError('');
    setHud({ score: 0, combo: 1, shields: 3, speed: 0 });
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
    engine.current.setPointer((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
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

  return <section id="arcade" className="arcade shell">
    <div className="section-head">
      <div>
        <Kicker index="03">The arcade</Kicker>
        <RevealText>Space <em>scavenger</em></RevealText>
      </div>
      <FadeUp as="p" className="section-lede">Fly Bandit through the asteroid belt, grab the scrap, dodge the rocks. Jump straight in, then sign your flight and chase the top of the board.</FadeUp>
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
            {phase === 'idle' && <motion.div key="idle" className="game-panel" {...panelMotion} transition={{ duration: 0.45, ease }}>
              <span className="panel-kicker">Pre-flight check</span>
              <strong className="panel-title">{profile.name ? <>Welcome back, {profile.name}.</> : 'Ready to fly?'}</strong>
              {profile.rank
                ? <span className="panel-sub">You're <b>#{profile.rank}</b> all time with {pad(profile.best)}. Beat it.</span>
                : <span className="panel-sub">No sign-up. Fly first, put your name on the board after.</span>}
              <button type="button" className="btn btn-accent btn-wide" onClick={launch} disabled={!loaded}>{failed ? '3D not available here' : loaded ? <>Launch <Rocket size={18} /></> : 'Warming up engines…'}</button>
              <span className="panel-hint">Mouse, touch or ← ↑ → ↓ to steer</span>
            </motion.div>}
            {phase === 'countdown' && <motion.span key={`c${count}`} className="countdown" initial={{ opacity: 0, scale: 2.2 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={{ duration: 0.4, ease }}>{count || 'GO'}</motion.span>}
            {phase === 'over' && landed && <motion.form key="over" className="game-panel center" onSubmit={claim} {...panelMotion} transition={{ duration: 0.45, ease, delay: 0.3 }}>
              <span className="panel-kicker warn">Mission over</span>
              <strong className="panel-score">{pad(landed.score)}</strong>
              <span className="chips">
                {!landed.saving && landed.isNewBest && <span className="chip hot"><Sparkles size={13} /> New personal best</span>}
                <span className={`chip tier t${tier.level}`}>{tier.name}</span>
                <span className="chip">Combo ×{landed.bestCombo}</span>
              </span>
              <span className="panel-sub" role="status">{landed.saving ? 'Logging your flight…'
                : landed.isNewBest
                  ? landed.rank === 1 ? <>That's the <b>#1</b> score. Claim the crown.</> : <>Claim it and you'd be <b>#{landed.rank}</b> of {landed.totalPilots} pilots{landed.rank <= TOP ? ', on the top board' : ''}.</>
                  : <>Your best of {pad(landed.previousBest)} still holds <b>#{landed.rank}</b>. This one can still top today's or this week's board.</>}
              </span>
              {tier.next && <span className="panel-hint">{tier.next.needed} pts to reach {tier.next.name}</span>}
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
        <div className="card legend-card"><Legend /></div>
      </FadeUp>
    </div>
  </section>;
}
