import { Activity, AlertTriangle, Bot, CloudLightning, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAiStatus, getCustomers, getLogs, getSalesforceStatus, getTickets } from '../api/client.js';
import { Badge } from '../components/Badge.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { StatCard } from '../components/StatCard.jsx';
import { dateTime } from '../utils/format.js';

export function DashboardPage() {
  const [customers, setCustomers] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [logs, setLogs] = useState([]);
  const [status, setStatus] = useState(null);
  const [aiStatus, setAiStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getCustomers(), getTickets(), getLogs(), getSalesforceStatus(), getAiStatus()])
      .then(([customerData, ticketData, logData, salesforceData, aiData]) => {
        setCustomers(customerData);
        setTickets(ticketData);
        setLogs(logData);
        setStatus(salesforceData);
        setAiStatus(aiData);
      })
      .finally(() => setLoading(false));
  }, []);

  const metrics = useMemo(() => ({
    openTickets: tickets.filter((ticket) => ticket.status === 'OPEN' || ticket.status === 'IN_PROGRESS').length,
    urgentTickets: tickets.filter((ticket) => ticket.priority === 'HIGH' || ticket.priority === 'CRITICAL').length,
    failedCalls: logs.filter((log) => !log.success).length,
  }), [tickets, logs]);

  if (loading) return <EmptyState title="Loading dashboard..." />;

  return (
    <div className="page">
      <PageHeader title="Dashboard" subtitle="Live view of customers, tickets, and integration health." />
      <div className="grid-4">
        <StatCard label="Customers" value={customers.length} icon={Users} />
        <StatCard label="Open Tickets" value={metrics.openTickets} icon={Activity} accent="teal" />
        <StatCard label="High Priority" value={metrics.urgentTickets} icon={AlertTriangle} accent="orange" />
        <StatCard label="Salesforce" value={status?.enabled ? status.mode : 'Off'} icon={CloudLightning} accent={status?.enabled ? 'teal' : 'red'} />
        <StatCard label="AI Provider" value={aiStatus?.configured ? aiStatus.provider : 'Local'} icon={Bot} accent={aiStatus?.configured ? 'teal' : 'orange'} />
      </div>

      <div className="grid-2">
        <section>
          <div className="panel-title">
            <h2>Recent Tickets</h2>
            <Link className="link" to="/tickets">View all</Link>
          </div>
          {tickets.length === 0 ? <EmptyState title="No tickets found" /> : (
            <div className="table-shell">
              <table>
                <thead>
                  <tr><th>Subject</th><th>Customer</th><th>Priority</th><th>Status</th><th>Created</th></tr>
                </thead>
                <tbody>
                  {tickets.slice(0, 6).map((ticket) => (
                    <tr key={ticket.id}>
                      <td><strong>{ticket.subject}</strong></td>
                      <td>{ticket.customerName}</td>
                      <td><Badge value={ticket.priority} /></td>
                      <td><Badge value={ticket.status} /></td>
                      <td className="muted">{dateTime(ticket.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <div className="panel-title">
            <h2>Latest API Calls</h2>
            <Link className="link" to="/logs">Logs</Link>
          </div>
          <div className="stack">
            {logs.slice(0, 5).map((log) => (
              <div className="panel" key={log.id}>
                <div className="toolbar">
                  <strong>{log.provider}</strong>
                  <Badge value={log.success ? 'ENABLED' : 'DISABLED'} />
                </div>
                <p className="muted small text-truncate">{log.method} {log.endpoint}</p>
                <p className="muted small">{log.responseTimeMs} ms</p>
              </div>
            ))}
            {logs.length === 0 && <EmptyState title="No API calls logged yet" />}
          </div>
        </section>
      </div>
    </div>
  );
}

function PageHeader({ title, subtitle }) {
  return <header className="page-header"><h1>{title}</h1><p>{subtitle}</p></header>;
}
