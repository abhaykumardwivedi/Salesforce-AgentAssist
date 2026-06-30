import { CloudLightning, KeyRound, PlugZap, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getSalesforceStatus } from '../api/client.js';
import { Badge } from '../components/Badge.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { StatCard } from '../components/StatCard.jsx';

export function SalesforceStatusPage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSalesforceStatus().then(setStatus).finally(() => setLoading(false));
  }, []);

  if (loading) return <EmptyState title="Loading Salesforce status..." />;
  if (!status) return <EmptyState title="Salesforce status unavailable" />;

  return (
    <div className="page">
      <PageHeader title="Salesforce Status" subtitle="CRM integration mode and connection state for this workspace." />
      <div className="grid-4">
        <StatCard label="Connection" value={status.connected ? 'Connected' : 'Not connected'} icon={PlugZap} accent={status.connected ? 'teal' : 'red'} />
        <StatCard label="Mode" value={status.mode} icon={CloudLightning} />
        <StatCard label="App Configured" value={status.appConfigured ? 'Yes' : 'No'} icon={KeyRound} accent={status.appConfigured ? 'teal' : 'orange'} />
        <StatCard label="API Version" value={status.apiVersion} icon={ShieldCheck} accent="teal" />
      </div>
      <section className="panel">
        <h2>Connection</h2>
        <div className="grid-2">
          <Info label="Status" value={<Badge value={status.connected ? 'CONNECTED' : 'DISCONNECTED'} />} />
          <Info label="Mode" value={<Badge value={status.mode} />} />
          <Info label="Instance URL" value={status.instanceUrl || 'Not connected'} />
          <Info label="API Version" value={status.apiVersion} />
        </div>
        <p className="muted small">Manage the Salesforce connection from <Link className="link" to="/settings">Settings</Link>.</p>
      </section>
    </div>
  );
}

function Info({ label, value }) {
  return <div className="panel"><p className="small muted">{label}</p><strong>{value}</strong></div>;
}

function PageHeader({ title, subtitle }) {
  return <header className="page-header"><h1>{title}</h1><p>{subtitle}</p></header>;
}
