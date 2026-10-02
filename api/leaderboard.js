// GET /api/leaderboard?period=all|week|day
// The top pilots for a board, plus where the visitor (from their cookie) stands on it.
import { collections } from './_lib/db.js';
import { query, route } from './_lib/http.js';
import { readPilot } from './_lib/pilot.js';
import { parsePeriod, standings } from './_lib/board.js';

export default route({
  async GET(req) {
    const db = await collections();
    const pilotId = readPilot(req);
    const [board, pilot] = await Promise.all([
      standings(db, { period: parsePeriod(query(req).get('period')), pilotId }),
      pilotId ? db.pilots.findOne({ _id: pilotId }, { projection: { name: 1, flights: 1 } }) : null,
    ]);
    return { ...board, pilot: pilot && { name: pilot.name ?? '', flights: pilot.flights ?? 0 } };
  },
});
