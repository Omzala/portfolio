// One MongoDB client per warm function instance (or dev server), shared by every request.
// Set MONGODB_URI (Vercel's MongoDB Atlas integration sets it for you). MONGODB_DB picks the database name.
import { MongoClient, ObjectId } from 'mongodb';
import { HttpError } from './http.js';

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || 'arcade';

export const configured = () => Boolean(uri);

export const toObjectId = value => {
  if (typeof value !== 'string' || !ObjectId.isValid(value)) throw new HttpError(400, 'Unknown flight.');
  return new ObjectId(value);
};

let pending = globalThis.__arcadeDb;

async function connect() {
  const client = new MongoClient(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 5000, appName: 'space-scavenger' });
  await client.connect();
  const db = client.db(dbName);
  const runs = db.collection('runs');
  const pilots = db.collection('pilots');
  await Promise.all([
    // Unfinished flights and unclaimed scores carry an expiresAt, so MongoDB cleans them up by itself.
    runs.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    runs.createIndex({ claimed: 1, endedAt: -1, score: -1 }),
    runs.createIndex({ pilotId: 1, startedAt: -1 }),
    // Callsigns are unique regardless of case.
    pilots.createIndex({ nameKey: 1 }, { unique: true, partialFilterExpression: { nameKey: { $type: 'string' } } }),
  ]);
  return { client, runs, pilots };
}

export function collections() {
  if (!pending) {
    pending = connect().catch(error => { pending = globalThis.__arcadeDb = undefined; throw error; });
    globalThis.__arcadeDb = pending;
  }
  return pending;
}
