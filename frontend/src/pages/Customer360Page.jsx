import { CloudLightning, CreditCard, PackageCheck, TicketCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getCustomer360, syncContact } from '../api/client.js';
import { Badge } from '../components/Badge.jsx';
import { EmptyState } from '../components/EmptyState.jsx';
import { StatCard } from '../components/StatCard.jsx';
import { currency, dateOnly, dateTime } from '../utils/format.js';

export function Customer360Page() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  async function load() {
    setLoading(true);
    try {
      setData(await getCustomer360(id));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function sync() {
    try {
      const response = await syncContact(data.customer.id);
      setMessage(response.message);
      await load();
    } catch {
      setMessage('Salesforce sync failed.');
    }
  }

  if (loading) return <EmptyState title="Loading Customer 360..." />;
  if (!data) return <EmptyState title="Customer not found" />;

  return (
    <div className="page">
      <div className="toolbar">
        <header className="page-header">
          <p><Link className="link" to="/customers">Customers</Link> / Customer 360</p>
          <h1>{data.customer.fullName}</h1>
          <p>{data.customer.email}</p>
        </header>
        <button className="button primary" onClick={sync} type="button"><CloudLightning size={16} />Sync Contact</button>
      </div>

      {message && <div className="alert">{message}</div>}

      <div className="grid-4">
        <StatCard label="Total Spend" value={currency(data.totalSpend)} icon={CreditCard} />
        <StatCard label="Orders" value={data.totalOrders} icon={PackageCheck} accent="teal" />
        <StatCard label="Open Tickets" value={data.openTickets} icon={TicketCheck} accent="orange" />
        <StatCard label="Salesforce ID" value={data.salesforceContactId || '-'} icon={CloudLightning} accent={data.salesforceContactId ? 'teal' : 'red'} />
      </div>

      <section className="panel">
        <div className="toolbar">
          <div>
            <h2>{data.customer.companyName || 'Customer Profile'}</h2>
            <p className="muted">{data.customer.phone || 'No phone'} | {data.customer.email}</p>
          </div>
          <Badge value={data.customer.segment} />
        </div>
        <p>{data.aiCustomerSummary}</p>
      </section>

      <section>
        <div className="panel-title"><h2>Orders</h2></div>
        <div className="table-shell">
          <table>
            <thead><tr><th>Order</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              {data.orders.map((order) => (
                <tr key={order.id}><td><strong>{order.orderNumber}</strong></td><td>{currency(order.amount)}</td><td>{order.status}</td><td>{dateOnly(order.orderDate)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="panel-title"><h2>Tickets</h2></div>
        <div className="table-shell">
          <table>
            <thead><tr><th>Subject</th><th>Priority</th><th>Sentiment</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>
              {data.tickets.map((ticket) => (
                <tr key={ticket.id}>
                  <td><strong>{ticket.subject}</strong><p className="muted small">{ticket.assignedTeam}</p></td>
                  <td><Badge value={ticket.priority} /></td>
                  <td><Badge value={ticket.sentiment} /></td>
                  <td><Badge value={ticket.status} /></td>
                  <td className="muted">{dateTime(ticket.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
