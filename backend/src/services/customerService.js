import { all, enums, get, now, run } from '../database/db.js';
import { badRequest, conflict, notFound } from '../utils/httpError.js';
import { getOrCreateCustomerSummary } from './aiService.js';
import { getCustomerRisk } from './analyticsService.js';
import { syncAccount as syncSalesforceAccount, syncContact as syncSalesforceContact } from './salesforceService.js';

export async function listCustomers(tenantId) {
  return all(customerSelect('WHERE tenant_id = ? ORDER BY lower(full_name) ASC'), [tenantId]);
}

export async function getCustomer(tenantId, id) {
  const customer = await get(customerSelect('WHERE tenant_id = ? AND id = ?'), [tenantId, Number(id)]);
  if (!customer) throw notFound('Customer not found.');
  return customer;
}

export function getCustomerByEmail(tenantId, email) {
  return get(customerSelect('WHERE tenant_id = ? AND lower(email) = ?'), [tenantId, normalizeEmail(email)]);
}

export async function createCustomer(tenantId, payload) {
  validateCustomerPayload(payload);
  const email = normalizeEmail(payload.email);
  if (await get('SELECT id FROM customers WHERE tenant_id = ? AND lower(email) = ?', [tenantId, email])) {
    throw conflict('A customer with this email already exists.');
  }
  const createdAt = now();
  const result = await run(
    `INSERT INTO customers
     (tenant_id, full_name, email, phone, company_name, segment, salesforce_contact_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    [
      tenantId,
      payload.fullName.trim(),
      email,
      clean(payload.phone),
      clean(payload.companyName),
      payload.customerSegment || payload.segment || 'NORMAL',
      createdAt,
      createdAt,
    ],
  );
  return getCustomer(tenantId, Number(result.lastInsertRowid));
}

export async function updateCustomer(tenantId, id, payload) {
  validateCustomerPayload(payload);
  const customer = await getCustomer(tenantId, id);
  const email = normalizeEmail(payload.email);
  if (await get('SELECT id FROM customers WHERE tenant_id = ? AND lower(email) = ? AND id != ?', [tenantId, email, customer.id])) {
    throw conflict('A customer with this email already exists.');
  }
  await run(
    `UPDATE customers
     SET full_name = ?, email = ?, phone = ?, company_name = ?, segment = ?, updated_at = ?
     WHERE tenant_id = ? AND id = ?`,
    [
      payload.fullName.trim(),
      email,
      clean(payload.phone),
      clean(payload.companyName),
      payload.customerSegment || payload.segment || 'NORMAL',
      now(),
      tenantId,
      customer.id,
    ],
  );
  return getCustomer(tenantId, customer.id);
}

export async function deleteCustomer(tenantId, id) {
  const customer = await getCustomer(tenantId, id);
  const hasOrders = await get('SELECT id FROM orders WHERE tenant_id = ? AND customer_id = ? LIMIT 1', [tenantId, customer.id]);
  const hasTickets = await get('SELECT id FROM tickets WHERE tenant_id = ? AND customer_id = ? LIMIT 1', [tenantId, customer.id]);
  if (hasOrders || hasTickets) {
    throw conflict('Customer cannot be deleted because orders or tickets exist.');
  }
  await run('DELETE FROM customers WHERE tenant_id = ? AND id = ?', [tenantId, customer.id]);
}

export async function getCustomer360(tenantId, id) {
  const customer = await getCustomer(tenantId, id);
  const orders = await all(
    `SELECT id, customer_id AS "customerId", order_number AS "orderNumber", amount, status, order_date AS "orderDate"
     FROM orders
     WHERE tenant_id = ? AND customer_id = ?
     ORDER BY order_date DESC`,
    [tenantId, customer.id],
  );
  const tickets = await all(ticketSelect('WHERE t.tenant_id = ? AND t.customer_id = ? ORDER BY t.created_at DESC'), [tenantId, customer.id]);
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
    risk: await getCustomerRisk(tenantId, customer.id),
    salesforceContactId: customer.salesforceContactId,
  };
}

export async function syncContact(tenantId, id) {
  const customer = await getCustomer(tenantId, id);
  if (customer.salesforceContactId) {
    return { success: true, id: customer.salesforceContactId, message: 'Customer already has a Salesforce Contact ID.' };
  }
  const salesforceContactId = await syncSalesforceContact(tenantId, customer);
  await run('UPDATE customers SET salesforce_contact_id = ?, updated_at = ? WHERE tenant_id = ? AND id = ?', [salesforceContactId, now(), tenantId, customer.id]);
  return { success: true, id: salesforceContactId, message: 'Customer synced to Salesforce.' };
}

export async function syncAccount(tenantId, id) {
  const customer = await getCustomer(tenantId, id);
  if (customer.salesforceAccountId) {
    return { success: true, id: customer.salesforceAccountId, message: 'Customer already has a Salesforce Account ID.' };
  }
  const salesforceAccountId = await syncSalesforceAccount(tenantId, customer);
  await run('UPDATE customers SET salesforce_account_id = ?, updated_at = ? WHERE tenant_id = ? AND id = ?', [salesforceAccountId, now(), tenantId, customer.id]);
  return { success: true, id: salesforceAccountId, message: 'Customer synced to a Salesforce Account.' };
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
      tenant_id AS "tenantId",
      full_name AS "fullName",
      email,
      phone,
      company_name AS "companyName",
      segment,
      salesforce_contact_id AS "salesforceContactId",
      salesforce_account_id AS "salesforceAccountId",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM customers ${extra}`;
}

export function ticketSelect(extra = '') {
  return `SELECT
      t.id,
      t.tenant_id AS "tenantId",
      t.customer_id AS "customerId",
      c.full_name AS "customerName",
      t.subject,
      t.description,
      t.category,
      t.priority,
      t.sentiment,
      t.assigned_team AS "assignedTeam",
      t.assigned_user_id AS "assignedUserId",
      au.full_name AS "assignedUserName",
      t.status,
      t.language,
      t.salesforce_case_id AS "salesforceCaseId",
      t.created_at AS "createdAt",
      t.updated_at AS "updatedAt"
    FROM tickets t
    JOIN customers c ON c.id = t.customer_id
    LEFT JOIN users au ON au.id = t.assigned_user_id ${extra}`;
}
