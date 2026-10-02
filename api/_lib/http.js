// Plain Node req/res helpers, so the handlers run the same on Vercel and inside the Vite dev server.
import { configured } from './db.js';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(data));
}

export async function readBody(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};
  let raw = '';
  for await (const chunk of req) { raw += chunk; if (raw.length > 10_000) throw new HttpError(413, 'Request is too large.'); }
  try { return JSON.parse(raw || '{}'); } catch { throw new HttpError(400, 'Request body must be JSON.'); }
}

export const query = req => new URL(req.url, 'http://localhost').searchParams;

// Wraps a { GET, POST, ... } map into a handler with method checks and consistent errors.
export function route(methods) {
  return async (req, res) => {
    if (!configured()) return send(res, 503, { error: 'Leaderboard storage is not configured.' });
    const handle = methods[req.method];
    if (!handle) { res.setHeader('allow', Object.keys(methods).join(', ')); return send(res, 405, { error: 'Method not allowed.' }); }
    try {
      return send(res, 200, await handle(req, res));
    } catch (error) {
      if (error instanceof HttpError) return send(res, error.status, { error: error.message });
      console.error(error);
      return send(res, 502, { error: 'Leaderboard is unavailable right now.' });
    }
  };
}
