import { all, dbMode, get, now, run } from '../database/db.js';
import { badRequest, notFound } from '../utils/httpError.js';

const AUTHOR_TYPES = ['CUSTOMER', 'AGENT', 'SYSTEM'];

function messageSelect(where) {
  return `SELECT
      m.id,
      m.ticket_id AS "ticketId",
      m.author_type AS "authorType",
      m.author_user_id AS "authorUserId",
      u.full_name AS "authorName",
      m.body,
      m.is_internal AS "isInternal",
      m.created_at AS "createdAt"
    FROM ticket_messages m
    LEFT JOIN users u ON u.id = m.author_user_id
    ${where}`;
}

export async function listMessages(tenantId, ticketId) {
  await assertTicket(tenantId, ticketId);
  const rows = await all(
    messageSelect('WHERE m.tenant_id = ? AND m.ticket_id = ? ORDER BY m.created_at ASC, m.id ASC'),
    [tenantId, Number(ticketId)],
  );
  return rows.map(normalize);
}

// Append a message to a ticket thread. Agents post public replies or internal
// notes; SYSTEM is used for automated entries. A first public agent reply also
// advances an OPEN ticket to IN_PROGRESS.
export async function addMessage(tenantId, ticketId, { authorType = 'AGENT', authorUserId = null, body, isInternal = false } = {}) {
  const ticket = await assertTicket(tenantId, ticketId);
  const text = String(body || '').trim();
  if (!text) throw badRequest('Message body is required.');
  if (!AUTHOR_TYPES.includes(authorType)) throw badRequest('Invalid message author type.');

  const internal = Boolean(isInternal);
  const timestamp = now();
  const result = await run(
    `INSERT INTO ticket_messages (tenant_id, ticket_id, author_type, author_user_id, body, is_internal, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [tenantId, ticket.id, authorType, authorUserId, text, dbMode === 'postgres' ? internal : internal ? 1 : 0, timestamp],
  );

  if (authorType === 'AGENT' && !internal && ticket.status === 'OPEN') {
    await run("UPDATE tickets SET status = 'IN_PROGRESS', updated_at = ? WHERE tenant_id = ? AND id = ?", [timestamp, tenantId, ticket.id]);
  } else {
    await run('UPDATE tickets SET updated_at = ? WHERE tenant_id = ? AND id = ?', [timestamp, tenantId, ticket.id]);
  }

  return getMessage(tenantId, Number(result.lastInsertRowid));
}

export async function assignTicket(tenantId, ticketId, userId) {
  const ticket = await assertTicket(tenantId, ticketId);
  let assignee = null;
  if (userId !== null && userId !== undefined && userId !== '') {
    assignee = await get(
      `SELECT id, full_name AS "fullName" FROM users WHERE tenant_id = ? AND id = ? AND status = 'ACTIVE'`,
      [tenantId, Number(userId)],
    );
    if (!assignee) throw notFound('Assignee not found in this workspace.');
  }
  await run(
    'UPDATE tickets SET assigned_user_id = ?, updated_at = ? WHERE tenant_id = ? AND id = ?',
    [assignee ? assignee.id : null, now(), tenantId, ticket.id],
  );
  return { assignedUserId: assignee ? assignee.id : null, assignedUserName: assignee ? assignee.fullName : null };
}

// Active users who can own a ticket. Available to any agent (unlike the
// admin-only user management endpoint) so assignment works for everyone.
export function listAssignees(tenantId) {
  return all(
    `SELECT id, full_name AS "fullName", role FROM users WHERE tenant_id = ? AND status = 'ACTIVE' ORDER BY lower(full_name) ASC`,
    [tenantId],
  );
}

async function getMessage(tenantId, id) {
  const row = await get(messageSelect('WHERE m.tenant_id = ? AND m.id = ?'), [tenantId, id]);
  return normalize(row);
}

async function assertTicket(tenantId, ticketId) {
  const ticket = await get('SELECT id, status FROM tickets WHERE tenant_id = ? AND id = ?', [tenantId, Number(ticketId)]);
  if (!ticket) throw notFound('Ticket not found.');
  return ticket;
}

function normalize(row) {
  return row ? { ...row, isInternal: Boolean(row.isInternal) } : row;
}
