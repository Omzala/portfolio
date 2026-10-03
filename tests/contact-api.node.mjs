import { test, afterEach, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import nodemailer from 'nodemailer';
import handler from '../api/contact.js';

const keys = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM'];
const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
const visitor = { name: 'Ada Lovelace', from: 'ada@example.com', message: 'Hello Om, let’s build something together.', website: '' };
let sequence = 0;
beforeEach(() => {
  for (const key of keys) delete process.env[key];
  process.env.SMTP_USER = 'omzala635@gmail.com';
  process.env.SMTP_PASS = 'test app password';
});
afterEach(() => {
  mock.restoreAll();
  for (const key of keys) {
    if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key];
  }
});

async function invoke(body = visitor, options = {}) {
  const req = Readable.from(options.chunks || []);
  Object.assign(req, {
    method: options.method || 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': options.address || `contact-test-${sequence++}`, ...options.headers },
    ...(options.chunks ? {} : { body }),
  });
  const res = { headers: {}, setHeader(key, value) { this.headers[key.toLowerCase()] = value; }, end(raw) { this.body = JSON.parse(raw); } };
  await handler(req, res);
  return res;
}

function smtp(sendMail = async () => ({ accepted: ['omzala635@gmail.com'] })) {
  return mock.method(nodemailer, 'createTransport', options => ({ sendMail: message => sendMail(message, options) }));
}

test('sends only to Om through authenticated TLS SMTP and replies to the visitor', async () => {
  let sent;
  smtp(async (message, options) => { sent = { message, options }; return { accepted: ['omzala635@gmail.com'] }; });
  const res = await invoke({ ...visitor, to: 'attacker@example.com', bcc: 'attacker@example.com', subject: 'Override', html: '<script>alert(1)</script>' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(sent.options.host, 'smtp.gmail.com');
  assert.equal(sent.options.port, 465);
  assert.equal(sent.options.secure, true);
  assert.deepEqual(sent.options.auth, { user: 'omzala635@gmail.com', pass: 'testapppassword' });
  assert.equal(sent.message.to, 'omzala635@gmail.com');
  assert.equal(sent.message.from.address, 'omzala635@gmail.com');
  assert.deepEqual(sent.message.replyTo, { name: visitor.name, address: visitor.from });
  assert.equal(sent.message.subject, 'Portfolio enquiry from Ada Lovelace');
  assert.ok(sent.message.text.includes(visitor.message));
  assert.equal(sent.message.bcc, undefined);
  assert.equal(sent.message.html, undefined);
  assert.doesNotMatch(JSON.stringify(res.body), /testapppassword|ada@example/);
});

test('accepts Vercel parsed, string and buffer bodies and split UTF-8 streams', async () => {
  const messages = [];
  smtp(async message => { messages.push(message.text); return { accepted: ['omzala635@gmail.com'] }; });
  const payload = JSON.stringify({ ...visitor, message: 'નમસ્તે Om! 👋' });
  for (const body of [JSON.parse(payload), payload, Buffer.from(payload)]) assert.equal((await invoke(body)).statusCode, 200);
  assert.equal((await invoke(undefined, { chunks: Array.from(Buffer.from(payload), byte => Buffer.from([byte])) })).statusCode, 200);
  assert.ok(messages.every(text => text.includes('નમસ્તે Om! 👋')));
});

test('validates input, body sizes and methods before connecting to SMTP', async () => {
  const transport = smtp();
  for (const body of ['{', null, [], {}, { ...visitor, name: ' ' }, { ...visitor, name: 'a'.repeat(101) }, { ...visitor, name: 'Ada\r\nBcc: victim@example.com' }, { ...visitor, from: '' }, { ...visitor, from: 'invalid-email' }, { ...visitor, from: 'ada@example.com\r\nBcc: victim@example.com' }, { ...visitor, from: 'a@example.com,b@example.com' }, { ...visitor, message: ' ' }, { ...visitor, message: 'a'.repeat(5001) }]) {
    assert.equal((await invoke(body)).statusCode, 400);
  }
  assert.equal((await invoke({ ...visitor, message: 'a'.repeat(40000) })).statusCode, 413);
  assert.equal((await invoke(undefined, { chunks: [Buffer.alloc(40000)] })).statusCode, 413);
  assert.equal((await invoke(visitor, { headers: { 'content-length': '40000' } })).statusCode, 413);
  assert.equal((await invoke(visitor, { headers: { 'content-type': 'text/plain' } })).statusCode, 415);
  assert.equal((await invoke(visitor, { headers: { 'sec-fetch-site': 'cross-site' } })).statusCode, 403);
  const get = await invoke(visitor, { method: 'GET' });
  assert.equal(get.statusCode, 405);
  assert.equal(get.headers.allow, 'POST');
  assert.equal(transport.mock.callCount(), 0);
});

test('bot-trap submissions do not send mail', async () => {
  const transport = smtp();
  assert.equal((await invoke({ ...visitor, website: 'https://spam.example' })).statusCode, 200);
  assert.equal(transport.mock.callCount(), 0);
});

test('missing or invalid configuration returns an actionable error without SMTP access', async () => {
  const transport = smtp();
  delete process.env.SMTP_PASS;
  const missing = await invoke();
  assert.equal(missing.statusCode, 503);
  assert.match(missing.body.error, /WhatsApp/);
  process.env.SMTP_PASS = 'test-password';
  for (const [key, value] of [['SMTP_PORT', 'invalid'], ['SMTP_SECURE', 'invalid'], ['SMTP_FROM', 'bad-address']]) {
    process.env[key] = value;
    assert.equal((await invoke()).statusCode, 503);
    delete process.env[key];
  }
  assert.equal(transport.mock.callCount(), 0);
});

test('supports other SMTP accounts with required STARTTLS and an authorized sender', async () => {
  Object.assign(process.env, { SMTP_HOST: 'smtp.example.com', SMTP_PORT: '587', SMTP_USER: 'smtp-login', SMTP_PASS: 'keep spaces intact', SMTP_FROM: 'hello@example.com' });
  let sent;
  smtp(async (message, options) => { sent = { message, options }; return { accepted: ['omzala635@gmail.com'] }; });
  assert.equal((await invoke()).statusCode, 200);
  assert.equal(sent.options.secure, false);
  assert.equal(sent.options.requireTLS, true);
  assert.equal(sent.options.auth.pass, 'keep spaces intact');
  assert.equal(sent.message.from.address, 'hello@example.com');
});

test('SMTP rejection and errors never report success or expose provider secrets', async () => {
  for (const sendMail of [async () => { throw new Error('AUTH failed: testapppassword'); }, async () => ({ accepted: [], rejected: ['omzala635@gmail.com'] }), async () => ({ accepted: ['someone-else@example.com'] })]) {
    smtp(sendMail);
    const res = await invoke();
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.ok, undefined);
    assert.doesNotMatch(res.body.error, /AUTH|testapppassword/);
    mock.restoreAll();
  }
});

test('waits for SMTP acceptance before acknowledging a submission', async () => {
  let release;
  smtp(() => new Promise(resolve => { release = resolve; }));
  let settled = false;
  const pending = invoke().then(result => { settled = true; return result; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false);
  release({ accepted: ['omzala635@gmail.com'] });
  assert.equal((await pending).statusCode, 200);
});

test('throttles repeated messages before sending more email', async () => {
  const transport = smtp();
  for (let index = 0; index < 3; index++) assert.equal((await invoke(visitor, { address: 'same-visitor' })).statusCode, 200);
  const limited = await invoke(visitor, { address: 'same-visitor' });
  assert.equal(limited.statusCode, 429);
  assert.ok(Number(limited.headers['retry-after']) > 0);
  assert.equal(transport.mock.callCount(), 3);
});
