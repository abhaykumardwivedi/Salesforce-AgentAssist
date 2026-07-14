import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Send, Sparkles, Zap } from 'lucide-react';
import { askCopilot, executeCopilotAction } from '../api/client.js';

const SUGGESTIONS = [
  'Which customers are most at risk right now?',
  'Summarize open tickets for Nimbus Retail',
  'What are the recent high priority tickets?',
  'How should I handle a duplicate charge?',
];

export function CopilotPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [messages, loading]);

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setError(null);
    const next = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const result = await askCopilot(next.map((m) => ({ role: m.role, content: m.content })));
      setMessages([...next, { role: 'assistant', content: result.reply, sources: result.sources || [], actions: result.actions || [] }]);
    } catch (err) {
      setError(err.response?.data?.message || 'The copilot is unavailable right now.');
      setMessages(next);
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (event) => {
    event.preventDefault();
    send();
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1>Agent Copilot</h1>
        <p>Ask about customers, tickets, and knowledge. The copilot looks up live workspace data before answering.</p>
      </header>

      <section className="panel chat-shell">
        <div className="chat-log" ref={logRef}>
          {messages.length === 0 && !loading ? (
            <div className="chat-empty">
              <Sparkles size={22} />
              <p>Ask me anything about your workspace. Try one of these:</p>
              <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" className="btn" onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message, index) => (
              <div key={index} className={`chat-msg ${message.role}`}>
                {message.content}
                {message.sources?.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {message.sources.map((s) => (
                      <SourceChip key={`${s.type}-${s.id}`} source={s} />
                    ))}
                  </div>
                )}
                {message.actions?.length > 0 && (
                  <div className="action-list">
                    {message.actions.map((action) => (
                      <ActionCard key={action.id} action={action} />
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
          {loading && <div className="chat-msg assistant muted">Thinking…</div>}
        </div>

        {error && <p className="form-error">{error}</p>}

        <form className="chat-form" onSubmit={onSubmit}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the copilot..."
            disabled={loading}
          />
          <button className="btn primary" type="submit" disabled={loading || !input.trim()}><Send size={16} /> Send</button>
        </form>
      </section>
    </div>
  );
}

function ActionCard({ action }) {
  const [state, setState] = useState('pending'); // pending | running | done | error | dismissed
  const [result, setResult] = useState(null);

  const approve = async () => {
    setState('running');
    try {
      const response = await executeCopilotAction({
        type: action.type,
        ticketId: action.ticketId,
        body: action.body,
        isInternal: action.isInternal,
        status: action.status,
        userId: action.userId,
      });
      setResult(response.summary);
      setState('done');
    } catch (err) {
      setResult(err.response?.data?.message || 'Action failed.');
      setState('error');
    }
  };

  if (state === 'dismissed') return null;

  return (
    <div className="action-card">
      <div className="action-head">
        <Zap size={14} />
        <span>{action.label}</span>
      </div>
      {action.type === 'SEND_REPLY' && action.body && <p className="action-body">{action.body}</p>}
      {state === 'done' && <p className="action-status ok"><Check size={13} /> {result}</p>}
      {state === 'error' && <p className="action-status err">{result}</p>}
      {(state === 'pending' || state === 'running') && (
        <div className="action-buttons">
          <button className="btn primary small" type="button" onClick={approve} disabled={state === 'running'}>
            {state === 'running' ? 'Applying...' : 'Approve'}
          </button>
          <button className="btn small" type="button" onClick={() => setState('dismissed')} disabled={state === 'running'}>Dismiss</button>
        </div>
      )}
    </div>
  );
}

function SourceChip({ source }) {
  const label = { CUSTOMER: 'Customer', ARTICLE: 'KB', TICKET: 'Ticket' }[source.type] || source.type;
  const to = source.type === 'CUSTOMER' ? `/customers/${source.id}` : source.type === 'TICKET' ? `/tickets/${source.id}` : null;
  const body = <span className="source-chip">{label}: {source.title}</span>;
  return to ? <Link to={to}>{body}</Link> : body;
}
