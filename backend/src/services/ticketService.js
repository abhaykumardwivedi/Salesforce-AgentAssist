import { all, enums, get, now, run } from '../database/db.js';
import { badRequest, notFound } from '../utils/httpError.js';
import { classifyTicket } from './aiService.js';
import { ticketSelect } from './customerService.js';
import { indexTicket } from './retrievalService.js';
import { runRules } from './automationService.js';
import { createCase as createSalesforceCase } from './salesforceService.js';

export async function listTickets(tenantId) {
  return all(ticketSelect('WHERE t.tenant_id = ? ORDER BY t.created_at DESC'), [tenantId]);
}

export async function getTicket(tenantId, id) {
  const ticket = await get(ticketSelect('WHERE t.tenant_id = ? AND t.id = ?'), [tenantId, Number(id)]);
  if (!ticket) throw notFound('Ticket not found.');
  return ticket;
}

export async function createTicket(tenantId, payload) {
  if (!payload.customerId) throw badRequest('Customer ID is required.');
  if (!payload.subject || !payload.subject.trim()) throw badRequest('Subject is required.');
  if (!payload.description || !payload.description.trim()) throw badRequest('Description is required.');

  const customer = await get(
    `SELECT id, tenant_id AS "tenantId", full_name AS "fullName", email, phone, company_name AS "companyName", segment, salesforce_contact_id AS "salesforceContactId"
     FROM customers WHERE tenant_id = ? AND id = ?`,
    [tenantId, Number(payload.customerId)],
  );
  if (!customer) throw notFound('Customer not found.');

  const classification = await classifyTicket(tenantId, payload.description);
  const createdAt = now();
  const insert = await run(
    `INSERT INTO tickets
     (tenant_id, customer_id, subject, description, category, priority, sentiment, assigned_team, status, language, salesforce_case_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, NULL, ?, ?)`,
    [
      tenantId,
      customer.id,
      payload.subject.trim(),
      payload.description.trim(),
      classification.category,
      classification.priority,
      classification.sentiment,
      classification.assignedTeam,
      classification.language || 'English',
      createdAt,
      createdAt,
    ],
  );
  let ticket = await getTicket(tenantId, Number(insert.lastInsertRowid));

  try {
    const caseId = await createSalesforceCase(tenantId, ticket, customer);
    await run('UPDATE tickets SET salesforce_case_id = ?, updated_at = ? WHERE tenant_id = ? AND id = ?', [caseId, now(), tenantId, ticket.id]);
    ticket = await getTicket(tenantId, ticket.id);
  } catch (error) {
    // Keep the local ticket even if Salesforce is disabled or unavailable.
  }

  // Index for semantic "similar ticket" retrieval. Best-effort: never block or
  // fail ticket creation on embedding issues.
  await indexTicket(tenantId, ticket).catch(() => {});

  // Run automation rules; if any fired they may have changed the ticket, so
  // re-fetch to return the current state.
  const fired = await runRules(tenantId, 'TICKET_CREATED', ticket);
  if (fired.length) ticket = await getTicket(tenantId, ticket.id);

  return ticket;
}

export async function updateTicketStatus(tenantId, id, status) {
  if (!enums.ticketStatuses.includes(status)) throw badRequest('Ticket status is invalid.');
  const ticket = await getTicket(tenantId, id);
  await run('UPDATE tickets SET status = ?, updated_at = ? WHERE tenant_id = ? AND id = ?', [status, now(), tenantId, ticket.id]);
  return getTicket(tenantId, ticket.id);
}

export async function createCase(tenantId, id) {
  const ticket = await getTicket(tenantId, id);
  if (ticket.salesforceCaseId) {
    return { success: true, id: ticket.salesforceCaseId, message: 'Ticket already has a Salesforce Case ID.' };
  }
  const customer = await get(
    `SELECT id, tenant_id AS "tenantId", full_name AS "fullName", email, phone, company_name AS "companyName", segment, salesforce_contact_id AS "salesforceContactId"
     FROM customers WHERE tenant_id = ? AND id = ?`,
    [tenantId, ticket.customerId],
  );
  if (!customer) throw notFound('Customer not found.');
  const caseId = await createSalesforceCase(tenantId, ticket, customer);
  await run('UPDATE tickets SET salesforce_case_id = ?, updated_at = ? WHERE tenant_id = ? AND id = ?', [caseId, now(), tenantId, ticket.id]);
  return { success: true, id: caseId, message: 'Ticket synced to Salesforce Case.' };
}
