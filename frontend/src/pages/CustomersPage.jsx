import { Edit3, Search, Trash2, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { createCustomer, deleteCustomer, getCustomers, updateCustomer } from '../api/client.js';
import { Badge } from '../components/Badge.jsx';
import { EmptyState } from '../components/EmptyState.jsx';

const emptyForm = { fullName: '', email: '', phone: '', companyName: '', customerSegment: 'NORMAL' };
const segments = ['NORMAL', 'PREMIUM', 'HIGH_VALUE', 'AT_RISK'];

export function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setCustomers(await getCustomers());
      setError('');
    } catch {
      setError('Unable to load customers.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter((customer) =>
      [customer.fullName, customer.email, customer.companyName || ''].some((value) => value.toLowerCase().includes(term)),
    );
  }, [customers, query]);

  async function submit(event) {
    event.preventDefault();
    if (!form.fullName.trim() || !form.email.trim()) {
      setError('Full name and email are required.');
      return;
    }
    try {
      if (editingId) await updateCustomer(editingId, form);
      else await createCustomer(form);
      setForm(emptyForm);
      setEditingId(null);
      await load();
    } catch {
      setError('Unable to save customer. Check for duplicate or invalid email.');
    }
  }

  function startEdit(customer) {
    setEditingId(customer.id);
    setForm({
      fullName: customer.fullName,
      email: customer.email,
      phone: customer.phone || '',
      companyName: customer.companyName || '',
      customerSegment: customer.segment,
    });
  }

  async function remove(id) {
    try {
      await deleteCustomer(id);
      await load();
    } catch {
      setError('Customer cannot be deleted while orders or tickets exist.');
    }
  }

  return (
    <div className="page">
      <PageHeader title="Customers" subtitle="Customer records and Salesforce contact mapping." />
      {error && <div className="alert error">{error}</div>}

      <form className="form-panel form-grid" onSubmit={submit}>
        <input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} placeholder="Full name" />
        <input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="Email" />
        <input value={form.companyName} onChange={(event) => setForm({ ...form, companyName: event.target.value })} placeholder="Company" />
        <select value={form.customerSegment} onChange={(event) => setForm({ ...form, customerSegment: event.target.value })}>
          {segments.map((segment) => <option key={segment} value={segment}>{segment.replace('_', ' ')}</option>)}
        </select>
        <button className="button primary" type="submit"><UserPlus size={16} />{editingId ? 'Update' : 'Add'}</button>
      </form>

      <div className="toolbar">
        <div className="field" style={{ flex: 1 }}>
          <label htmlFor="customer-search">Search</label>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: '#687082' }} />
            <input id="customer-search" style={{ paddingLeft: 36 }} value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
        </div>
      </div>

      {loading ? <EmptyState title="Loading customers..." /> : filtered.length === 0 ? <EmptyState title="No customers found" /> : (
        <div className="table-shell">
          <table>
            <thead>
              <tr><th>Customer</th><th>Company</th><th>Segment</th><th>Salesforce</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filtered.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <Link className="link" to={`/customers/${customer.id}`}>{customer.fullName}</Link>
                    <p className="muted small">{customer.email}</p>
                  </td>
                  <td>{customer.companyName || '-'}</td>
                  <td><Badge value={customer.segment} /></td>
                  <td>{customer.salesforceContactId || '-'}</td>
                  <td>
                    <button className="icon-button secondary" title="Edit customer" onClick={() => startEdit(customer)} type="button"><Edit3 size={16} /></button>
                    <button className="icon-button danger" title="Delete customer" onClick={() => remove(customer.id)} type="button"><Trash2 size={16} /></button>
                  </td>
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
