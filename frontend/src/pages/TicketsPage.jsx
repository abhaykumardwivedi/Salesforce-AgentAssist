import { RefreshCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createSalesforceCase, getTickets, updateTicketStatus } from '../api/client.js';
import { Badge } from '../components/Badge.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { dateTime } from '../utils/format.js';

const statuses = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

export function TicketsPage() {
  const [tickets, setTickets] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setTickets(await getTickets());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => filter === 'ALL' ? tickets : tickets.filter((ticket) => ticket.status === filter), [tickets, filter]);

  async function changeStatus(ticket, status) {
    await updateTicketStatus(ticket.id, status);
    await load();
  }

  async function retryCase(ticket) {
    try {
      const response = await createSalesforceCase(ticket.id);
      setMessage(response.message);
      await load();
    } catch {
      setMessage('Salesforce case creation failed.');
    }
  }

  return (
    <div className="page">
      <PageHeader title="Tickets" subtitle="Ticket classification, status, and Salesforce case sync." />
      {message && <div className="alert">{message}</div>}
      <div className="toolbar">
        <select value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="ALL">All statuses</option>
          {statuses.map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}
        </select>
        <button className="button secondary" onClick={load} type="button"><RefreshCcw size={16} />Refresh</button>
      </div>
      {loading ? <EmptyState title="Loading tickets..." /> : filtered.length === 0 ? <EmptyState title="No tickets found" /> : (
        <div className="table-shell">
          <table>
            <thead><tr><th>Ticket</th><th>Category</th><th>Priority</th><th>Sentiment</th><th>Status</th><th>Salesforce</th><th>Created</th></tr></thead>
            <tbody>
              {filtered.map((ticket) => (
                <tr key={ticket.id}>
                  <td>
                    <strong>{ticket.subject}</strong>
                    <p className="muted small">{ticket.customerName} | {ticket.assignedTeam}</p>
                  </td>
                  <td>{ticket.category}</td>
                  <td><Badge value={ticket.priority} /></td>
                  <td><Badge value={ticket.sentiment} /></td>
                  <td>
                    <select value={ticket.status} onChange={(event) => changeStatus(ticket, event.target.value)}>
                      {statuses.map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}
                    </select>
                  </td>
                  <td>{ticket.salesforceCaseId || <button className="button secondary" onClick={() => retryCase(ticket)} type="button">Create Case</button>}</td>
                  <td className="muted">{dateTime(ticket.createdAt)}</td>
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
