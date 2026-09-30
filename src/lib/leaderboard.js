// Scores go to a shared board (the /api/scores function, or VITE_SCORES_URL) when one is reachable,
// and are always kept on this device too, so the arcade works on any static host.
const LOCAL_KEY = 'omzala-scavenger-board';
const PILOT_KEY = 'omzala-scavenger-pilot';
const endpoint = import.meta.env.VITE_SCORES_URL || '/api/scores';
const LIMIT = 10;

export const cleanName = value => String(value ?? '').normalize('NFKC').replace(/[^\p{L}\p{N} _.'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 14);

const byScore = (a, b) => b.score - a.score || a.at - b.at;

function readLocal() {
  try {
    const list = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    return Array.isArray(list) ? list.filter(entry => entry && typeof entry.score === 'number' && entry.name).sort(byScore) : [];
  } catch { return []; }
}
function writeLocal(list) { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(0, 50))); } catch { /* storage unavailable */ } }

export const readPilot = () => { try { return localStorage.getItem(PILOT_KEY) || ''; } catch { return ''; } };
export const savePilot = name => { try { localStorage.setItem(PILOT_KEY, name); } catch { /* storage unavailable */ } };
export const personalBest = () => readLocal().reduce((best, entry) => Math.max(best, entry.score), 0);

async function request(method, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(endpoint, { method, signal: controller.signal, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    // Static hosts answer unknown paths with index.html, so insist on JSON.
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('No shared board');
    const data = await response.json();
    if (!Array.isArray(data.scores)) throw new Error('Unexpected response');
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export async function loadBoard() {
  try {
    const data = await request('GET');
    return { mode: 'global', scores: data.scores.slice(0, LIMIT) };
  } catch {
    return { mode: 'local', scores: readLocal().slice(0, LIMIT) };
  }
}

export async function submitScore({ name, score, duration }) {
  const entry = { id: crypto.randomUUID?.() ?? String(Date.now() + Math.random()), name: cleanName(name) || 'Pilot', score: Math.max(0, Math.floor(score)), at: Date.now() };
  const local = [...readLocal(), entry].sort(byScore);
  writeLocal(local);
  try {
    const data = await request('POST', { ...entry, duration: Math.round(duration * 10) / 10 });
    return { mode: 'global', scores: data.scores.slice(0, LIMIT), id: data.id ?? entry.id, rank: data.rank ?? null };
  } catch {
    return { mode: 'local', scores: local.slice(0, LIMIT), id: entry.id, rank: local.findIndex(item => item.id === entry.id) + 1 };
  }
}
