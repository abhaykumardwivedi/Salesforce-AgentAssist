import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { LifeBuoy, Send } from 'lucide-react';
import { getWidgetPublicInfo, widgetAsk, widgetEscalate } from '../api/client.js';

export function HelpWidgetPage() {
  const { key } = useParams();
  const [tenantName, setTenantName] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showEscalate, setShowEscalate] = useState(false);

  useEffect(() => {
    getWidgetPublicInfo(key).then((info) => setTenantName(info.tenantName)).catch(() => setInvalid(true));
  }, [key]);

  const ask = async (event) => {
    event.preventDefault();
    if (!question.trim()) return;
    setLoading(true);
    setAnswer(null);
    try {
      setAnswer(await widgetAsk(key, question.trim()));
    } catch {
      setAnswer({ answer: 'Sorry, something went wrong. Please try again.', articles: [] });
    } finally {
      setLoading(false);
    }
  };

  if (invalid) {
    return (
      <div className="auth-shell">
        <div className="auth-card"><h1>Help unavailable</h1><p className="muted small">This help link is not valid.</p></div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card" style={{ maxWidth: 560 }}>
        <div className="brand"><LifeBuoy size={18} /><strong>{tenantName || 'Support'} Help Center</strong></div>
        <h1>How can we help?</h1>
        <p className="muted small">Ask a question and our assistant will answer instantly from our help articles.</p>

        <form className="chat-form" onSubmit={ask}>
          <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. How do I get a refund?" />
          <button className="btn primary" type="submit" disabled={loading}><Send size={16} /> Ask</button>
        </form>

        {loading && <p className="muted small">Searching our help center…</p>}

        {answer && (
          <div className="panel" style={{ marginTop: 14 }}>
            <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{answer.answer}</p>
            {answer.articles?.length > 0 && (
              <p className="muted small" style={{ marginTop: 8 }}>Based on: {answer.articles.join(', ')}</p>
            )}
            <div className="toolbar" style={{ marginTop: 12 }}>
              <span className="muted small">Didn’t solve your problem?</span>
              <button className="btn" type="button" onClick={() => setShowEscalate((v) => !v)}>Contact a human</button>
            </div>
          </div>
        )}

        {showEscalate && <EscalateForm widgetKey={key} defaultSubject={question} />}
      </div>
    </div>
  );
}

function EscalateForm({ widgetKey, defaultSubject }) {
  const [form, setForm] = useState({ name: '', email: '', subject: defaultSubject || '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      setResult(await widgetEscalate(widgetKey, form));
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create your request.');
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="panel" style={{ marginTop: 12 }}>
        <p className="form-ok">Thanks! We’ve created your support request <strong>{result.reference}</strong>. Our team will follow up by email.</p>
      </div>
    );
  }

  return (
    <form className="form" onSubmit={submit} style={{ marginTop: 12 }}>
      <div className="inline-form">
        <input placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
      </div>
      <input placeholder="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required />
      <textarea
        placeholder="Describe your issue"
        value={form.message}
        onChange={(e) => setForm({ ...form, message: e.target.value })}
        required
        style={{ minHeight: 100, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8 }}
      />
      {error && <p className="form-error">{error}</p>}
      <button className="btn primary" type="submit" disabled={submitting}>{submitting ? 'Sending...' : 'Submit request'}</button>
    </form>
  );
}
