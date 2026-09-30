import { useRef, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowUp, ArrowUpRight, Check, Copy, Download, FileText, Mail, MapPin, Send } from 'lucide-react';
import { FadeUp, Github, Kicker, Linkedin, Magnetic, RevealText, useTilt } from '../components/ui.jsx';
import { useIST } from '../components/Header.jsx';
import { email, github, linkedin, resume } from '../data.js';

function Social({ href, icon, name, handle, accent, download, external, delay }) {
  const tilt = useTilt(14);
  return <FadeUp delay={delay} className="social-cell">
    <a ref={tilt} href={href} className={accent ? 'social tilt accent' : 'social tilt'} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})} {...(download ? { download: 'Om_Zala_Resume_2026.pdf' } : {})}>
      <span className="social-icon">{icon}</span>
      <span className="social-text"><strong>{name}</strong><small>{handle}</small></span>
      <span className="social-arrow">{download ? <Download size={17} /> : <ArrowUpRight size={17} />}</span>
    </a>
  </FadeUp>;
}

export function Contact() {
  const [copied, setCopied] = useState('');
  const [sent, setSent] = useState(false);
  const copyEmail = async () => {
    try { await navigator.clipboard.writeText(email); setCopied('Email copied to clipboard.'); }
    catch { setCopied('Please select and copy the email address.'); }
    setTimeout(() => setCopied(''), 2600);
  };
  const submit = event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const subject = `Hello from ${data.get('name')}`;
    const body = `${data.get('message')}\n\n— ${data.get('name')}${data.get('from') ? ` (${data.get('from')})` : ''}`;
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setSent(true);
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
      <p className="contact-meta"><MapPin size={15} aria-hidden="true" /> Vadodara, India · IST (UTC+5:30) · usually replies within a day</p>
      <div className="socials" aria-label="Find me online">
        <Social href={github} icon={<Github size={24} />} name="GitHub" handle="@Omzala" external delay={0} />
        <Social href={linkedin} icon={<Linkedin size={24} />} name="LinkedIn" handle="in/om-zala" external delay={0.06} />
        <Social href={`mailto:${email}`} icon={<Mail size={24} />} name="Email" handle="Say hello" delay={0.12} />
        <Social href={resume} icon={<FileText size={24} />} name="Résumé" handle="PDF · 2026" accent download delay={0.18} />
      </div>
    </div>
    <FadeUp as="form" className="card contact-form" onSubmit={submit} delay={0.1}>
      <div className="form-head"><span>Transmission</span><span><i className="pulse-dot" /> Channel open</span></div>
      <label className="field"><span>Your name</span><input name="name" required autoComplete="name" placeholder="Ada Lovelace" /></label>
      <label className="field"><span>Your email <small>(optional)</small></span><input name="from" type="email" autoComplete="email" placeholder="ada@example.com" /></label>
      <label className="field"><span>Message</span><textarea name="message" required rows={5} placeholder="Tell me about your project, team or idea…" /></label>
      <button type="submit" className="btn btn-light btn-wide">Send transmission <Send size={17} /></button>
      <small className="form-note" role="status">{sent ? 'Your email app should open with the message ready to send.' : 'This opens your email app with the message ready to go.'}</small>
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
