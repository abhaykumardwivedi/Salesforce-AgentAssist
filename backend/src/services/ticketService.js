import { all, enums, get, now, run } from '../database/db.js';
import { badRequest, notFound } from '../utils/httpError.js';
import { classifyTicket } from './aiService.js';
import { ticketSelect } from './customerService.js';
import { createCase as createSalesforceCase } from './salesforceService.js';

export async function listTickets() {
  return all(ticketSelect('ORDER BY t.created_at DESC'));
}

export async function getTicket(id) {
  const ticket = await get(ticketSelect('WHERE t.id = ?'), [Number(id)]);
  if (!ticket) throw notFound('Ticket not found.');
  return ticket;
}

export async function createTicket(payload) {
  if (!payload.customerId) throw badRequest('Customer ID is required.');
  if (!payload.subject || !payload.subject.trim()) throw badRequest('Subject is required.');
  if (!payload.description || !payload.description.trim()) throw badRequest('Description is required.');

  const customer = await get(
    `SELECT id, full_name AS "fullName", email, phone, company_name AS "companyName", segment, salesforce_contact_id AS "salesforceContactId"
     FROM customers WHERE id = ?`,
    [Number(payload.customerId)],
  );
  if (!customer) throw notFound('Customer not found.');

  const classification = await classifyTicket(payload.description);
  const createdAt = now();
  const insert = await run(
    `INSERT INTO tickets
     (customer_id, subject, description, category, priority, sentiment, assigned_team, status, salesforce_case_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', NULL, ?, ?)`,
    [
      customer.id,
      payload.subject.trim(),
      payload.description.trim(),
      classification.category,
      classification.priority,
      classification.sentiment,
      classification.assignedTeam,
      createdAt,
      createdAt,
    ],
  );
  let ticket = await getTicket(Number(insert.lastInsertRowid));

  try {
    const caseId = await createSalesforceCase(ticket, customer);
    await run('UPDATE tickets SET salesforce_case_id = ?, updated_at = ? WHERE id = ?', [caseId, now(), ticket.id]);
    ticket = await getTicket(ticket.id);
  } catch (error) {
    // Keep the local ticket even if Salesforce is disabled or unavailable.
  }

  return ticket;
}

export async function updateTicketStatus(id, status) {
  if (!enums.ticketStatuses.includes(status)) throw badRequest('Ticket status is invalid.');
  const ticket = await getTicket(id);
  await run('UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?', [status, now(), ticket.id]);
  return getTicket(ticket.id);
}

export async function createCase(id) {
  const ticket = await getTicket(id);
  if (ticket.salesforceCaseId) {
    return { success: true, id: ticket.salesforceCaseId, message: 'Ticket already has a Salesforce Case ID.' };
  }
  const customer = await get(
    `SELECT id, full_name AS "fullName", email, phone, company_name AS "companyName", segment, salesforce_contact_id AS "salesforceContactId"
     FROM customers WHERE id = ?`,
    [ticket.customerId],
  );
  if (!customer) throw notFound('Customer not found.');
  const caseId = await createSalesforceCase(ticket, customer);
  await run('UPDATE tickets SET salesforce_case_id = ?, updated_at = ? WHERE id = ?', [caseId, now(), ticket.id]);
  return { success: true, id: caseId, message: 'Ticket synced to Salesforce Case.' };
}
