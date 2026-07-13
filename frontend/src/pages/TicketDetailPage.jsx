import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowDownToLine, Clock, Copy, Languages, Sparkles, UserRound, Wand2 } from 'lucide-react';
import {
  assignTicket,
  draftTicketReply,
  getAssignees,
  getSimilarTickets,
  getTicket,
  getTicketMessages,
  postTicketMessage,
  translateTicket,
} from '../api/client.js';
import { Badge } from '../components/Badge.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { dateTime } from '../utils/format.js';

const TONES = ['FRIENDLY', 'EMPATHETIC', 'FORMAL', 'CONCISE'];
const breachTone = { BREACHED: 'tone-red', HIGH: 'tone-orange', MEDIUM: 'tone-amber', LOW: 'tone-green' };

export function TicketDetailPage() {
  const { id } = useParams();
  const [ticket, setTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [similar, setSimilar] = useState([]);
  const [loading, setLoading] = useState(true);
  const [composer, setComposer] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      getTicket(id),
      getTicketMessages(id).catch(() => []),
      getSimilarTickets(id).catch(() => []),
      getAssignees().catch(() => []),
    ])
      .then(([ticketData, messageData, similarData, assigneeData]) => {
        if (!active) return;
        setTicket(ticketData);
        setMessages(messageData);
        setSimilar(similarData);
        setAssignees(assigneeData);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  const refresh = async () => {
    const [ticketData, messageData] = await Promise.all([getTicket(id), getTicketMessages(id)]);
    setTicket(ticketData);
    setMessages(messageData);
  };

  const onAssign = async (userId) => {
    const result = await assignTicket(id, userId === '' ? null : Number(userId));
    setTicket((prev) => ({ ...prev, assignedUserId: result.assignedUserId, assignedUserName: result.assignedUserName }));
  };

  if (loading) return <EmptyState title="Loading ticket..." />;
  if (!ticket) return <EmptyState title="Ticket not found" />;

  const sla = ticket.prediction;

  return (
    <div className="page">
      <header className="page-header">
        <p><Link className="link" to="/tickets">Tickets</Link> / #{ticket.id}</p>
        <h1>{ticket.subject}</h1>
        <p className="muted">
          <Link className="link" to={`/customers/${ticket.customerId}`}>{ticket.customerName}</Link> · {ticket.assignedTeam}
        </p>
      </header>

      <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <Badge value={ticket.category} />
        <Badge value={ticket.priority} />
        <Badge value={ticket.sentiment} />
        <Badge value={ticket.status} />
        {ticket.language && ticket.language !== 'English' && (
          <span className="badge tone-purple"><Languages size={12} style={{ marginRight: 4 }} />{ticket.language}</span>
        )}
        {sla && (
          <span className={`badge ${breachTone[sla.breachRisk] || 'tone-gray'}`}>
            <Clock size={12} style={{ marginRight: 4 }} />
            SLA {sla.breachRisk === 'BREACHED' ? 'breached' : `${sla.breachRisk.toLowerCase()} risk`}
          </span>
        )}
      </div>

      <div className="two-col">
        <div className="stack-lg">
          <ConversationPanel ticket={ticket} messages={messages} composer={composer} setComposer={setComposer} onChanged={refresh} />
          <ReplyDrafter ticketId={ticket.id} language={ticket.language} onUseDraft={setComposer} />
        </div>

        <div className="stack-lg">
          <AssignmentPanel ticket={ticket} assignees={assignees} onAssign={onAssign} />

          {sla && (
            <section className="panel">
              <h2>Resolution forecast</h2>
              <p className="muted small">Estimated effort and SLA status for this ticket.</p>
              <div className="meter-row">
                <div className="meter-label"><span>Estimated resolution</span><strong>~{sla.estimatedHours}h</strong></div>
                <div className="meter-label"><span>SLA target</span><strong>{sla.targetHours}h</strong></div>
                <div className="meter-label"><span>Age</span><strong>{sla.ageHours}h</strong></div>
                <div className="meter-label"><span>Due</span><strong>{dateTime(sla.dueAt)}</strong></div>
              </div>
            </section>
          )}

          <section className="panel">
            <div className="toolbar"><h2>Similar past tickets</h2><Sparkles size={16} /></div>
            <p className="muted small">Retrieved from this workspace to guide resolution.</p>
            {similar.length === 0 ? <p className="muted small">No similar tickets found yet.</p> : similar.map((row) => (
              <div key={row.id} className="similar-item">
                <div className="similar-head">
                  <Link className="link" to={`/tickets/${row.id}`}><strong>{row.subject}</strong></Link>
                  <span className="score-pill">{Math.round(row.score * 100)}% match</span>
                </div>
                <p className="muted small" style={{ margin: '4px 0' }}>{row.customerName} · {row.category} · <Badge value={row.status} /></p>
                <p className="small" style={{ margin: 0 }}>{row.description}</p>
              </div>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}

function ConversationPanel({ ticket, messages, composer, setComposer, onChanged }) {
  const [isInternal, setIsInternal] = useState(false);
  const [translation, setTranslation] = useState(null);
  const [translating, setTranslating] = useState(false);
  const [sending, setSending] = useState(false);
  const nonEnglish = ticket.language && ticket.language !== 'English';

  const translate = async () => {
    setTranslating(true);
    try {
      setTranslation(await translateTicket(ticket.id, 'English'));
    } catch {
      setTranslation({ translation: 'Translation is unavailable right now.' });
    } finally {
      setTranslating(false);
    }
  };

  const send = async () => {
    if (!composer.trim()) return;
    setSending(true);
    try {
      await postTicketMessage(ticket.id, { body: composer.trim(), isInternal });
      setComposer('');
      await onChanged();
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="panel">
      <div className="toolbar">
        <h2>Conversation</h2>
        {nonEnglish && (
          <button className="btn small" type="button" onClick={translate} disabled={translating}>
            <Languages size={14} /> {translating ? 'Translating...' : 'Translate original'}
          </button>
        )}
      </div>

      <div className="thread">
        <Message authorType="CUSTOMER" name={ticket.customerName} body={ticket.description} createdAt={ticket.createdAt} />
        {translation && (
          <div className="msg customer" style={{ borderStyle: 'dashed' }}>
            <div className="msg-meta"><strong>English translation</strong></div>
            <div className="msg-body">{translation.translation}</div>
          </div>
        )}
        {messages.map((message) => (
          <Message
            key={message.id}
            authorType={message.authorType}
            name={message.authorName}
            body={message.body}
            createdAt={message.createdAt}
            isInternal={message.isInternal}
          />
        ))}
      </div>

      <div className="composer">
        <textarea
          value={composer}
          onChange={(e) => setComposer(e.target.value)}
          placeholder={isInternal ? 'Write an internal note (not visible to the customer)...' : 'Write a reply to the customer...'}
        />
        <div className="composer-bar">
          <label className="small"><input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} /> Internal note</label>
          <button className="btn primary" type="button" onClick={send} disabled={sending || !composer.trim()}>
            {sending ? 'Saving...' : isInternal ? 'Add note' : 'Send reply'}
          </button>
        </div>
      </div>
    </section>
  );
}

function Message({ authorType, name, body, createdAt, isInternal }) {
  const cls = isInternal ? 'internal' : authorType.toLowerCase();
  const who = authorType === 'CUSTOMER' ? (name || 'Customer') : authorType === 'SYSTEM' ? 'System' : (name || 'Agent');
  return (
    <div className={`msg ${cls}`}>
      <div className="msg-meta">
        <strong>{who}</strong>
        {isInternal && <span className="internal-note-badge">Internal note</span>}
        <span>{dateTime(createdAt)}</span>
      </div>
      <div className="msg-body">{body}</div>
    </div>
  );
}

function AssignmentPanel({ ticket, assignees, onAssign }) {
  return (
    <section className="panel">
      <div className="toolbar"><h2>Assignment</h2><UserRound size={16} /></div>
      <div className="assignee-bar">
        <select value={ticket.assignedUserId || ''} onChange={(e) => onAssign(e.target.value)}>
          <option value="">Unassigned</option>
          {assignees.map((agent) => <option key={agent.id} value={agent.id}>{agent.fullName}</option>)}
        </select>
      </div>
      <p className="muted small">
        {ticket.assignedUserName ? `Owned by ${ticket.assignedUserName}` : 'No owner assigned yet'} · Suggested team: {ticket.assignedTeam}
      </p>
    </section>
  );
}

function ReplyDrafter({ ticketId, language, onUseDraft }) {
  const [tone, setTone] = useState('FRIENDLY');
  const [instructions, setInstructions] = useState('');
  const [draft, setDraft] = useState('');
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = async () => {
    setLoading(true);
    setCopied(false);
    try {
      const result = await draftTicketReply(ticketId, { tone, instructions: instructions.trim() || undefined, language });
      setDraft(result.draft);
      setMeta({ mode: result.mode, sources: result.sources || [] });
    } catch {
      setDraft('Could not generate a reply. Please try again.');
      setMeta(null);
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <section className="panel">
      <div className="toolbar"><h2>AI reply draft</h2><Wand2 size={16} /></div>
      <p className="muted small">
        Grounded in customer context and the knowledge base. Always review before sending.
        {language && language !== 'English' && <> Written in <strong>{language}</strong> to match the customer.</>}
      </p>
      <div className="toolbar" style={{ gap: 8, flexWrap: 'wrap' }}>
        <select value={tone} onChange={(e) => setTone(e.target.value)}>
          {TONES.map((t) => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
        </select>
        <input
          style={{ flex: 1, minWidth: 180, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8 }}
          placeholder="Optional instruction (e.g. offer a refund)"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
        />
        <button className="btn primary" type="button" onClick={generate} disabled={loading}>
          {loading ? 'Drafting...' : draft ? 'Regenerate' : 'Draft reply'}
        </button>
      </div>

      {draft && (
        <>
          <textarea className="reply-box" style={{ marginTop: 12 }} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div className="composer-bar" style={{ marginTop: 8 }}>
            <button className="btn primary" type="button" onClick={() => onUseDraft(draft)}><ArrowDownToLine size={14} /> Use as reply</button>
            <button className="btn" type="button" onClick={copy}><Copy size={14} /> {copied ? 'Copied' : 'Copy'}</button>
            {meta && <span className="muted small">Mode: {meta.mode === 'REAL' ? 'OpenAI' : 'Local template'}</span>}
          </div>
          {meta?.sources?.length > 0 && (
            <div style={{ marginTop: 6 }}>
              {meta.sources.map((s) => <span key={`${s.type}-${s.id}`} className="source-chip">{s.type === 'ARTICLE' ? 'KB' : 'Ticket'}: {s.title}</span>)}
            </div>
          )}
        </>
      )}
    </section>
  );
}
