import { useRef, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowUp, ArrowUpRight, Check, Copy, Download, FileText, Mail, MapPin, MessageCircle, Send } from 'lucide-react';
import { FadeUp, Github, Kicker, Linkedin, Magnetic, RevealText, useTilt } from '../components/ui.jsx';
import { useIST } from '../components/Header.jsx';
import { email, github, linkedin, phone, resume, whatsapp } from '../data.js';

function Social({ href, icon, name, handle, accent, download, external, delay }) {
  const tilt = useTilt(14);
  return <FadeUp delay={delay} className="social-cell">
    <a ref={tilt} href={href} className={accent ? 'social tilt accent' : 'social tilt'} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})} {...(download ? { download: true } : {})}>
      <span className="social-icon">{icon}</span>
      <span className="social-text"><strong>{name}</strong><small>{handle}</small></span>
      <span className="social-arrow">{download ? <Download size={17} /> : <ArrowUpRight size={17} />}</span>
    </a>
  </FadeUp>;
}

export function Contact() {
  const [copied, setCopied] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const sending = status === 'sending';
  const copyEmail = async () => {
    try { await navigator.clipboard.writeText(email); setCopied('Email copied to clipboard.'); }
    catch { setCopied('Please select and copy the email address.'); }
    setTimeout(() => setCopied(''), 2600);
  };
  const submit = async event => {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    submitting.current = true;
    setStatus('sending');
    setError('');
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(60000),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.ok !== true) throw new Error(result?.error || 'Your message could not be sent. Please try again or use WhatsApp.');
      form.reset();
      setStatus('sent');
    } catch (failure) {
      setStatus('error');
      setError(failure.name === 'TimeoutError' || failure.name === 'AbortError'
        ? 'Sending took too long to confirm. Please check with me on WhatsApp before resending.'
        : failure instanceof TypeError ? 'Could not connect. Your message is still here; please try again or use WhatsApp.' : failure.message);
    } finally {
      submitting.current = false;
    }
  };
  return <section id="contact" className="contact shell">
    <div className="contact-copy">
      <Kicker index="04">Open channel</Kicker>
      <RevealText className="contact-title">Let's build something <em>out of this world.</em></RevealText>
      <FadeUp className="email-pill">
        <Mail size={20} aria-hidden="true" />
        <a href={`mailto:${email}`}>{email}</a>
        <button type="button" className="icon-btn solid" onClick={copyEmail} aria-label="Copy email address">{copied.startsWith('Email') ? <Check size={17} /> : <Copy size={17} />}</button>
      </FadeUp>
      <span className="copy-status" role="status">{copied}</span>
      <FadeUp className="whatsapp-contact">
        <a className="btn btn-whatsapp" href={whatsapp} target="_blank" rel="noopener noreferrer">
          <MessageCircle size={20} aria-hidden="true" /> Chat on WhatsApp <ArrowUpRight size={17} aria-hidden="true" />
        </a>
        <span>{phone}</span>
      </FadeUp>
      <p className="contact-meta"><MapPin size={15} aria-hidden="true" /> Vadodara, India · IST (UTC+5:30) · usually replies within a day</p>
      <div className="socials" aria-label="Find me online">
        <Social href={github} icon={<Github size={24} />} name="GitHub" handle="@Omzala" external delay={0} />
        <Social href={linkedin} icon={<Linkedin size={24} />} name="LinkedIn" handle="in/om-zala" external delay={0.06} />
        <Social href={`mailto:${email}`} icon={<Mail size={24} />} name="Email" handle="Say hello" delay={0.12} />
        <Social href={resume} icon={<FileText size={24} />} name="Résumé" handle="PDF · 2026" accent download delay={0.18} />
      </div>
    </div>
    <FadeUp as="form" className="card contact-form" onSubmit={submit} aria-busy={sending} aria-describedby="contact-status" delay={0.1}>
      <div className="form-head"><span>Transmission</span><span><i className="pulse-dot" /> Channel open</span></div>
      <label className="field"><span>Your name</span><input name="name" required maxLength={100} disabled={sending} autoComplete="name" placeholder="Ada Lovelace" /></label>
      <label className="field"><span>Your email</span><input name="from" type="email" required maxLength={254} disabled={sending} autoComplete="email" placeholder="ada@example.com" /></label>
      <label className="field"><span>Message</span><textarea name="message" required maxLength={5000} disabled={sending} rows={5} placeholder="Tell me about your project, team or idea…" /></label>
      <label className="contact-honeypot" aria-hidden="true">Leave this empty<input name="website" tabIndex={-1} autoComplete="off" /></label>
      <button type="submit" className="btn btn-light btn-wide" disabled={sending}>{sending ? 'Sending…' : 'Send transmission'} <Send size={17} aria-hidden="true" /></button>
      <small id="contact-status" className={`form-note${status === 'error' ? ' form-error' : status === 'sent' ? ' form-success' : ''}`} role={status === 'error' ? 'alert' : 'status'}>
        {status === 'error' ? error : status === 'sent' ? 'Message sent! Thanks for reaching out. I’ll get back to you soon.' : sending ? 'Sending your message…' : 'Your message goes straight to my inbox. I’ll reply to your email.'}
      </small>
    </FadeUp>
  </section>;
}

export function Footer() {
  const ref = useRef(null);
  const time = useIST();
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end end'] });
  // The outlined name fills in, left to right, as you reach the bottom.
  const clipPath = useTransform(scrollYProgress, [0.2, 1], ['inset(0% 100% 0% 0%)', 'inset(0% 0% 0% 0%)']);
  const y = useTransform(scrollYProgress, [0, 1], ['40%', '0%']);
  return <footer className="footer" ref={ref}>
    <div className="footer-row shell">
      <span>© {new Date().getFullYear()} Om Zala · Built with React, Three.js &amp; Framer Motion</span>
      <span className="footer-time"><span className="pulse-dot" /> {time} in Vadodara</span>
      <Magnetic><a className="btn btn-ghost btn-small" href="#home">Back to orbit <ArrowUp size={16} /></a></Magnetic>
    </div>
    <motion.div className="footer-name" style={{ y }} aria-hidden="true">
      <span className="outline-text">OM ZALA</span>
      <motion.span className="footer-fill" style={{ clipPath }}>OM ZALA</motion.span>
    </motion.div>
  </footer>;
}
