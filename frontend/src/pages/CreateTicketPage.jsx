import { Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createTicket, getCustomers } from '../api/client.js';
import { Badge } from '../components/Badge.jsx';
import { EmptyState } from '../components/EmptyState.jsx';

export function CreateTicketPage() {
  const [customers, setCustomers] = useState([]);
  const [customerId, setCustomerId] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [created, setCreated] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getCustomers().then((data) => {
      setCustomers(data);
      if (data[0]) setCustomerId(String(data[0].id));
    }).catch(() => setError('Unable to load customers.'));
  }, []);

  async function submit(event) {
    event.preventDefault();
    if (!customerId || !subject.trim() || !description.trim()) {
      setError('Customer, subject, and description are required.');
      return;
    }
    try {
      const ticket = await createTicket({ customerId: Number(customerId), subject, description });
      setCreated(ticket);
      setSubject('');
      setDescription('');
      setError('');
    } catch {
      setError('Unable to create ticket.');
    }
  }

  return (
    <div className="page">
      <PageHeader title="Create Ticket" subtitle="Ticket intake with AI classification and Salesforce case creation." />
      {error && <div className="alert error">{error}</div>}
      <div className="grid-2">
        <form className="form-panel stack" onSubmit={submit}>
          <div className="field">
            <label>Customer</label>
            <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.fullName}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Subject</label>
            <input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={200} />
          </div>
          <div className="field">
            <label>Description</label>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>
          <button className="button primary" type="submit"><Send size={16} />Create</button>
        </form>
        <section className="panel">
          <h2>Latest Classification</h2>
          {!created ? <EmptyState title="No ticket created yet" /> : (
            <div className="stack">
              <strong>{created.subject}</strong>
              <p className="muted">{created.description}</p>
              <div className="grid-2">
                <Info label="Category" value={created.category} />
                <Info label="Assigned Team" value={created.assignedTeam} />
                <div><p className="small muted">Priority</p><Badge value={created.priority} /></div>
                <div><p className="small muted">Sentiment</p><Badge value={created.sentiment} /></div>
              </div>
              <Info label="Salesforce Case" value={created.salesforceCaseId || '-'} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return <div><p className="small muted">{label}</p><strong>{value}</strong></div>;
}

function PageHeader({ title, subtitle }) {
  return <header className="page-header"><h1>{title}</h1><p>{subtitle}</p></header>;
}
