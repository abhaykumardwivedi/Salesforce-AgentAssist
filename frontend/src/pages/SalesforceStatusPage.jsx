import { CloudLightning, KeyRound, PlugZap, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
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
      <PageHeader title="Salesforce Status" subtitle="CRM integration mode and configuration state." />
      <div className="grid-4">
        <StatCard label="Integration" value={status.enabled ? 'Enabled' : 'Disabled'} icon={PlugZap} accent={status.enabled ? 'teal' : 'red'} />
        <StatCard label="Mode" value={status.mode} icon={CloudLightning} />
        <StatCard label="Configured" value={status.configured ? 'Yes' : 'No'} icon={KeyRound} accent={status.configured ? 'teal' : 'orange'} />
        <StatCard label="API Version" value={status.apiVersion} icon={ShieldCheck} accent="teal" />
      </div>
      <section className="panel">
        <h2>Connection</h2>
        <div className="grid-2">
          <Info label="Enabled" value={<Badge value={status.enabled ? 'ENABLED' : 'DISABLED'} />} />
          <Info label="Mode" value={<Badge value={status.mode} />} />
          <Info label="Configured" value={status.configured ? 'Yes' : 'No'} />
          <Info label="API Version" value={status.apiVersion} />
        </div>
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
