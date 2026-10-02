import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { FadeUp, Kicker, Magnetic, RevealText } from '../components/ui.jsx';
import Terminal from '../components/Terminal.jsx';
import Toolbelt from '../components/Toolbelt.jsx';

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(timer); }, []);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now).map(({ type, value }) => [type, value]));
  const hour = Number(parts.hour);
  const mood = hour < 6 ? 'probably asleep' : hour < 10 ? 'on first coffee' : hour < 19 ? 'shipping code' : 'late-night building';
  return <div className="card clock">
    <div className="orbit" aria-hidden="true"><i className="orbit-a" /><i className="orbit-b" /><b className="orbit-moon" /></div>
    <span className="card-label">Local time · Vadodara</span>
    <div>
      <strong className="clock-time"><span>{parts.hour}:{parts.minute}</span><small>:{parts.second}</small></strong>
      <p className="muted">IST · UTC+5:30 · {mood}</p>
    </div>
  </div>;
}

export default function About() {
  return <section id="about" className="about shell">
    <div className="section-head">
      <div>
        <Kicker index="01">Mission control</Kicker>
        <RevealText>Meet the <em>pilot</em></RevealText>
      </div>
      <FadeUp as="p" className="section-lede">Get to know me. Ask my AI avatar about my work, flip gravity off, fling the tool pills around.</FadeUp>
    </div>
    <div className="bento">
      <FadeUp className="bento-terminal"><Terminal /></FadeUp>
      <FadeUp className="bento-clock" delay={0.08}><Clock /></FadeUp>
      <FadeUp className="bento-status" delay={0.16}>
        <div className="card status-card">
          <span className="card-label">Status</span>
          <div>
            <strong>Open to full stack &amp; MERN roles</strong>
            <Magnetic><a className="btn btn-dark btn-small" href="#contact">Hire Om <ArrowUpRight size={16} /></a></Magnetic>
          </div>
        </div>
      </FadeUp>
      <FadeUp className="bento-tools" delay={0.1}><Toolbelt /></FadeUp>
    </div>
  </section>;
}
