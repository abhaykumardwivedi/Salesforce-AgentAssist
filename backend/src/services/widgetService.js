import crypto from 'node:crypto';
import { dbMode, get, now, run } from '../database/db.js';
import { badRequest, notFound } from '../utils/httpError.js';
import { answerQuestion } from './retrievalService.js';
import { createTicket } from './ticketService.js';
import { createCustomer, getCustomerByEmail } from './customerService.js';

// Returns the tenant's public widget key, generating one on first use.
export async function ensureWidgetKey(tenantId) {
  const row = await get('SELECT public_key AS "publicKey" FROM tenants WHERE id = ?', [tenantId]);
  if (row?.publicKey) return row.publicKey;
  const key = crypto.randomBytes(18).toString('base64url');
  await run('UPDATE tenants SET public_key = ?, updated_at = ? WHERE id = ?', [key, now(), tenantId]);
  return key;
}

export async function getWidgetInfo(tenantId) {
  const publicKey = await ensureWidgetKey(tenantId);
  return { publicKey, stats: await getDeflectionStats(tenantId) };
}

export async function getDeflectionStats(tenantId) {
  const row = await get(
    `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN deflected ${truthy()} THEN 1 ELSE 0 END) AS deflected
     FROM deflection_events WHERE tenant_id = ?`,
    [tenantId],
  );
  const total = Number(row?.total || 0);
  const deflected = Number(row?.deflected || 0);
  return {
    total,
    deflected,
    escalated: total - deflected,
    deflectionRate: total ? Math.round((deflected / total) * 100) : null,
  };
}

async function resolveTenant(publicKey) {
  const key = String(publicKey || '').trim();
  if (!key) throw notFound('Unknown help widget.');
  const tenant = await get(
    `SELECT id, name FROM tenants WHERE public_key = ? AND status = 'ACTIVE'`,
    [key],
  );
  if (!tenant) throw notFound('Unknown help widget.');
  return tenant;
}

// Public: answer a visitor's question from the knowledge base only (never past
// tickets), and record a deflection event.
export async function widgetAsk(publicKey, question) {
  const tenant = await resolveTenant(publicKey);
  const text = String(question || '').trim();
  if (!text) throw badRequest('A question is required.');

  const result = await answerQuestion(tenant.id, text, { includeTickets: false });
  await logDeflection(tenant.id, text, true, null);
  return {
    answer: result.answer,
    grounded: Boolean(result.grounded),
    articles: (result.sources || []).filter((s) => s.type === 'ARTICLE').map((s) => s.title),
  };
}

// Public: escalate to a human by creating a ticket, and mark the deflection as
// unsuccessful (a ticket was needed).
export async function widgetEscalate(publicKey, payload) {
  const tenant = await resolveTenant(publicKey);
  const name = String(payload.name || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const subject = String(payload.subject || '').trim();
  const message = String(payload.message || '').trim();
  if (!name || !email) throw badRequest('Name and email are required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('A valid email is required.');
  if (!subject || !message) throw badRequest('Subject and message are required.');

  let customer = await getCustomerByEmail(tenant.id, email);
  if (!customer) {
    customer = await createCustomer(tenant.id, { fullName: name, email });
  }
  const ticket = await createTicket(tenant.id, { customerId: customer.id, subject, description: message });
  await logDeflection(tenant.id, subject, false, ticket.id);
  return { ticketId: ticket.id, reference: `TICKET-${ticket.id}` };
}

export async function getWidgetPublicInfo(publicKey) {
  const tenant = await resolveTenant(publicKey);
  return { tenantName: tenant.name };
}

async function logDeflection(tenantId, question, deflected, ticketId) {
  await run(
    'INSERT INTO deflection_events (tenant_id, question, deflected, ticket_id, created_at) VALUES (?, ?, ?, ?, ?)',
    [tenantId, String(question).slice(0, 500), boolValue(deflected), ticketId, now()],
  );
}

// deflected column is INTEGER on SQLite, BOOLEAN on Postgres.
function boolValue(value) {
  return dbMode === 'postgres' ? Boolean(value) : value ? 1 : 0;
}
function truthy() {
  return dbMode === 'postgres' ? '= TRUE' : '= 1';
}
