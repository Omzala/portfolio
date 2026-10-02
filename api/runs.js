// POST  /api/runs                                   Start a flight. Sets the pilot cookie on first visit.
// PATCH /api/runs { runId, score, duration, bestCombo }  Land it. The score is stored unclaimed until
//                                                        the pilot puts a name on it (see /api/claim).
// The server times every flight itself, so a forged score has to fit inside a real flight's length.
import { collections, toObjectId } from './_lib/db.js';
import { HttpError, readBody, route } from './_lib/http.js';
import { ensurePilot, readPilot } from './_lib/pilot.js';
import { MAX_COMBO, MAX_RATE, MAX_SCORE, projection } from './_lib/board.js';

const MINUTE = 60_000;
const STARTS_PER_MINUTE = 12;
const MAX_FLIGHT = 30 * MINUTE;
// Landed flights wait this long for a name before they are cleaned up.
const CLAIM_WINDOW = 24 * 60 * MINUTE;

export default route({
  async POST(req, res) {
    const db = await collections();
    const pilotId = ensurePilot(req, res);
    const now = new Date();
    const recent = await db.runs.countDocuments({ pilotId, startedAt: { $gt: new Date(now - MINUTE) } });
    if (recent >= STARTS_PER_MINUTE) throw new HttpError(429, 'Easy, pilot. Try again in a minute.');
    const [{ insertedId }] = await Promise.all([
      db.runs.insertOne({ pilotId, status: 'flying', startedAt: now, expiresAt: new Date(+now + MAX_FLIGHT) }),
      db.pilots.updateOne({ _id: pilotId }, { $setOnInsert: { createdAt: now, flights: 0 }, $set: { lastSeenAt: now } }, { upsert: true }),
    ]);
    return { runId: insertedId.toString() };
  },

  async PATCH(req) {
    const pilotId = readPilot(req);
    if (!pilotId) throw new HttpError(401, 'No pilot cookie on this flight.');
    const body = await readBody(req);
    const _id = toObjectId(body.runId);
    const score = Math.floor(Number(body.score));
    const duration = Number(body.duration);
    const bestCombo = Math.floor(Number(body.bestCombo)) || 1;

    const db = await collections();
    const run = await db.runs.findOne({ _id, pilotId, status: 'flying' });
    if (!run) throw new HttpError(404, 'That flight was not found.');
    const now = new Date();
    const elapsed = (now - run.startedAt) / 1000;
    const plausible = Number.isFinite(score) && score >= 0 && score <= MAX_SCORE
      && Number.isFinite(duration) && duration > 0 && duration <= elapsed + 1
      && score <= duration * MAX_RATE + 100
      && bestCombo >= 1 && bestCombo <= MAX_COMBO;
    if (!plausible) {
      await db.runs.deleteOne({ _id });
      throw new HttpError(400, 'That score does not look right.');
    }

    const landed = await db.runs.updateOne(
      { _id, pilotId, status: 'flying' },
      { $set: { status: 'landed', score, duration: Math.round(duration * 10) / 10, bestCombo, endedAt: now, claimed: false, expiresAt: new Date(+now + CLAIM_WINDOW) } },
    );
    if (!landed.modifiedCount) throw new HttpError(409, 'That flight has already landed.');
    const [pilot, outlook] = await Promise.all([
      db.pilots.findOneAndUpdate({ _id: pilotId }, { $inc: { flights: 1 }, $set: { lastSeenAt: now } }, { returnDocument: 'after', projection: { name: 1, flights: 1 } }),
      projection(db, pilotId, score),
    ]);
    return { runId: body.runId, score, bestCombo, name: pilot?.name ?? '', flights: pilot?.flights ?? 1, ...outlook };
  },
});
