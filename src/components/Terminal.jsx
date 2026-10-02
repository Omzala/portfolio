import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, RotateCcw, Send, Sparkles } from 'lucide-react';
import { resume } from '../data.js';

const suggestions = ['Tell me about yourself', 'What have you built?', 'Tell me about your experience'];
const welcome = "Hey, I'm Om's AI avatar. Ask me about my experience, skills, or projects — I'll answer using my resume and portfolio.";

export default function Terminal() {
  const screen = useRef(null);
  const input = useRef(null);
  const conversation = useRef([]);
  const activeRequest = useRef(null);
  const [messages, setMessages] = useState([]);
  const [value, setValue] = useState('');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState(null);

  useEffect(() => () => activeRequest.current?.abort(), []);
  // Only scroll the transcript; incoming replies must never move the page.
  useEffect(() => {
    if (screen.current) screen.current.scrollTop = screen.current.scrollHeight;
  }, [messages, pending, failure]);

  async function ask(question, retry = false) {
    const text = question.trim();
    if (!text || text.length > 1500 || activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 30000);
    setPending(true);
    setFailure(null);
    if (!retry) {
      setValue('');
      setMessages(current => [...current, { role: 'user', text }].slice(-25));
    }
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: conversation.current }),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || typeof data?.reply !== 'string' || !data.reply.trim()) {
        throw new Error(data?.error || 'The chat is unavailable right now. Please try again.');
      }
      if (controller.signal.aborted) return;
      conversation.current = [...conversation.current, { role: 'user', text }, { role: 'model', text: data.reply }].slice(-12);
      setMessages(current => [...current, { role: 'model', text: data.reply }].slice(-26));
    } catch (error) {
      if (controller.signal.aborted && !timedOut) return;
      setFailure({ question: text, message: timedOut ? 'That reply took too long. Please try again.' : error instanceof TypeError ? 'Could not connect. Check your connection and try again.' : error.message });
    } finally {
      clearTimeout(timer);
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setPending(false);
      }
    }
  }

  function clear() {
    activeRequest.current?.abort();
    activeRequest.current = null;
    conversation.current = [];
    setMessages([]);
    setValue('');
    setFailure(null);
    setPending(false);
    input.current?.focus({ preventScroll: true });
  }

  return <div className="card terminal">
    <div className="terminal-bar">
      <Sparkles size={16} className="t-prompt" aria-hidden="true" />
      <span>Ask Om <b>AI avatar</b></span>
      <button type="button" className="chat-reset" onClick={clear} aria-label="Start a new chat" title="Start a new chat"><RotateCcw size={16} /></button>
    </div>
    <div className="terminal-screen" ref={screen} role="log" aria-live="polite" aria-relevant="additions text" aria-label="Chat with Om" tabIndex={0}>
      <div className="chat-message chat-model"><span className="chat-author">OM / AI</span><p>{welcome}</p></div>
      {messages.map((message, index) => <div key={index} className={`chat-message chat-${message.role}`}>
        <span className="chat-author">{message.role === 'user' ? 'YOU' : 'OM / AI'}</span>
        <p>{message.text}</p>
      </div>)}
      {pending && <div className="chat-thinking" role="status"><span className="caret" aria-hidden="true" /> Thinking…</div>}
    </div>
    {failure && <div className="chat-error"><p role="alert">{failure.message}</p><button type="button" className="kbd" onClick={() => ask(failure.question, true)}>Retry</button></div>}
    {!messages.length && <div className="chat-suggestions" aria-label="Suggested questions">
      {suggestions.map(question => <button type="button" key={question} onClick={() => ask(question)} disabled={pending}>{question}<ArrowUpRight size={12} aria-hidden="true" /></button>)}
    </div>}
    <form className="terminal-input" onSubmit={event => { event.preventDefault(); ask(value); }}>
      <input ref={input} value={value} onChange={event => setValue(event.target.value)} aria-label="Ask Om a question" placeholder="Ask me anything about my work…" maxLength={1500} autoComplete="off" enterKeyHint="send" readOnly={pending} />
      <button type="submit" className="chat-send" aria-label="Send message" disabled={pending || !value.trim()}><Send size={17} /></button>
    </form>
    <div className="chat-foot"><span>AI answers · Powered by Gemini</span><a href={resume} download>My resume <ArrowUpRight size={12} aria-hidden="true" /></a></div>
  </div>;
}
