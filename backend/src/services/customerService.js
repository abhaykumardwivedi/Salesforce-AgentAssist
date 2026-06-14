import { all, enums, get, now, run } from '../database/db.js';
import { badRequest, conflict, notFound } from '../utils/httpError.js';
import { getOrCreateCustomerSummary } from './aiService.js';
import { syncContact as syncSalesforceContact } from './salesforceService.js';

export async function listCustomers() {
  return all(customerSelect('ORDER BY lower(full_name) ASC'));
}

export async function getCustomer(id) {
  const customer = await get(customerSelect('WHERE id = ?'), [Number(id)]);
  if (!customer) throw notFound('Customer not found.');
  return customer;
}

export async function createCustomer(payload) {
  validateCustomerPayload(payload);
  const email = normalizeEmail(payload.email);
  if (await get('SELECT id FROM customers WHERE lower(email) = ?', [email])) {
    throw conflict('A customer with this email already exists.');
  }
  const createdAt = now();
  const result = await run(
    `INSERT INTO customers
     (full_name, email, phone, company_name, segment, salesforce_contact_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
    [
      payload.fullName.trim(),
      email,
      clean(payload.phone),
      clean(payload.companyName),
      payload.customerSegment || payload.segment || 'NORMAL',
      createdAt,
      createdAt,
    ],
  );
  return getCustomer(Number(result.lastInsertRowid));
}

export async function updateCustomer(id, payload) {
  validateCustomerPayload(payload);
  const customer = await getCustomer(id);
  const email = normalizeEmail(payload.email);
  if (await get('SELECT id FROM customers WHERE lower(email) = ? AND id != ?', [email, customer.id])) {
    throw conflict('A customer with this email already exists.');
  }
  await run(
    `UPDATE customers
     SET full_name = ?, email = ?, phone = ?, company_name = ?, segment = ?, updated_at = ?
     WHERE id = ?`,
    [
      payload.fullName.trim(),
      email,
      clean(payload.phone),
      clean(payload.companyName),
      payload.customerSegment || payload.segment || 'NORMAL',
      now(),
      customer.id,
    ],
  );
  return getCustomer(customer.id);
}

export async function deleteCustomer(id) {
  const customer = await getCustomer(id);
  const hasOrders = await get('SELECT id FROM orders WHERE customer_id = ? LIMIT 1', [customer.id]);
  const hasTickets = await get('SELECT id FROM tickets WHERE customer_id = ? LIMIT 1', [customer.id]);
  if (hasOrders || hasTickets) {
    throw conflict('Customer cannot be deleted because orders or tickets exist.');
  }
  await run('DELETE FROM customers WHERE id = ?', [customer.id]);
}

export async function getCustomer360(id) {
  const customer = await getCustomer(id);
  const orders = await all(
    `SELECT id, customer_id AS "customerId", order_number AS "orderNumber", amount, status, order_date AS "orderDate"
     FROM orders
     WHERE customer_id = ?
     ORDER BY order_date DESC`,
    [customer.id],
  );
  const tickets = await all(ticketSelect('WHERE t.customer_id = ? ORDER BY t.created_at DESC'), [customer.id]);
  const totalSpend = orders.reduce((sum, order) => sum + Number(order.amount), 0);
  const openTickets = tickets.filter((ticket) => ['OPEN', 'IN_PROGRESS'].includes(ticket.status)).length;
  return {
    customer,
    orders,
    tickets,
    totalSpend,
    totalOrders: orders.length,
    openTickets,
    latestTicket: tickets[0] || null,
    aiCustomerSummary: await getOrCreateCustomerSummary(customer),
    salesforceContactId: customer.salesforceContactId,
  };
}

export async function syncContact(id) {
  const customer = await getCustomer(id);
  if (customer.salesforceContactId) {
    return { success: true, id: customer.salesforceContactId, message: 'Customer already has a Salesforce Contact ID.' };
  }
  const salesforceContactId = await syncSalesforceContact(customer);
  await run('UPDATE customers SET salesforce_contact_id = ?, updated_at = ? WHERE id = ?', [salesforceContactId, now(), customer.id]);
  return { success: true, id: salesforceContactId, message: 'Customer synced to Salesforce.' };
}

function validateCustomerPayload(payload) {
  if (!payload.fullName || !payload.fullName.trim()) throw badRequest('Full name is required.');
  if (!payload.email || !payload.email.trim()) throw badRequest('Email is required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) throw badRequest('Email format is invalid.');
  const segment = payload.customerSegment || payload.segment || 'NORMAL';
  if (!enums.customerSegments.includes(segment)) throw badRequest('Customer segment is invalid.');
}

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function clean(value) {
  return value && String(value).trim() ? String(value).trim() : null;
}

export function customerSelect(extra = '') {
  return `SELECT
      id,
      full_name AS "fullName",
      email,
      phone,
      company_name AS "companyName",
      segment,
      salesforce_contact_id AS "salesforceContactId",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM customers ${extra}`;
}

export function ticketSelect(extra = '') {
  return `SELECT
      t.id,
      t.customer_id AS "customerId",
      c.full_name AS "customerName",
      t.subject,
      t.description,
      t.category,
      t.priority,
      t.sentiment,
      t.assigned_team AS "assignedTeam",
      t.status,
      t.salesforce_case_id AS "salesforceCaseId",
      t.created_at AS "createdAt",
      t.updated_at AS "updatedAt"
    FROM tickets t
    JOIN customers c ON c.id = t.customer_id ${extra}`;
}
