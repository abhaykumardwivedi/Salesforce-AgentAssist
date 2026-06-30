import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  createUser,
  disconnectIntegration,
  disconnectSalesforce,
  getAuditLog,
  getIntegrations,
  getSalesforceAuthorizeUrl,
  getSalesforceStatus,
  getUsers,
  saveOpenAiKey,
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

      <OpenAiPanel integration={openai} canEdit={isAdmin} onChange={refresh} setNotice={setNotice} />
      <SalesforcePanel status={salesforce} canEdit={isAdmin} onChange={refresh} setNotice={setNotice} />
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
