// Leaderboard rules for Space Scavenger.
// - Only flights a pilot has claimed under a name count.
// - Each pilot appears once per board, with their best claimed flight in that period.
// - Ranking is competition style (1, 2, 2, 4): equal scores share a rank, and whoever got there first is listed first.
// - Boards: all time, this week (from Monday 00:00 UTC) and today (from 00:00 UTC).
import { createHash } from 'node:crypto';
import { HttpError } from './http.js';

export const TOP = 10;
export const MAX_SCORE = 2_000_000;
// Generous ceiling on points per second of flight, to reject obviously forged scores.
export const MAX_RATE = 900;
export const MAX_COMBO = 25;

export const cleanName = value => String(value ?? '').normalize('NFKC').replace(/[^\p{L}\p{N} _.'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 14);

const DAY = 86_400_000;

export function periodWindow(period, now = new Date()) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (period === 'day') return { since: new Date(today), resetsAt: new Date(today + DAY) };
  if (period === 'week') {
    const monday = today - ((now.getUTCDay() + 6) % 7) * DAY;
    return { since: new Date(monday), resetsAt: new Date(monday + 7 * DAY) };
  }
  return { since: null, resetsAt: null };
}

export function parsePeriod(value) {
  const period = value || 'all';
  if (!['all', 'week', 'day'].includes(period)) throw new HttpError(400, 'Unknown leaderboard.');
  return period;
}

// A stable, non-reversible key per pilot so the client can animate rows without seeing pilot ids.
const rowKey = pilotId => createHash('sha256').update(pilotId).digest('hex').slice(0, 12);

// One row per pilot (their best claimed flight in the window), ranked.
const bestPerPilot = since => [
  { $match: { claimed: true, ...(since && { endedAt: { $gte: since } }) } },
  { $sort: { score: -1, endedAt: 1 } },
  { $group: { _id: '$pilotId', score: { $first: '$score' }, at: { $first: '$endedAt' }, bestCombo: { $first: '$bestCombo' }, flights: { $sum: 1 } } },
  { $setWindowFields: { sortBy: { score: -1 }, output: { rank: { $rank: {} } } } },
];

export async function standings({ runs, pilots }, { period = 'all', pilotId = null, limit = TOP } = {}) {
  const { since, resetsAt } = periodWindow(period);
  const [result] = await runs.aggregate([
    ...bestPerPilot(since),
    { $facet: {
      top: limit > 0 ? [{ $sort: { rank: 1, at: 1 } }, { $limit: limit }] : [{ $match: { _id: null } }],
      me: [{ $match: { _id: pilotId ?? '' } }],
      total: [{ $count: 'pilots' }],
    } },
  ]).toArray();
  const mine = result.me[0] ?? null;
  // The pilot to beat next: the lowest score that still ranks above this pilot.
  const [ahead] = mine && mine.rank > 1
    ? await runs.aggregate([...bestPerPilot(since), { $match: { score: { $gt: mine.score } } }, { $sort: { score: 1, at: -1 } }, { $limit: 1 }]).toArray()
    : [];

  const ids = [...new Set([...result.top.map(row => row._id), mine?._id, ahead?._id].filter(Boolean))];
  const names = new Map((await pilots.find({ _id: { $in: ids } }, { projection: { name: 1 } }).toArray()).map(pilot => [pilot._id, pilot.name]));
  const total = result.total[0]?.pilots ?? 0;

  return {
    period,
    resetsAt,
    total,
    scores: result.top.map(row => ({ key: rowKey(row._id), rank: row.rank, name: names.get(row._id) ?? 'Pilot', score: row.score, bestCombo: row.bestCombo, flights: row.flights, at: row.at, me: row._id === pilotId })),
    me: mine && {
      key: rowKey(mine._id),
      rank: mine.rank,
      name: names.get(mine._id) ?? 'Pilot',
      score: mine.score,
      bestCombo: mine.bestCombo,
      flights: mine.flights,
      at: mine.at,
      topPercent: Math.max(1, Math.ceil((mine.rank / total) * 100)),
      ahead: ahead ? { name: names.get(ahead._id) ?? 'Pilot', rank: ahead.rank, gap: ahead.score - mine.score + 1 } : null,
    },
  };
}

// Where a score would land on the all-time board if this pilot claimed it now.
export async function projection({ runs }, pilotId, score) {
  const [mine] = await runs.find({ pilotId, claimed: true }, { projection: { score: 1 } }).sort({ score: -1 }).limit(1).toArray();
  const previousBest = mine?.score ?? null;
  const isNewBest = previousBest === null || score > previousBest;
  // A worse flight never lowers a pilot's standing, so their rank is set by whichever score is higher.
  const standing = isNewBest ? score : previousBest;
  const countPilots = match => runs.aggregate([{ $match: { claimed: true, pilotId: { $ne: pilotId }, ...match } }, { $group: { _id: '$pilotId' } }, { $count: 'n' }]).toArray();
  const [[above], [others]] = await Promise.all([countPilots({ score: { $gt: standing } }), countPilots({})]);
  return { previousBest, isNewBest, rank: 1 + (above?.n ?? 0), totalPilots: (others?.n ?? 0) + 1 };
}
