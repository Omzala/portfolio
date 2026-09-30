import { useEffect, useRef, useState } from 'react';
import { useInView } from 'framer-motion';
import { email, github, linkedin, projects, resume } from '../data.js';
import { scrollToId } from '../lib/scroll.js';

const PROMPT = '➜';
const intro = [
  { kind: 'in', text: 'whoami' },
  { kind: 'out', text: 'om zala — full stack developer, vadodara IN' },
  { kind: 'in', text: 'cat stack.txt' },
  { kind: 'out', text: 'react · node · express · mongodb · three.js' },
  { kind: 'in', text: './sprinkle --ai gemini' },
  { kind: 'ok', text: '✓ ai features online' },
  { kind: 'out', text: "type 'help' to see what else this thing does" },
];

const time = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }).format(new Date());

function run(raw) {
  const [command = '', ...args] = raw.trim().split(/\s+/);
  const name = command.toLowerCase();
  switch (name) {
    case '': return [];
    case 'help': return [
      'about      who is om?',
      'stack      the toolbelt',
      'projects   list every mission',
      'open <n>   launch project n',
      'play       fly to the arcade',
      'hire       open a channel',
      'socials    github, linkedin, email',
      'resume     download the pdf',
      'time       clock in vadodara',
      'clear      wipe the screen',
    ].map(text => ({ kind: 'out', text }));
    case 'about': case 'whoami': return [{ kind: 'out', text: 'om zala — full stack developer from vadodara, india. builds mern apps with a little ai magic and a lot of care for tiny details.' }];
    case 'stack': case 'skills': return [{ kind: 'out', text: 'react · node.js · express · mongodb · three.js · gemini ai · tailwind · python · mysql · rest apis' }];
    case 'projects': case 'ls': return [...projects.map((project, i) => ({ kind: 'out', text: `${String(i + 1).padStart(2, '0')}  ${project.name.toLowerCase()} — ${project.type.toLowerCase()}` })), { kind: 'ok', text: "try 'open 1'" }];
    case 'open': {
      const project = projects[Number(args[0]) - 1];
      if (!project) return [{ kind: 'err', text: `usage: open <1-${projects.length}>` }];
      if (!project.url) return [{ kind: 'err', text: `${project.name.toLowerCase()} is a private business app — no public demo` }];
      window.open(project.url, '_blank', 'noopener');
      return [{ kind: 'ok', text: `launching ${project.url}` }];
    }
    case 'play': case 'game': case 'arcade': setTimeout(() => scrollToId('arcade'), 300); return [{ kind: 'ok', text: 'plotting course to the arcade…' }];
    case 'hire': case 'contact': setTimeout(() => scrollToId('contact'), 300); return [{ kind: 'ok', text: 'opening a channel…' }];
    case 'socials': return [{ kind: 'out', text: `github   ${github}` }, { kind: 'out', text: `linkedin ${linkedin}` }, { kind: 'out', text: `email    ${email}` }];
    case 'resume': case 'cv': {
      const link = Object.assign(document.createElement('a'), { href: resume, download: 'Om_Zala_Resume_2026.pdf' });
      link.click();
      return [{ kind: 'ok', text: 'downloading Om_Zala_Resume_2026.pdf' }];
    }
    case 'time': case 'date': return [{ kind: 'out', text: `${time()} in vadodara (IST)` }];
    case 'sudo': return [{ kind: 'err', text: 'nice try. bandit has root.' }];
    case 'bandit': case 'raccoon': return [{ kind: 'out', text: 'bandit: *steals your cursor, returns it slightly shinier*' }];
    case 'echo': return [{ kind: 'out', text: args.join(' ') }];
    case 'rm': return [{ kind: 'err', text: 'whoa. not on my ship.' }];
    case 'exit': return [{ kind: 'out', text: 'there is no escape. only more portfolio.' }];
    default: return [{ kind: 'err', text: `command not found: ${command} — try 'help'` }];
  }
}

export default function Terminal() {
  const ref = useRef(null);
  const screen = useRef(null);
  const input = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-15% 0px' });
  const [lines, setLines] = useState([]);
  const [value, setValue] = useState('');
  const history = useRef([]);
  const cursor = useRef(0);
  const typing = useRef(null);
  const introDone = useRef(false);

  // Type the intro one line at a time the first time it scrolls in.
  useEffect(() => {
    if (!inView) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setLines(intro); introDone.current = true; return; }
    let i = 0;
    typing.current = setInterval(() => {
      i += 1;
      setLines(intro.slice(0, i));
      if (i >= intro.length) { clearInterval(typing.current); introDone.current = true; }
    }, 340);
    return () => clearInterval(typing.current);
  }, [inView]);
  useEffect(() => { const element = screen.current; if (element) element.scrollTop = element.scrollHeight; }, [lines]);

  const submit = event => {
    event.preventDefault();
    const command = value.trim();
    setValue('');
    if (command) { history.current.push(command); cursor.current = history.current.length; }
    // A command typed mid-intro finishes the intro at once rather than being overwritten by it.
    const skipped = !introDone.current;
    if (skipped) { clearInterval(typing.current); introDone.current = true; }
    if (command.toLowerCase() === 'clear') { setLines([]); return; }
    setLines(current => [...(skipped ? intro : current), { kind: 'in', text: command }, ...run(command)].slice(-80));
  };
  const onKeyDown = event => {
    if (event.key === 'ArrowUp' && history.current.length) {
      event.preventDefault();
      cursor.current = Math.max(0, cursor.current - 1);
      setValue(history.current[cursor.current]);
    }
    if (event.key === 'ArrowDown' && history.current.length) {
      event.preventDefault();
      cursor.current = Math.min(history.current.length, cursor.current + 1);
      setValue(history.current[cursor.current] ?? '');
    }
  };

  return <div className="card terminal" ref={ref} onClick={() => input.current?.focus({ preventScroll: true })}>
    <div className="terminal-bar"><i /><i /><i /><span>~/om — mission.log</span></div>
    <div className="terminal-screen" ref={screen} data-lenis-prevent role="log" aria-live="polite" aria-label="Terminal output">
      {lines.map((line, i) => <p key={i} className={`t-${line.kind}`}>{line.kind === 'in' && <span className="t-prompt">{PROMPT} </span>}{line.text}</p>)}
      <p className="t-in"><span className="t-prompt">{PROMPT} </span><span className="caret" /></p>
    </div>
    <form className="terminal-input" onSubmit={submit}>
      <span className="t-prompt" aria-hidden="true">{PROMPT}</span>
      <input ref={input} value={value} onChange={event => setValue(event.target.value)} onKeyDown={onKeyDown} aria-label="Terminal command" placeholder="type a command… try help" autoComplete="off" autoCapitalize="off" spellCheck="false" />
      <button type="submit" className="kbd">Enter</button>
    </form>
  </div>;
}
