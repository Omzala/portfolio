// Client for the Space Scavenger leaderboard.
// Flights go to the shared MongoDB board (the functions in /api) when it is reachable. The server knows
// each visitor by an HttpOnly pilot cookie, so nobody has to sign in before playing. When the API is not
// there (a plain static host), the same flow runs against this browser's storage with the same rules.
const API = import.meta.env.VITE_API_BASE || '/api';
const LOCAL_KEY = 'omzala-scavenger-board';
const PILOT_KEY = 'omzala-scavenger-pilot';
const FLIGHTS_KEY = 'omzala-scavenger-flights';
export const TOP = 10;

export const cleanName = value => String(value ?? '').normalize('NFKC').replace(/[^\p{L}\p{N} _.'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 14);

// Ranks earned by score. Each pilot's tier comes from their best flight on the board.
// Sized for the four-sector flight: a first clean sector makes Cadet, a full loop is Ace territory.
export const TIERS = [
  { name: 'Rookie', min: 0 },
  { name: 'Cadet', min: 1000 },
  { name: 'Pilot', min: 3000 },
  { name: 'Ace', min: 8000 },
  { name: 'Legend', min: 20000 },
];
export function tierFor(score) {
  const index = TIERS.findLastIndex(tier => score >= tier.min);
  const next = TIERS[index + 1];
  return { ...TIERS[index], level: index, next: next && { name: next.name, needed: next.min - score } };
}

class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function request(path, { method = 'GET', body } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(`${API}/${path}`, { method, signal: controller.signal, credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    // Static hosts answer unknown paths with index.html, so insist on JSON.
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('No shared board');
    const data = await response.json();
    // 503 means the API exists but has no database: treat it like a static host.
    if (!response.ok) throw response.status === 503 ? new Error(data.error) : new ApiError(response.status, data.error || 'Something went wrong.');
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- This-device fallback ---------- */

const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } },
};
const readLocal = () => { const list = store.get(LOCAL_KEY, []); return Array.isArray(list) ? list.filter(entry => entry && typeof entry.score === 'number' && entry.name) : []; };
const localPilot = () => { try { return localStorage.getItem(PILOT_KEY) || ''; } catch { return ''; } };
const saveLocalPilot = name => { try { localStorage.setItem(PILOT_KEY, name); } catch { /* storage unavailable */ } };
const DAY = 86_400_000;

function periodWindow(period, now = new Date()) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (period === 'day') return { since: today, resetsAt: new Date(today + DAY).toISOString() };
  if (period === 'week') { const monday = today - ((now.getUTCDay() + 6) % 7) * DAY; return { since: monday, resetsAt: new Date(monday + 7 * DAY).toISOString() }; }
  return { since: 0, resetsAt: null };
}

// Same rules as the server: best entry per name, competition ranking, earlier score first on ties.
function localStandings(period, me = localPilot()) {
  const { since, resetsAt } = periodWindow(period);
  const best = new Map();
  for (const entry of readLocal()) {
    if (entry.at < since) continue;
    const key = entry.name.toLowerCase();
    const current = best.get(key);
    if (!current || entry.score > current.score || (entry.score === current.score && entry.at < current.at)) best.set(key, { ...entry, flights: (current?.flights ?? 0) + 1 });
    else current.flights += 1;
  }
  const sorted = [...best.values()].sort((a, b) => b.score - a.score || a.at - b.at);
  const rows = sorted.map(entry => ({ key: entry.name.toLowerCase(), rank: sorted.findIndex(other => other.score === entry.score) + 1, name: entry.name, score: entry.score, bestCombo: entry.bestCombo ?? 1, flights: entry.flights, at: entry.at, me: entry.name.toLowerCase() === me.toLowerCase(), ahead: sorted.findLast(other => other.score > entry.score) }));
  const mine = rows.find(row => row.me);
  const strip = ({ ahead, ...row }) => row;
  return {
    mode: 'local', period, resetsAt, total: rows.length,
    scores: rows.slice(0, TOP).map(strip),
    me: mine && { ...strip(mine), topPercent: Math.max(1, Math.ceil((mine.rank / rows.length) * 100)), ahead: mine.ahead && { name: mine.ahead.name, rank: rows.find(row => row.key === mine.ahead.name.toLowerCase()).rank, gap: mine.ahead.score - mine.score + 1 } },
    pilot: { name: me, flights: store.get(FLIGHTS_KEY, 0) },
  };
}

/* ---------- Public API ---------- */

export async function loadBoard(period = 'all') {
  try {
    return { mode: 'global', ...(await request(`leaderboard?period=${period}`)) };
  } catch {
    return localStandings(period);
  }
}

// Called on launch. The server starts timing the flight and hands back its id (and the pilot cookie).
export async function startRun() {
  try {
    const { runId } = await request('runs', { method: 'POST' });
    return { mode: 'global', runId };
  } catch {
    return { mode: 'local', runId: `local-${Date.now()}` };
  }
}

// Lands the flight. It is stored unclaimed, with a preview of where it would place once named.
export async function finishRun(run, { score, bestCombo, duration }) {
  if (run.mode === 'global') {
    try {
      return { mode: 'global', ...(await request('runs', { method: 'PATCH', body: { runId: run.runId, score, bestCombo, duration: Math.round(duration * 10) / 10 } })) };
    } catch { /* fall through to this device */ }
  }
  const flights = store.get(FLIGHTS_KEY, 0) + 1;
  store.set(FLIGHTS_KEY, flights);
  const name = localPilot();
  const previousBest = localStandings('all', name).me?.score ?? null;
  const isNewBest = previousBest === null || score > previousBest;
  const standing = isNewBest ? score : previousBest;
  const rivals = readLocal().filter(entry => entry.name.toLowerCase() !== name.toLowerCase());
  const above = new Set(rivals.filter(entry => entry.score > standing).map(entry => entry.name.toLowerCase())).size;
  return { mode: 'local', runId: run.runId, pending: { score, bestCombo, at: Date.now() }, score, bestCombo, name, flights, previousBest, isNewBest, rank: above + 1, totalPilots: new Set(rivals.map(entry => entry.name.toLowerCase())).size + 1 };
}

// Puts a name on a landed flight and returns the refreshed all-time board.
export async function claimRun(landed, rawName) {
  const name = cleanName(rawName);
  if (name.length < 2) throw new ApiError(400, 'Callsigns need at least 2 letters or numbers.');
  if (landed.mode === 'global') {
    const data = await request('claim', { method: 'POST', body: { runId: landed.runId, name } });
    saveLocalPilot(name);
    return { mode: 'global', ...data };
  }
  saveLocalPilot(name);
  const previousRank = localStandings('all', name).me?.rank ?? null;
  store.set(LOCAL_KEY, [...readLocal(), { id: landed.runId, name, ...landed.pending }].sort((a, b) => b.score - a.score).slice(0, 100));
  return { ...localStandings('all', name), name, previousRank };
}

export const rememberedName = localPilot;
