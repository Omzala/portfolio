import { createHash } from 'node:crypto';
import nodemailer from 'nodemailer';
import { email } from '../src/data.js';

export const config = { maxDuration: 60 };
const MAX_BYTES = 32768;
const requests = new Map();
const emailPattern = /^[^\s<>(),;:"\\@]+@[^\s<>(),;:"\\@]+\.[^\s<>(),;:"\\@]+$/;

class ContactError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function send(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  const tooLarge = () => new ContactError(413, 'Your message is too long. Please shorten it and try again.');
  if (Number(req.headers['content-length']) > MAX_BYTES) throw tooLarge();
  let raw = req.body;
  if (raw === undefined) {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of req) {
      const buffer = Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > MAX_BYTES) throw tooLarge();
      chunks.push(buffer);
    }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(raw)) raw = raw.toString('utf8');
  if (Buffer.byteLength(typeof raw === 'string' ? raw : JSON.stringify(raw)) > MAX_BYTES) throw tooLarge();
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch { throw new ContactError(400, 'Send your message as JSON.'); }
}

function validate(body) {
  if (!body || Array.isArray(body) || typeof body !== 'object') throw new ContactError(400, 'Please fill in the contact form.');
  const { name, from, message } = body;
  if (typeof name !== 'string' || !name.trim() || name.length > 100 || /[\x00-\x1f\x7f]/.test(name)) throw new ContactError(400, 'Enter your name using 1 to 100 characters.');
  if (typeof from !== 'string' || from.length > 254 || /[\x00-\x1f\x7f]/.test(from) || !emailPattern.test(from.trim())) throw new ContactError(400, 'Enter a valid email address so I can reply.');
  if (typeof message !== 'string' || !message.trim() || message.length > 5000 || message.includes('\0')) throw new ContactError(400, 'Enter a message using 1 to 5,000 characters.');
  return { name: name.trim(), from: from.trim(), message: message.trim() };
}

// Best-effort per-instance protection, independent of the arcade database.
function throttle(req, res) {
  const now = Date.now();
  for (const [key, bucket] of requests) if (bucket.reset <= now) requests.delete(key);
  const address = String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'local').split(',')[0].trim();
  const key = createHash('sha256').update(address).digest('hex');
  const bucket = requests.get(key) || { count: 0, reset: now + 10 * 60 * 1000 };
  if (bucket.count >= 3) {
    res.setHeader('Retry-After', String(Math.ceil((bucket.reset - now) / 1000)));
    throw new ContactError(429, 'You have sent a few messages recently. Please try again in 10 minutes or contact me on WhatsApp.');
  }
  if (!requests.has(key) && requests.size >= 2000) throw new ContactError(503, 'The contact form is busy. Please try again shortly.');
  bucket.count += 1;
  requests.set(key, bucket);
}

function smtpSettings() {
  const host = process.env.SMTP_HOST?.trim() || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT?.trim() || 465);
  const user = process.env.SMTP_USER?.trim();
  const pass = host === 'smtp.gmail.com' ? process.env.SMTP_PASS?.replace(/\s/g, '') : process.env.SMTP_PASS;
  const sender = process.env.SMTP_FROM?.trim() || user;
  const secureSetting = process.env.SMTP_SECURE?.trim();
  if (!user || !pass || !sender || !emailPattern.test(sender) || !Number.isInteger(port) || port < 1 || port > 65535 || (secureSetting && !['true', 'false'].includes(secureSetting))) {
    throw new ContactError(503, 'The contact form is temporarily unavailable. Please email me directly or use WhatsApp.');
  }
  const secure = secureSetting ? secureSetting === 'true' : port === 465;
  return {
    sender,
    options: {
      host, port, secure, requireTLS: !secure,
      auth: { user, pass },
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000, dnsTimeout: 10000,
      disableFileAccess: true, disableUrlAccess: true,
    },
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'Method not allowed.' });
  }
  try {
    if (req.headers['sec-fetch-site'] === 'cross-site') throw new ContactError(403, 'Please send your message from the portfolio contact form.');
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw new ContactError(415, 'Send your message as JSON.');
    const body = await readBody(req);
    // Bots often populate this field; real visitors never see it.
    if (typeof body?.website === 'string' && body.website.trim()) return send(res, 200, { ok: true });
    const { name, from, message } = validate(body);
    const { sender, options } = smtpSettings();
    throttle(req, res);
    const transport = nodemailer.createTransport(options);
    const result = await transport.sendMail({
      from: { name: 'Om Zala Portfolio', address: sender },
      to: email,
      replyTo: { name, address: from },
      subject: `Portfolio enquiry from ${name}`,
      text: `New message from your portfolio contact form.\n\nName: ${name}\nEmail: ${from}\n\n${message}`,
    });
    if (!result.accepted?.some(address => String(address).toLowerCase() === email.toLowerCase())) throw new Error('Recipient not accepted');
    return send(res, 200, { ok: true });
  } catch (error) {
    if (error instanceof ContactError) return send(res, error.status, { error: error.message });
    // Never expose SMTP credentials, provider diagnostics or visitor messages.
    return send(res, 502, { error: 'I could not confirm that your message was sent. Please contact me on WhatsApp or email me directly.' });
  }
}
