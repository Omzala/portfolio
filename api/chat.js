import { createHash } from 'node:crypto';
import { systemInstruction } from './_lib/om-profile.js';

const MAX_BYTES = 196608;
const requests = new Map();
class ChatError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  if (Number(req.headers['content-length']) > MAX_BYTES) throw new ChatError(413, 'Your conversation is too long. Start a new chat.');
  let raw = req.body;
  if (raw === undefined) {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of req) {
      const buffer = Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > MAX_BYTES) throw new ChatError(413, 'Your conversation is too long. Start a new chat.');
      chunks.push(buffer);
    }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(raw)) raw = raw.toString('utf8');
  if (Buffer.byteLength(typeof raw === 'string' ? raw : JSON.stringify(raw)) > MAX_BYTES) throw new ChatError(413, 'Your conversation is too long. Start a new chat.');
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch { throw new ChatError(400, 'Send your question as JSON.'); }
}

function contentsFor(body) {
  const message = body?.message;
  if (typeof message !== 'string' || !message.trim() || message.length > 1500) throw new ChatError(400, 'Ask a question between 1 and 1,500 characters.');
  const history = body.history ?? [];
  if (!Array.isArray(history) || history.length > 12 || history.length % 2 !== 0) throw new ChatError(400, 'Invalid conversation history. Start a new chat.');
  const contents = history.map((turn, index) => {
    const role = index % 2 === 0 ? 'user' : 'model';
    if (turn?.role !== role || typeof turn.text !== 'string' || !turn.text.trim() || turn.text.length > (role === 'user' ? 1500 : 6000)) throw new ChatError(400, 'Invalid conversation history. Start a new chat.');
    return { role, parts: [{ text: turn.text.trim() }] };
  });
  return [...contents, { role: 'user', parts: [{ text: message.trim() }] }];
}

// Best-effort per-instance throttling, without a dependency on the arcade database.
function throttle(req, res) {
  const now = Date.now();
  for (const [key, value] of requests) if (value.reset <= now) requests.delete(key);
  const address = String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'local').split(',')[0].trim();
  const key = createHash('sha256').update(address).digest('hex');
  const bucket = requests.get(key) || { count: 0, reset: now + 60000 };
  if (bucket.count >= 12) {
    res.setHeader('Retry-After', String(Math.ceil((bucket.reset - now) / 1000)));
    throw new ChatError(429, 'A few too many questions at once. Please try again in a minute.');
  }
  if (!requests.has(key) && requests.size >= 2000) throw new ChatError(503, 'The chat is busy. Please try again shortly.');
  bucket.count += 1;
  requests.set(key, bucket);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'Method not allowed.' });
  }
  try {
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw new ChatError(415, 'Send your question as JSON.');
    const contents = contentsFor(await readBody(req));
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) throw new ChatError(503, 'My AI chat is not available yet. You can explore my work or get in touch using the Contact section.');
    throttle(req, res);
    const model = process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite';
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents,
        generationConfig: { temperature: 0.4, maxOutputTokens: 1536 },
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) {
      // Never forward Google's raw errors, credentials or request contents to the browser/logs.
      if (response.status === 429) {
        res.setHeader('Retry-After', '60');
        throw new ChatError(429, 'My AI chat is busy right now. Please try again in a minute.');
      }
      throw new ChatError(502, 'My AI chat is temporarily unavailable. Please try again shortly.');
    }
    const data = await response.json();
    const candidate = data.candidates?.[0];
    const reply = candidate?.content?.parts?.filter(part => !part.thought && typeof part.text === 'string').map(part => part.text).join('').trim();
    if (data.promptFeedback?.blockReason || !reply || !['STOP', 'MAX_TOKENS'].includes(candidate.finishReason)) throw new ChatError(502, 'I could not answer that. Try asking about my experience, skills, or projects.');
    return send(res, 200, { reply: reply.slice(0, 6000) });
  } catch (error) {
    if (error instanceof ChatError) return send(res, error.status, { error: error.message });
    if (error.name === 'TimeoutError' || error.name === 'AbortError') return send(res, 504, { error: 'That reply took too long. Please try again.' });
    return send(res, 502, { error: 'My AI chat is temporarily unavailable. Please try again shortly.' });
  }
}
