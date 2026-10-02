// POST /api/claim { runId, name }
// Puts the pilot's callsign on a landed flight, which enters it into the leaderboards.
// Claiming again under a new name renames the pilot everywhere, since a pilot is one cookie.
import { collections, toObjectId } from './_lib/db.js';
import { HttpError, readBody, route } from './_lib/http.js';
import { readPilot } from './_lib/pilot.js';
import { cleanName, standings } from './_lib/board.js';

export default route({
  async POST(req) {
    const pilotId = readPilot(req);
    if (!pilotId) throw new HttpError(401, 'No pilot cookie on this flight.');
    const body = await readBody(req);
    const _id = toObjectId(body.runId);
    const name = cleanName(body.name);
    if (name.length < 2) throw new HttpError(400, 'Callsigns need at least 2 letters or numbers.');

    const db = await collections();
    const run = await db.runs.findOne({ _id, pilotId, status: 'landed' }, { projection: { claimed: 1 } });
    if (!run) throw new HttpError(404, 'That flight was not found. Scores wait 24 hours for a name.');

    const before = await standings(db, { pilotId, limit: 0 });
    const now = new Date();
    try {
      await db.pilots.updateOne({ _id: pilotId }, { $set: { name, nameKey: name.toLowerCase(), updatedAt: now } }, { upsert: true });
    } catch (error) {
      if (error?.code === 11000) throw new HttpError(409, 'That callsign is taken. Try another.');
      throw error;
    }
    if (!run.claimed) await db.runs.updateOne({ _id }, { $set: { claimed: true, claimedAt: now }, $unset: { expiresAt: '' } });

    const board = await standings(db, { pilotId });
    return { ...board, name, previousRank: before.me?.rank ?? null };
  },
});
