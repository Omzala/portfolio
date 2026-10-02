// Each visitor is identified by a signed, HttpOnly cookie holding a random pilot id. No account needed:
// the cookie is what ties a finished flight to the name its pilot later claims it under.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const COOKIE = 'sc_pilot';
const ONE_YEAR = 60 * 60 * 24 * 365;
const secret = process.env.PILOT_COOKIE_SECRET || process.env.MONGODB_URI || 'dev-only-secret';

const sign = id => createHmac('sha256', secret).update(id).digest('base64url').slice(0, 32);

function readCookie(req, name) {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

// The pilot id from a valid cookie, or null when there is none (or it was tampered with).
export function readPilot(req) {
  const [id, signature] = readCookie(req, COOKIE).split('.');
  if (!id || !signature || !/^[\w-]{22}$/.test(id)) return null;
  const expected = Buffer.from(sign(id));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
}

// Reuses the visitor's pilot id or mints a new one, and (re)sets the cookie so it keeps rolling forward.
export function ensurePilot(req, res) {
  const id = readPilot(req) ?? randomBytes(16).toString('base64url');
  const secure = req.headers['x-forwarded-proto'] === 'https' || process.env.VERCEL === '1';
  const cookie = [`${COOKIE}=${id}.${sign(id)}`, 'Path=/', `Max-Age=${ONE_YEAR}`, 'HttpOnly', 'SameSite=Lax', secure && 'Secure'].filter(Boolean).join('; ');
  res.setHeader('set-cookie', cookie);
  return id;
}
