import { all, get, now, run } from '../database/db.js';
import { classifyLocally } from './aiService.js';

const SEGMENTS = ['NORMAL', 'PREMIUM', 'HIGH_VALUE', 'AT_RISK'];
const MAX_ROWS = 1000;

// High-volume customer import. Validates and de-duplicates by email, skipping
// rows that already exist. Uses local (rules-based) processing only — no
// per-row external/AI calls — so large batches stay fast and cheap.
export async function bulkImportCustomers(tenantId, rows) {
  const list = ensureArray(rows);
  const summary = { received: list.length, created: 0, skipped: 0, errors: [] };

  const existing = new Set(
    (await all('SELECT lower(email) AS email FROM customers WHERE tenant_id = ?', [tenantId])).map((r) => r.email),
  );

  for (let i = 0; i < list.length; i += 1) {
    const row = list[i] || {};
    const fullName = String(row.fullName || '').trim();
    const email = String(row.email || '').trim().toLowerCase();
    try {
      if (!fullName) throw new Error('fullName is required.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('valid email is required.');
      const segment = SEGMENTS.includes(String(row.segment || '').toUpperCase()) ? String(row.segment).toUpperCase() : 'NORMAL';
      if (existing.has(email)) { summary.skipped += 1; continue; }

      const createdAt = now();
      await run(
        `INSERT INTO customers (tenant_id, full_name, email, phone, company_name, segment, salesforce_contact_id, salesforce_account_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
        [tenantId, fullName, email, clean(row.phone), clean(row.companyName), segment, createdAt, createdAt],
      );
      existing.add(email);
      summary.created += 1;
    } catch (error) {
      if (summary.errors.length < 20) summary.errors.push({ row: i, message: error.message });
    }
  }
  return summary;
}

// High-volume ticket import. Resolves the customer by email or id and classifies
// locally. Skips Salesforce/embedding/automation side effects for throughput.
export async function bulkImportTickets(tenantId, rows) {
  const list = ensureArray(rows);
  const summary = { received: list.length, created: 0, errors: [] };

  for (let i = 0; i < list.length; i += 1) {
    const row = list[i] || {};
    try {
      const subject = String(row.subject || '').trim();
      const description = String(row.description || '').trim();
      if (!subject) throw new Error('subject is required.');
      if (!description) throw new Error('description is required.');

      const customer = await resolveCustomer(tenantId, row);
      if (!customer) throw new Error('customer not found (provide customerId or customerEmail).');

      const c = classifyLocally(description);
      const createdAt = now();
      await run(
        `INSERT INTO tickets
         (tenant_id, customer_id, subject, description, category, priority, sentiment, assigned_team, status, language, salesforce_case_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, NULL, ?, ?)`,
        [tenantId, customer.id, subject.slice(0, 200), description.slice(0, 5000), c.category, c.priority, c.sentiment, c.assignedTeam, c.language, createdAt, createdAt],
      );
      summary.created += 1;
    } catch (error) {
      if (summary.errors.length < 20) summary.errors.push({ row: i, message: error.message });
    }
  }
  return summary;
}

async function resolveCustomer(tenantId, row) {
  if (row.customerId) {
    return get('SELECT id FROM customers WHERE tenant_id = ? AND id = ?', [tenantId, Number(row.customerId)]);
  }
  if (row.customerEmail) {
    return get('SELECT id FROM customers WHERE tenant_id = ? AND lower(email) = ?', [tenantId, String(row.customerEmail).trim().toLowerCase()]);
  }
  return null;
}

function ensureArray(rows) {
  if (!Array.isArray(rows)) return [];
  if (rows.length > MAX_ROWS) return rows.slice(0, MAX_ROWS);
  return rows;
}

function clean(value) {
  return value && String(value).trim() ? String(value).trim() : null;
}
