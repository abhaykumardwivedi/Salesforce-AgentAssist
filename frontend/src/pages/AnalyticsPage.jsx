import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Clock, Globe2, MessageSquareWarning, Ticket } from 'lucide-react';
import { getAnalyticsOverview, getBenchmark } from '../api/client.js';
import { Badge } from '../components/Badge.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { StatCard } from '../components/StatCard.jsx';

const riskTone = { HIGH: 'tone-red', MEDIUM: 'tone-amber', LOW: 'tone-green' };

const BENCHMARK_METRICS = [
  { key: 'avgResolutionHours', label: 'Avg resolution (hours)', suffix: 'h', lowerBetter: true },
  { key: 'negativeRate', label: 'Negative sentiment', suffix: '%', lowerBetter: true },
  { key: 'ticketsPerWeek', label: 'Tickets / week', suffix: '', lowerBetter: false },
  { key: 'deflectionRate', label: 'Deflection rate', suffix: '%', lowerBetter: false },
];

export function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [benchmark, setBenchmark] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBenchmark().then(setBenchmark).catch(() => {});
    getAnalyticsOverview().then(setData).finally(() => setLoading(false));
  }, []);

  if (loading) return <EmptyState title="Loading analytics..." />;
  if (!data) return <EmptyState title="No analytics available" />;

  const maxTrend = Math.max(1, ...data.weeklyTrend.map((w) => w.count));

  return (
    <div className="page">
      <header className="page-header">
        <h1>Analytics</h1>
        <p>Ticket trends, sentiment, and AI-predicted customer risk.</p>
      </header>

      <div className="grid-4">
        <StatCard label="Total Tickets" value={data.totals.total} icon={Ticket} />
        <StatCard label="Open" value={data.totals.open} icon={Clock} accent="orange" />
        <StatCard label="Negative Sentiment" value={data.totals.negative} icon={MessageSquareWarning} accent="red" />
        <StatCard label="Avg Resolution" value={data.avgResolutionHours != null ? `${data.avgResolutionHours}h` : '—'} icon={Clock} accent="teal" />
      </div>

      <div className="two-col">
        <section className="panel">
          <h2>Ticket volume (last 8 weeks)</h2>
          <div className="spark">
            {data.weeklyTrend.map((week) => (
              <div key={week.weeksAgo} className="spark-col">
                <div className="spark-bar" style={{ height: `${(week.count / maxTrend) * 100}%` }} title={`${week.count} tickets`} />
                <span className="spark-label">{week.weeksAgo === 0 ? 'now' : `-${week.weeksAgo}w`}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="toolbar"><h2>At-risk customers</h2><AlertTriangle size={16} /></div>
          <p className="muted small">Predicted from open tickets, sentiment, and order failures.</p>
          {data.topRiskCustomers.length === 0 ? <p className="muted small">No elevated risk detected.</p> : data.topRiskCustomers.map((customer) => (
            <div key={customer.id} className="similar-item">
              <div className="similar-head">
                <Link className="link" to={`/customers/${customer.id}`}><strong>{customer.fullName}</strong></Link>
                <span className={`badge ${riskTone[customer.level]}`}>{customer.level} risk</span>
              </div>
              <p className="muted small" style={{ margin: '4px 0 0' }}>{customer.signals.slice(0, 2).join(' · ')}</p>
            </div>
          ))}
        </section>
      </div>

      <div className="two-col">
        <BreakdownPanel title="By category" counts={data.byCategory} />
        <BreakdownPanel title="By priority" counts={data.byPriority} />
      </div>
      <div className="two-col">
        <BreakdownPanel title="By status" counts={data.byStatus} />
        <BreakdownPanel title="By sentiment" counts={data.bySentiment} />
      </div>

      {benchmark && <BenchmarkPanel benchmark={benchmark} />}
    </div>
  );
}

function BenchmarkPanel({ benchmark }) {
  return (
    <section className="panel">
      <div className="toolbar"><h2>Anonymized benchmark</h2><Globe2 size={16} /></div>
      <p className="muted small">Your metrics vs. the anonymized median across all AgentAssist workspaces. No workspace is identifiable.</p>
      {!benchmark.available ? (
        <p className="muted small">Benchmarking unlocks once at least {benchmark.minTenants} workspaces contribute data (currently {benchmark.contributing}).</p>
      ) : (
        <div className="table-shell">
          <table>
            <thead><tr><th>Metric</th><th>You</th><th>Network median</th><th></th></tr></thead>
            <tbody>
              {BENCHMARK_METRICS.map((metric) => {
                const mine = benchmark.mine?.[metric.key];
                const net = benchmark.network?.[metric.key];
                const better = mine != null && net != null && (metric.lowerBetter ? mine <= net : mine >= net);
                return (
                  <tr key={metric.key}>
                    <td>{metric.label}</td>
                    <td><strong>{mine != null ? `${mine}${metric.suffix}` : '—'}</strong></td>
                    <td className="muted">{net != null ? `${net}${metric.suffix}` : '—'}</td>
                    <td>{mine != null && net != null && <Badge value={better ? 'RESOLVED' : 'AT_RISK'} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted small" style={{ marginTop: 8 }}>Based on {benchmark.contributing} contributing workspaces.</p>
        </div>
      )}
    </section>
  );
}

function BreakdownPanel({ title, counts }) {
  const entries = Object.entries(counts);
  const max = Math.max(1, ...entries.map(([, value]) => value));
  return (
    <section className="panel">
      <h2>{title}</h2>
      <div className="bars">
        {entries.map(([key, value]) => (
          <div key={key} className="bar-row">
            <Badge value={key} />
            <div className="bar-track"><div className="bar-fill" style={{ width: `${(value / max) * 100}%` }} /></div>
            <span className="bar-value">{value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
