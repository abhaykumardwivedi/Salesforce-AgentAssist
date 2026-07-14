import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  bulkImportCustomers,
  bulkImportTickets,
  createAutomationRule,
  createKbArticle,
  createUser,
  deleteAutomationRule,
  deleteKbArticle,
  disconnectIntegration,
  disconnectSalesforce,
  getAiUsage,
  getAuditLog,
  getAutomationRules,
  getIntegrations,
  getKbArticles,
  getSalesforceAuthorizeUrl,
  getSalesforceStatus,
  getSalesforceWebhook,
  getUsers,
  getWidgetSettings,
  rotateSalesforceWebhook,
  runSlaEscalation,
  saveOpenAiKey,
  setAiMonthlyLimit,
  updateAutomationRule,
  updateUser,
} from '../api/client.js';
import { Badge } from '../components/Badge.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { dateTime } from '../utils/format.js';

export function SettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'OWNER' || user?.role === 'ADMIN';
  const [searchParams, setSearchParams] = useSearchParams();
  const [integrations, setIntegrations] = useState([]);
  const [salesforce, setSalesforce] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = () => Promise.all([getIntegrations(), getSalesforceStatus()])
    .then(([integrationData, sfData]) => {
      setIntegrations(integrationData);
      setSalesforce(sfData);
    });

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const sf = searchParams.get('salesforce');
    if (sf === 'connected') setNotice({ type: 'ok', text: 'Salesforce connected successfully.' });
    if (sf === 'error') setNotice({ type: 'error', text: 'Salesforce connection failed. Please try again.' });
    if (sf) setSearchParams({}, { replace: true });
  }, [searchParams]);

  if (loading) return <EmptyState title="Loading settings..." />;

  const openai = integrations.find((item) => item.provider === 'OPENAI');

  return (
    <div className="page">
      <header className="page-header"><h1>Settings</h1><p>Workspace integrations, team, and activity.</p></header>
      {notice && <p className={notice.type === 'ok' ? 'form-ok' : 'form-error'}>{notice.text}</p>}

      <UsagePanel canEdit={isAdmin} setNotice={setNotice} />
      <OpenAiPanel integration={openai} canEdit={isAdmin} onChange={refresh} setNotice={setNotice} />
      <SalesforcePanel status={salesforce} canEdit={isAdmin} onChange={refresh} setNotice={setNotice} />
      {isAdmin && <KnowledgePanel setNotice={setNotice} />}
      {isAdmin && <WidgetPanel setNotice={setNotice} />}
      {isAdmin && <AutomationPanel setNotice={setNotice} />}
      {isAdmin && <BulkImportPanel setNotice={setNotice} />}
      {isAdmin && <UsersPanel currentUser={user} />}
      {isAdmin && <AuditPanel />}
    </div>
  );
}

function OpenAiPanel({ integration, canEdit, onChange, setNotice }) {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4.1-mini');
  const [saving, setSaving] = useState(false);
  const connected = integration?.status === 'CONNECTED';

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await saveOpenAiKey({ apiKey: apiKey.trim(), model: model.trim() });
      setApiKey('');
      setNotice({ type: 'ok', text: 'OpenAI credentials saved.' });
      await onChange();
    } catch (err) {
      setNotice({ type: 'error', text: err.response?.data?.message || 'Could not save OpenAI key.' });
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    await disconnectIntegration('OPENAI');
    setNotice({ type: 'ok', text: 'OpenAI disconnected.' });
    await onChange();
  };

  return (
    <section className="panel">
      <div className="toolbar">
        <h2>OpenAI</h2>
        <Badge value={connected ? 'CONNECTED' : 'DISCONNECTED'} />
      </div>
      <p className="muted small">Used for ticket classification and customer summaries. Stored encrypted.</p>
      {canEdit ? (
        <form className="form" onSubmit={save}>
          <label>
            <span>API key</span>
            <input type="password" placeholder={connected ? 'Enter a new key to replace' : 'sk-...'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} required />
          </label>
          <label>
            <span>Model</span>
            <input value={model} onChange={(e) => setModel(e.target.value)} />
          </label>
          <div className="toolbar">
            <button className="btn primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save key'}</button>
            {connected && <button className="btn" type="button" onClick={disconnect}>Disconnect</button>}
          </div>
        </form>
      ) : <p className="muted small">Only owners and admins can manage credentials.</p>}
    </section>
  );
}

function SalesforcePanel({ status, canEdit, onChange, setNotice }) {
  const [webhook, setWebhook] = useState(null);
  const [secret, setSecret] = useState(null);

  useEffect(() => { if (canEdit) getSalesforceWebhook().then(setWebhook).catch(() => {}); }, [canEdit]);

  const rotate = async () => {
    try {
      const result = await rotateSalesforceWebhook();
      setWebhook({ url: result.url, configured: result.configured });
      setSecret(result.secret);
      setNotice({ type: 'ok', text: 'Webhook secret generated. Copy it now — it is shown only once.' });
    } catch {
      setNotice({ type: 'error', text: 'Could not generate webhook secret.' });
    }
  };

  const connect = async () => {
    try {
      const { url } = await getSalesforceAuthorizeUrl();
      window.location.href = url;
    } catch (err) {
      setNotice({ type: 'error', text: err.response?.data?.message || 'Salesforce connected app is not configured on the server.' });
    }
  };

  const disconnect = async () => {
    await disconnectSalesforce();
    setNotice({ type: 'ok', text: 'Salesforce disconnected.' });
    await onChange();
  };

  return (
    <section className="panel">
      <div className="toolbar">
        <h2>Salesforce</h2>
        <Badge value={status?.connected ? 'CONNECTED' : 'DISCONNECTED'} />
      </div>
      <p className="muted small">Authorize your Salesforce org to sync Contacts and Cases. Mode: {status?.mode}.</p>
      {status?.instanceUrl && <p className="small">Instance: <strong>{status.instanceUrl}</strong></p>}
      {!status?.appConfigured && <p className="muted small">The Salesforce connected app is not configured on the server yet.</p>}
      {canEdit && (
        <div className="toolbar">
          <button className="btn primary" type="button" onClick={connect} disabled={!status?.appConfigured}>
            {status?.connected ? 'Reconnect' : 'Connect Salesforce'}
          </button>
          {status?.connected && <button className="btn" type="button" onClick={disconnect}>Disconnect</button>}
        </div>
      )}

      {canEdit && webhook && (
        <div style={{ marginTop: 14, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <h3 style={{ margin: '0 0 4px' }}>Inbound webhook</h3>
          <p className="muted small">Point Salesforce Flow/Apex at this URL to sync Case status changes back into AgentAssist. Send the secret in the <code>x-webhook-secret</code> header.</p>
          <p className="small" style={{ wordBreak: 'break-all' }}>URL: <strong>{webhook.url}</strong></p>
          <p className="small">Secret: <Badge value={webhook.configured ? 'ENABLED' : 'DISABLED'} /></p>
          {secret && <p className="form-ok small" style={{ wordBreak: 'break-all' }}>New secret (shown once): <strong>{secret}</strong></p>}
          <button className="btn" type="button" onClick={rotate}>{webhook.configured ? 'Regenerate secret' : 'Generate secret'}</button>
        </div>
      )}
    </section>
  );
}

function UsersPanel({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ fullName: '', email: '', password: '', role: 'AGENT' });
  const [error, setError] = useState(null);

  const load = () => getUsers().then(setUsers).catch(() => {});
  useEffect(() => { load(); }, []);

  const add = async (event) => {
    event.preventDefault();
    setError(null);
    try {
      await createUser(form);
      setForm({ fullName: '', email: '', password: '', role: 'AGENT' });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not create user.');
    }
  };

  const toggleStatus = async (member) => {
    await updateUser(member.id, { status: member.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' });
    await load();
  };

  return (
    <section className="panel">
      <h2>Team</h2>
      <div className="table-shell">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th><th></th></tr></thead>
          <tbody>
            {users.map((member) => (
              <tr key={member.id}>
                <td><strong>{member.fullName}</strong></td>
                <td className="muted">{member.email}</td>
                <td><Badge value={member.role} /></td>
                <td><Badge value={member.status === 'ACTIVE' ? 'ENABLED' : 'DISABLED'} /></td>
                <td className="muted small">{member.lastLoginAt ? dateTime(member.lastLoginAt) : '—'}</td>
                <td>
                  {member.id !== currentUser.id && member.role !== 'OWNER' && (
                    <button className="btn small" type="button" onClick={() => toggleStatus(member)}>
                      {member.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="form inline-form" onSubmit={add}>
        <input placeholder="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
        <input type="email" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <input type="password" placeholder="Temp password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="AGENT">Agent</option>
          <option value="ADMIN">Admin</option>
        </select>
        <button className="btn primary" type="submit">Add user</button>
      </form>
      {error && <p className="form-error">{error}</p>}
    </section>
  );
}

function UsagePanel({ canEdit, setNotice }) {
  const [usage, setUsage] = useState(null);
  const [limitInput, setLimitInput] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => getAiUsage().then((data) => {
    setUsage(data);
    setLimitInput(data.limit == null ? '' : String(data.limit));
  }).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const limit = limitInput.trim() === '' ? null : Number(limitInput);
      const data = await setAiMonthlyLimit(limit);
      setUsage(data);
      setNotice({ type: 'ok', text: 'AI monthly limit updated.' });
    } catch (err) {
      setNotice({ type: 'error', text: err.response?.data?.message || 'Could not update the limit.' });
    } finally {
      setSaving(false);
    }
  };

  if (!usage) return null;
  const pct = usage.limit == null ? 0 : Math.min(100, Math.round((usage.used / Math.max(usage.limit, 1)) * 100));
  const level = usage.exceeded ? 'HIGH' : pct >= 80 ? 'MEDIUM' : 'LOW';
  const meterColor = { HIGH: 'var(--red)', MEDIUM: 'var(--orange)', LOW: 'var(--green)' };

  return (
    <section className="panel">
      <div className="toolbar">
        <div>
          <h2>AI Usage</h2>
          <p className="muted small">Requests to OpenAI this period ({usage.period}). Metered across every AI feature.</p>
        </div>
        {usage.exceeded && <span className="badge tone-red">Limit reached</span>}
      </div>

      <div className="meter-row">
        <div className="meter-label">
          <span>Used</span>
          <strong>{usage.used}{usage.limit == null ? ' (no limit set)' : ` / ${usage.limit}`}</strong>
        </div>
        {usage.limit != null && (
          <div className="meter"><span style={{ width: `${pct}%`, background: meterColor[level] }} /></div>
        )}
      </div>
      {usage.exceeded && <p className="muted small">The monthly limit is reached — AI features fall back to local mode until the limit is raised or the period resets.</p>}

      {canEdit ? (
        <form className="form inline-form" onSubmit={save} style={{ marginTop: 8 }}>
          <input
            type="number"
            min="0"
            placeholder="Monthly request limit (blank = unlimited)"
            value={limitInput}
            onChange={(e) => setLimitInput(e.target.value)}
          />
          <button className="btn primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save limit'}</button>
        </form>
      ) : <p className="muted small">Only owners and admins can change the limit.</p>}
    </section>
  );
}

function KnowledgePanel({ setNotice }) {
  const [articles, setArticles] = useState([]);
  const [form, setForm] = useState({ title: '', category: '', content: '' });
  const [saving, setSaving] = useState(false);

  const load = () => getKbArticles().then(setArticles).catch(() => {});
  useEffect(() => { load(); }, []);

  const add = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await createKbArticle({
        title: form.title.trim(),
        category: form.category.trim() || undefined,
        content: form.content.trim(),
      });
      setForm({ title: '', category: '', content: '' });
      setNotice({ type: 'ok', text: 'Knowledge base article saved.' });
      await load();
    } catch (err) {
      setNotice({ type: 'error', text: err.response?.data?.message || 'Could not save article.' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (article) => {
    await deleteKbArticle(article.id);
    await load();
  };

  return (
    <section className="panel">
      <h2>Knowledge Base</h2>
      <p className="muted small">Articles power similar-ticket retrieval, AI reply drafts, and the copilot. {articles.length} article(s).</p>
      <div className="table-shell">
        <table>
          <thead><tr><th>Title</th><th>Category</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {articles.map((article) => (
              <tr key={article.id}>
                <td><strong>{article.title}</strong></td>
                <td className="muted">{article.category || '—'}</td>
                <td><Badge value={article.status === 'PUBLISHED' ? 'ENABLED' : 'DISABLED'} /></td>
                <td><button className="btn small" type="button" onClick={() => remove(article)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="form" onSubmit={add} style={{ marginTop: 12 }}>
        <div className="inline-form">
          <input placeholder="Article title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={3} />
          <input placeholder="Category (optional)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        </div>
        <textarea
          placeholder="Article content — the resolution steps, policy, or guidance"
          value={form.content}
          onChange={(e) => setForm({ ...form, content: e.target.value })}
          required
          minLength={10}
          style={{ minHeight: 120, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8 }}
        />
        <button className="btn primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Add article'}</button>
      </form>
    </section>
  );
}

function WidgetPanel({ setNotice }) {
  const [info, setInfo] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { getWidgetSettings().then(setInfo).catch(() => {}); }, []);
  if (!info) return null;

  const link = `${window.location.origin}/help/${info.publicKey}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setNotice({ type: 'ok', text: 'Widget link copied.' }); } catch { /* ignore */ }
  };
  const stats = info.stats;

  return (
    <section className="panel">
      <h2>Self-Service Widget</h2>
      <p className="muted small">Share this link (or embed it) so customers can get instant answers from your knowledge base before opening a ticket.</p>
      <div className="composer-bar">
        <input readOnly value={link} style={{ flex: 1, minWidth: 220, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8 }} onFocus={(e) => e.target.select()} />
        <a className="btn" href={link} target="_blank" rel="noreferrer">Open</a>
        <button className="btn primary" type="button" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</button>
      </div>
      <div className="grid-4" style={{ marginTop: 14 }}>
        <div className="stat-card"><div><p className="stat-label">Questions asked</p><p className="stat-value">{stats.total}</p></div></div>
        <div className="stat-card"><div><p className="stat-label">Deflected</p><p className="stat-value">{stats.deflected}</p></div></div>
        <div className="stat-card"><div><p className="stat-label">Escalated</p><p className="stat-value">{stats.escalated}</p></div></div>
        <div className="stat-card"><div><p className="stat-label">Deflection rate</p><p className="stat-value">{stats.deflectionRate != null ? `${stats.deflectionRate}%` : '—'}</p></div></div>
      </div>
    </section>
  );
}

const TRIGGERS = [['TICKET_CREATED', 'When a ticket is created'], ['CUSTOMER_MESSAGE', 'When a customer replies']];
const COND_FIELDS = ['', 'category', 'priority', 'sentiment', 'subject', 'description', 'language'];
const ACTION_TYPES = [['ADD_NOTE', 'Add internal note'], ['SET_PRIORITY', 'Set priority'], ['SET_STATUS', 'Set status'], ['ASSIGN_USER', 'Assign to user id']];

function AutomationPanel({ setNotice }) {
  const [rules, setRules] = useState([]);
  const [running, setRunning] = useState(false);
  const [form, setForm] = useState({ name: '', triggerEvent: 'TICKET_CREATED', conditionField: '', conditionOp: 'EQUALS', conditionValue: '', actionType: 'ADD_NOTE', actionValue: '' });

  const load = () => getAutomationRules().then(setRules).catch(() => {});
  useEffect(() => { load(); }, []);

  const add = async (event) => {
    event.preventDefault();
    try {
      const payload = { ...form };
      if (!payload.conditionField) { payload.conditionField = null; payload.conditionOp = null; payload.conditionValue = null; }
      await createAutomationRule(payload);
      setForm({ name: '', triggerEvent: 'TICKET_CREATED', conditionField: '', conditionOp: 'EQUALS', conditionValue: '', actionType: 'ADD_NOTE', actionValue: '' });
      setNotice({ type: 'ok', text: 'Automation rule created.' });
      await load();
    } catch (err) {
      setNotice({ type: 'error', text: err.response?.data?.message || 'Could not create rule.' });
    }
  };

  const toggle = async (rule) => { await updateAutomationRule(rule.id, { isActive: !rule.isActive }); await load(); };
  const remove = async (rule) => { await deleteAutomationRule(rule.id); await load(); };

  const runSla = async () => {
    setRunning(true);
    try {
      const result = await runSlaEscalation();
      setNotice({ type: 'ok', text: `SLA check complete — ${result.escalated.length} ticket(s) escalated.` });
    } catch {
      setNotice({ type: 'error', text: 'SLA escalation failed.' });
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="panel">
      <div className="toolbar">
        <div><h2>Automation</h2><p className="muted small">Rules run automatically on ticket events. SLA escalation bumps priority on breached tickets.</p></div>
        <button className="btn" type="button" onClick={runSla} disabled={running}>{running ? 'Running...' : 'Run SLA escalation'}</button>
      </div>

      <div className="table-shell">
        <table>
          <thead><tr><th>Rule</th><th>When</th><th>If</th><th>Then</th><th>Active</th><th></th></tr></thead>
          <tbody>
            {rules.length === 0 ? <tr><td colSpan="6" className="muted small">No rules yet.</td></tr> : rules.map((rule) => (
              <tr key={rule.id}>
                <td><strong>{rule.name}</strong></td>
                <td className="muted small">{rule.triggerEvent === 'TICKET_CREATED' ? 'Ticket created' : 'Customer replies'}</td>
                <td className="muted small">{rule.conditionField ? `${rule.conditionField} ${rule.conditionOp === 'CONTAINS' ? 'contains' : '='} ${rule.conditionValue}` : 'Always'}</td>
                <td className="muted small">{rule.actionType.replace('_', ' ').toLowerCase()} {rule.actionValue ? `→ ${rule.actionValue}` : ''}</td>
                <td><button className="btn small" type="button" onClick={() => toggle(rule)}><Badge value={rule.isActive ? 'ENABLED' : 'DISABLED'} /></button></td>
                <td><button className="btn small" type="button" onClick={() => remove(rule)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form className="form" onSubmit={add} style={{ marginTop: 12 }}>
        <div className="inline-form">
          <input placeholder="Rule name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} />
          <select value={form.triggerEvent} onChange={(e) => setForm({ ...form, triggerEvent: e.target.value })}>
            {TRIGGERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="inline-form">
          <select value={form.conditionField} onChange={(e) => setForm({ ...form, conditionField: e.target.value })}>
            <option value="">Always (no condition)</option>
            {COND_FIELDS.filter(Boolean).map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          {form.conditionField && (
            <>
              <select value={form.conditionOp} onChange={(e) => setForm({ ...form, conditionOp: e.target.value })}>
                <option value="EQUALS">equals</option>
                <option value="CONTAINS">contains</option>
              </select>
              <input placeholder="value" value={form.conditionValue} onChange={(e) => setForm({ ...form, conditionValue: e.target.value })} />
            </>
          )}
        </div>
        <div className="inline-form">
          <select value={form.actionType} onChange={(e) => setForm({ ...form, actionType: e.target.value })}>
            {ACTION_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input placeholder="action value (e.g. HIGH, RESOLVED, note text, user id)" value={form.actionValue} onChange={(e) => setForm({ ...form, actionValue: e.target.value })} required />
          <button className="btn primary" type="submit">Add rule</button>
        </div>
      </form>
    </section>
  );
}

const IMPORT_SAMPLE = {
  customers: '[\n  { "fullName": "Asha Rao", "email": "asha@acme.com", "companyName": "Acme", "segment": "PREMIUM" }\n]',
  tickets: '[\n  { "customerEmail": "asha@acme.com", "subject": "Cannot log in", "description": "App shows an error after reset." }\n]',
};

function BulkImportPanel({ setNotice }) {
  const [kind, setKind] = useState('customers');
  const [text, setText] = useState(IMPORT_SAMPLE.customers);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const switchKind = (next) => { setKind(next); setText(IMPORT_SAMPLE[next]); setResult(null); };

  const run = async () => {
    let rows;
    try {
      rows = JSON.parse(text);
      if (!Array.isArray(rows)) throw new Error('not array');
    } catch {
      setNotice({ type: 'error', text: 'Input must be a JSON array.' });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const response = kind === 'customers' ? await bulkImportCustomers(rows) : await bulkImportTickets(rows);
      setResult(response);
      setNotice({ type: 'ok', text: `Imported ${response.created} ${kind}.` });
    } catch (err) {
      setNotice({ type: 'error', text: err.response?.data?.message || 'Import failed.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2>Bulk Import</h2>
      <p className="muted small">Load customers or tickets at volume from a JSON array (up to 1000 rows). Processing is local and does not consume AI quota.</p>
      <div className="toolbar" style={{ gap: 8 }}>
        <select value={kind} onChange={(e) => switchKind(e.target.value)}>
          <option value="customers">Customers</option>
          <option value="tickets">Tickets</option>
        </select>
        <button className="btn primary" type="button" onClick={run} disabled={busy}>{busy ? 'Importing...' : 'Import'}</button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        style={{ width: '100%', minHeight: 140, marginTop: 10, fontFamily: 'monospace', fontSize: 13, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 8 }}
      />
      {result && (
        <p className="muted small">
          Received {result.received} · created {result.created}{result.skipped != null ? ` · skipped ${result.skipped}` : ''}
          {result.errors?.length > 0 && ` · ${result.errors.length} error(s): ${result.errors.slice(0, 3).map((e) => `row ${e.row} (${e.message})`).join('; ')}`}
        </p>
      )}
    </section>
  );
}

function AuditPanel() {
  const [entries, setEntries] = useState([]);
  useEffect(() => { getAuditLog().then(setEntries).catch(() => {}); }, []);

  return (
    <section className="panel">
      <h2>Recent Activity</h2>
      {entries.length === 0 ? <EmptyState title="No activity yet" /> : (
        <div className="table-shell">
          <table>
            <thead><tr><th>Action</th><th>Entity</th><th>When</th></tr></thead>
            <tbody>
              {entries.slice(0, 25).map((entry) => (
                <tr key={entry.id}>
                  <td><strong>{entry.action}</strong></td>
                  <td className="muted">{entry.entity || '—'}{entry.entityId ? ` #${entry.entityId}` : ''}</td>
                  <td className="muted small">{dateTime(entry.timestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
