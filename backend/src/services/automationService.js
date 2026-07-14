import { all, get, now, run } from '../database/db.js';
import { badRequest, notFound } from '../utils/httpError.js';
import { addMessage, assignTicket } from './conversationService.js';
import { predictResolution } from './analyticsService.js';

const TRIGGERS = ['TICKET_CREATED', 'CUSTOMER_MESSAGE'];
const ACTIONS = ['SET_PRIORITY', 'SET_STATUS', 'ADD_NOTE', 'ASSIGN_USER'];
const CONDITION_FIELDS = ['category', 'priority', 'sentiment', 'subject', 'description', 'language'];
const CONDITION_OPS = ['EQUALS', 'CONTAINS'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];

function ruleSelect(where = '') {
  return `SELECT
      id, tenant_id AS "tenantId", name,
      trigger_event AS "triggerEvent",
      condition_field AS "conditionField",
      condition_op AS "conditionOp",
      condition_value AS "conditionValue",
      action_type AS "actionType",
      action_value AS "actionValue",
      is_active AS "isActive",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM automation_rules ${where}`;
}

export async function listRules(tenantId) {
  const rows = await all(ruleSelect('WHERE tenant_id = ? ORDER BY id ASC'), [tenantId]);
  return rows.map((row) => ({ ...row, isActive: Boolean(row.isActive) }));
}

export async function createRule(tenantId, payload) {
  const rule = normalizeRule(payload);
  const createdAt = now();
  const result = await run(
    `INSERT INTO automation_rules
     (tenant_id, name, trigger_event, condition_field, condition_op, condition_value, action_type, action_value, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [tenantId, rule.name, rule.triggerEvent, rule.conditionField, rule.conditionOp, rule.conditionValue, rule.actionType, rule.actionValue, 1, createdAt, createdAt],
  );
  return getRule(tenantId, Number(result.lastInsertRowid));
}

export async function updateRule(tenantId, id, payload) {
  const existing = await getRule(tenantId, id);
  const merged = normalizeRule({ ...existing, ...payload });
  const isActive = payload.isActive === undefined ? existing.isActive : Boolean(payload.isActive);
  await run(
    `UPDATE automation_rules
     SET name = ?, trigger_event = ?, condition_field = ?, condition_op = ?, condition_value = ?, action_type = ?, action_value = ?, is_active = ?, updated_at = ?
     WHERE tenant_id = ? AND id = ?`,
    [merged.name, merged.triggerEvent, merged.conditionField, merged.conditionOp, merged.conditionValue, merged.actionType, merged.actionValue, isActive ? 1 : 0, now(), tenantId, existing.id],
  );
  return getRule(tenantId, existing.id);
}

export async function deleteRule(tenantId, id) {
  const existing = await getRule(tenantId, id);
  await run('DELETE FROM automation_rules WHERE tenant_id = ? AND id = ?', [tenantId, existing.id]);
}

export async function getRule(tenantId, id) {
  const row = await get(ruleSelect('WHERE tenant_id = ? AND id = ?'), [tenantId, Number(id)]);
  if (!row) throw notFound('Automation rule not found.');
  return { ...row, isActive: Boolean(row.isActive) };
}

// Evaluate active rules for a trigger against a ticket and apply matching
// actions. Returns the names of the rules that fired. Best-effort: never throws
// into the caller's main flow.
export async function runRules(tenantId, triggerEvent, ticket) {
  try {
    const rules = (await listRules(tenantId)).filter((rule) => rule.isActive && rule.triggerEvent === triggerEvent);
    const fired = [];
    for (const rule of rules) {
      if (!matches(rule, ticket)) continue;
      await applyAction(tenantId, rule, ticket);
      fired.push(rule.name);
    }
    return fired;
  } catch (error) {
    console.error('Automation rule evaluation failed', error.message);
    return [];
  }
}

// Time-based escalation: bump priority on open tickets that have breached their
// SLA target, leaving an audit trail as a system note. Returns escalated ids.
export async function runSlaEscalation(tenantId) {
  const tickets = await all(
    `SELECT id, priority, category, status, created_at AS "createdAt"
     FROM tickets
     WHERE tenant_id = ? AND status IN ('OPEN', 'IN_PROGRESS')`,
    [tenantId],
  );
  const escalated = [];
  for (const ticket of tickets) {
    const prediction = predictResolution(ticket);
    if (prediction.breachRisk !== 'BREACHED') continue;
    const next = escalatePriority(ticket.priority);
    if (!next) continue;
    await run('UPDATE tickets SET priority = ?, updated_at = ? WHERE tenant_id = ? AND id = ?', [next, now(), tenantId, ticket.id]);
    await systemNote(tenantId, ticket.id, `SLA breached — priority escalated from ${ticket.priority} to ${next}.`);
    escalated.push({ ticketId: ticket.id, from: ticket.priority, to: next });
  }
  return escalated;
}

async function applyAction(tenantId, rule, ticket) {
  switch (rule.actionType) {
    case 'SET_PRIORITY': {
      const priority = String(rule.actionValue || '').toUpperCase();
      if (!PRIORITIES.includes(priority)) return;
      await run('UPDATE tickets SET priority = ?, updated_at = ? WHERE tenant_id = ? AND id = ?', [priority, now(), tenantId, ticket.id]);
      await systemNote(tenantId, ticket.id, `Automation "${rule.name}": priority set to ${priority}.`);
      break;
    }
    case 'SET_STATUS': {
      const status = String(rule.actionValue || '').toUpperCase();
      if (!STATUSES.includes(status)) return;
      await run('UPDATE tickets SET status = ?, updated_at = ? WHERE tenant_id = ? AND id = ?', [status, now(), tenantId, ticket.id]);
      await systemNote(tenantId, ticket.id, `Automation "${rule.name}": status set to ${status}.`);
      break;
    }
    case 'ADD_NOTE': {
      await systemNote(tenantId, ticket.id, `Automation "${rule.name}": ${rule.actionValue || 'flagged for review.'}`);
      break;
    }
    case 'ASSIGN_USER': {
      const userId = Number(rule.actionValue);
      if (!Number.isInteger(userId)) return;
      const result = await assignTicket(tenantId, ticket.id, userId);
      await systemNote(tenantId, ticket.id, `Automation "${rule.name}": assigned to ${result.assignedUserName || `user ${userId}`}.`);
      break;
    }
    default:
      break;
  }
}

function matches(rule, ticket) {
  if (!rule.conditionField) return true;
  const fieldValue = String(ticket[rule.conditionField] ?? '').toLowerCase();
  const compare = String(rule.conditionValue ?? '').toLowerCase();
  if (rule.conditionOp === 'CONTAINS') return fieldValue.includes(compare);
  return fieldValue === compare;
}

function systemNote(tenantId, ticketId, body) {
  return addMessage(tenantId, ticketId, { authorType: 'SYSTEM', authorUserId: null, body, isInternal: true });
}

function escalatePriority(current) {
  const index = PRIORITIES.indexOf(current);
  if (index < 0 || index >= PRIORITIES.length - 1) return null;
  return PRIORITIES[index + 1];
}

function normalizeRule(payload) {
  const name = String(payload.name || '').trim();
  if (name.length < 2) throw badRequest('Rule name is required.');
  const triggerEvent = String(payload.triggerEvent || '').toUpperCase();
  if (!TRIGGERS.includes(triggerEvent)) throw badRequest('Invalid trigger event.');
  const actionType = String(payload.actionType || '').toUpperCase();
  if (!ACTIONS.includes(actionType)) throw badRequest('Invalid action type.');

  let conditionField = payload.conditionField ? String(payload.conditionField).toLowerCase() : null;
  let conditionOp = null;
  let conditionValue = null;
  if (conditionField) {
    if (!CONDITION_FIELDS.includes(conditionField)) throw badRequest('Invalid condition field.');
    conditionOp = String(payload.conditionOp || 'EQUALS').toUpperCase();
    if (!CONDITION_OPS.includes(conditionOp)) throw badRequest('Invalid condition operator.');
    conditionValue = String(payload.conditionValue || '').trim();
    if (!conditionValue) throw badRequest('Condition value is required when a condition field is set.');
  }

  const actionValue = payload.actionValue == null ? null : String(payload.actionValue).trim();
  if ((actionType === 'SET_PRIORITY' || actionType === 'SET_STATUS' || actionType === 'ASSIGN_USER' || actionType === 'ADD_NOTE') && !actionValue) {
    throw badRequest('Action value is required.');
  }
  return { name: name.slice(0, 150), triggerEvent, conditionField, conditionOp, conditionValue, actionType, actionValue: actionValue ? actionValue.slice(0, 200) : null };
}
