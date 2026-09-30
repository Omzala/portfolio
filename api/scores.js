// Global leaderboard for the Space Scavenger arcade, as a Vercel serverless function.
// Storage is any Upstash Redis database (Vercel's Redis/KV integration sets these variables for you):
//   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, or KV_REST_API_URL + KV_REST_API_TOKEN.
// Without them it answers 503 and the site quietly keeps scores on each visitor's device instead.

const BOARD = 'scavenger:board';
const KEEP = 100;
const SHOW = 10;
const MAX_SCORE = 2_000_000;
// Generous ceiling on points per second of flight, to reject obviously forged scores.
const MAX_RATE = 900;

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const cleanName = value => String(value ?? '').normalize('NFKC').replace(/[^\p{L}\p{N} _.'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 14);

async function redis(commands) {
  const response = await fetch(`${url}/pipeline`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(commands) });
  if (!response.ok) throw new Error(`Redis responded ${response.status}`);
  return (await response.json()).map(item => { if (item.error) throw new Error(item.error); return item.result; });
}

async function topScores() {
  const [flat] = await redis([['ZRANGE', BOARD, '0', String(SHOW - 1), 'REV', 'WITHSCORES']]);
  const scores = [];
  for (let i = 0; i < flat.length; i += 2) {
    try {
      const { id, name, at } = JSON.parse(flat[i]);
      scores.push({ id, name, at, score: Number(flat[i + 1]) });
    } catch { /* skip malformed members */ }
  }
  return scores;
}

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store');
  if (!url || !token) return res.status(503).json({ error: 'Leaderboard storage is not configured.' });
  try {
    if (req.method === 'GET') return res.status(200).json({ scores: await topScores() });
    if (req.method !== 'POST') { res.setHeader('allow', 'GET, POST'); return res.status(405).json({ error: 'Method not allowed.' }); }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};
    const name = cleanName(body.name);
    const score = Math.floor(Number(body.score));
    const duration = Number(body.duration);
    if (!name || !Number.isFinite(score) || score < 0 || score > MAX_SCORE || !Number.isFinite(duration) || duration <= 0 || score > duration * MAX_RATE + 100) {
      return res.status(400).json({ error: 'That score does not look right.' });
    }

    const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || 'unknown';
    const [attempts] = await redis([['INCR', `scavenger:rate:${ip}`], ['EXPIRE', `scavenger:rate:${ip}`, '60', 'NX']]);
    if (attempts > 12) return res.status(429).json({ error: 'Easy, pilot. Try again in a minute.' });

    const id = typeof body.id === 'string' && /^[\w-]{6,64}$/.test(body.id) ? body.id : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const member = JSON.stringify({ id, name, at: Date.now() });
    const [, rankFromTop] = await redis([
      ['ZADD', BOARD, String(score), member],
      ['ZREVRANK', BOARD, member],
      ['ZREMRANGEBYRANK', BOARD, '0', String(-KEEP - 1)],
    ]);
    return res.status(200).json({ id, rank: rankFromTop === null ? null : rankFromTop + 1, scores: await topScores() });
  } catch (error) {
    console.error(error);
    return res.status(502).json({ error: 'Leaderboard is unavailable right now.' });
  }
}
