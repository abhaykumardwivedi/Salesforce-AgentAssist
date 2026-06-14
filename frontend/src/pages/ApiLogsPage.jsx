import { RefreshCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getLogs } from '../api/client.js';
import { Badge } from '../components/Badge.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { dateTime } from '../utils/format.js';

export function ApiLogsPage() {
  const [logs, setLogs] = useState([]);
  const [provider, setProvider] = useState('ALL');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setLogs(await getLogs());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const providers = useMemo(() => ['ALL', ...new Set(logs.map((log) => log.provider))], [logs]);
  const filtered = provider === 'ALL' ? logs : logs.filter((log) => log.provider === provider);

  return (
    <div className="page">
      <PageHeader title="API Logs" subtitle="External AI and Salesforce call history." />
      <div className="toolbar">
        <select value={provider} onChange={(event) => setProvider(event.target.value)}>
          {providers.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <button className="button secondary" onClick={load} type="button"><RefreshCcw size={16} />Refresh</button>
      </div>
      {loading ? <EmptyState title="Loading logs..." /> : filtered.length === 0 ? <EmptyState title="No logs found" /> : (
        <div className="table-shell">
          <table>
            <thead><tr><th>Provider</th><th>Endpoint</th><th>Status</th><th>Time</th><th>Timestamp</th><th>Error</th></tr></thead>
            <tbody>
              {filtered.map((log) => (
                <tr key={log.id}>
                  <td><strong>{log.provider}</strong></td>
                  <td><strong>{log.method}</strong><p className="muted small text-truncate">{log.endpoint}</p></td>
                  <td><Badge value={log.success ? 'ENABLED' : 'DISABLED'} /><p className="muted small">{log.statusCode}</p></td>
                  <td>{log.responseTimeMs} ms</td>
                  <td className="muted">{dateTime(log.timestamp)}</td>
                  <td className="small">{log.errorMessage || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PageHeader({ title, subtitle }) {
  return <header className="page-header"><h1>{title}</h1><p>{subtitle}</p></header>;
}
