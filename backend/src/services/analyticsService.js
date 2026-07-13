import { all, get } from '../database/db.js';

const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const CATEGORIES = ['BILLING', 'TECHNICAL', 'DELIVERY', 'ACCOUNT', 'REFUND', 'GENERAL'];
const SENTIMENTS = ['POSITIVE', 'NEUTRAL', 'NEGATIVE'];

// SLA response targets in hours, by priority.
const SLA_TARGET_HOURS = { CRITICAL: 4, HIGH: 8, MEDIUM: 24, LOW: 72 };
// Some categories take longer to close than others.
const CATEGORY_FACTOR = { TECHNICAL: 1.4, DELIVERY: 1.3, BILLING: 1.1, REFUND: 1.2, ACCOUNT: 1, GENERAL: 0.9 };

// ---------------------------------------------------------------------------
// Predictive scoring
// ---------------------------------------------------------------------------

// Deterministic churn + escalation risk for a customer, derived from ticket and
// order signals. Kept rules-based so it is free, explainable, and works offline.
export async function getCustomerRisk(tenantId, customerId) {
  const stats = await customerStats(tenantId, customerId);
  if (!stats) return null;
  return scoreRisk(stats);
}

// Estimated time-to-resolution and SLA breach risk for a single ticket.
export function predictResolution(ticket) {
  const priority = PRIORITIES.includes(ticket.priority) ? ticket.priority : 'MEDIUM';
  const target = SLA_TARGET_HOURS[priority];
  const factor = CATEGORY_FACTOR[ticket.category] || 1;
  const estimatedHours = Math.round(target * factor);

  const open = ['OPEN', 'IN_PROGRESS'].includes(ticket.status);
  const ageHours = hoursSince(ticket.createdAt);
  const dueAt = new Date(new Date(ticket.createdAt).getTime() + target * 3600 * 1000).toISOString();

  let breachRisk = 'LOW';
  if (open) {
    if (ageHours >= target) breachRisk = 'BREACHED';
    else if (ageHours >= target * 0.7) breachRisk = 'HIGH';
    else if (ageHours >= target * 0.4) breachRisk = 'MEDIUM';
  }

  return {
    estimatedHours,
    targetHours: target,
    ageHours: Math.round(ageHours),
    dueAt,
    breachRisk,
  };
}

function scoreRisk(stats) {
  const totalTickets = stats.totalTickets || 0;
  const negativeRatio = totalTickets ? stats.negativeTickets / totalTickets : 0;

  const signals = [];
  let churn = 0;

  if (stats.segment === 'AT_RISK') { churn += 45; signals.push('Marked as an at-risk account'); }
  if (stats.openTickets > 0) { churn += Math.min(stats.openTickets * 12, 36); signals.push(`${stats.openTickets} open ticket(s)`); }
  if (negativeRatio > 0) { churn += Math.round(negativeRatio * 30); if (negativeRatio >= 0.5) signals.push('Majority of tickets have negative sentiment'); }
  if (stats.failedOrders > 0) { churn += Math.min(stats.failedOrders * 10, 20); signals.push(`${stats.failedOrders} failed order(s)`); }
  if (totalTickets === 0 && Number(stats.totalSpend) === 0) { churn += 10; }

  let escalation = 0;
  if (stats.openHighTickets > 0) { escalation += Math.min(stats.openHighTickets * 20, 60); signals.push(`${stats.openHighTickets} open high/critical ticket(s)`); }
  escalation += Math.round(negativeRatio * 40);

  churn = clamp(churn);
  escalation = clamp(escalation);
  const score = Math.max(churn, escalation);

  return {
    churnRisk: churn,
    escalationRisk: escalation,
    level: score >= 60 ? 'HIGH' : score >= 30 ? 'MEDIUM' : 'LOW',
    signals: signals.length ? signals : ['No notable risk signals'],
  };
}

async function customerStats(tenantId, customerId) {
  return get(
    `SELECT
        c.id,
        c.segment,
        (SELECT COUNT(*) FROM tickets t WHERE t.customer_id = c.id AND t.status IN ('OPEN', 'IN_PROGRESS')) AS "openTickets",
        (SELECT COUNT(*) FROM tickets t WHERE t.customer_id = c.id AND t.status IN ('OPEN', 'IN_PROGRESS') AND t.priority IN ('HIGH', 'CRITICAL')) AS "openHighTickets",
        (SELECT COUNT(*) FROM tickets t WHERE t.customer_id = c.id AND t.sentiment = 'NEGATIVE') AS "negativeTickets",
        (SELECT COUNT(*) FROM tickets t WHERE t.customer_id = c.id) AS "totalTickets",
        (SELECT COALESCE(SUM(amount), 0) FROM orders o WHERE o.customer_id = c.id) AS "totalSpend",
        (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.status = 'FAILED') AS "failedOrders"
     FROM customers c
     WHERE c.tenant_id = ? AND c.id = ?`,
    [tenantId, Number(customerId)],
  );
}

// ---------------------------------------------------------------------------
// Workspace analytics overview
// ---------------------------------------------------------------------------

export async function getAnalyticsOverview(tenantId) {
  const tickets = await all(
    `SELECT id, status, priority, category, sentiment,
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM tickets WHERE tenant_id = ?`,
    [tenantId],
  );

  const resolved = tickets.filter((t) => ['RESOLVED', 'CLOSED'].includes(t.status));
  const resolutionHours = resolved
    .map((t) => hoursBetween(t.createdAt, t.updatedAt))
    .filter((h) => Number.isFinite(h) && h >= 0);

  return {
    totals: {
      total: tickets.length,
      open: tickets.filter((t) => ['OPEN', 'IN_PROGRESS'].includes(t.status)).length,
      resolved: resolved.length,
      negative: tickets.filter((t) => t.sentiment === 'NEGATIVE').length,
    },
    byStatus: countBy(tickets, 'status', STATUSES),
    byPriority: countBy(tickets, 'priority', PRIORITIES),
    byCategory: countBy(tickets, 'category', CATEGORIES),
    bySentiment: countBy(tickets, 'sentiment', SENTIMENTS),
    avgResolutionHours: resolutionHours.length
      ? Math.round(resolutionHours.reduce((sum, h) => sum + h, 0) / resolutionHours.length)
      : null,
    weeklyTrend: weeklyTrend(tickets, 8),
    topRiskCustomers: await topRiskCustomers(tenantId),
  };
}

async function topRiskCustomers(tenantId, limit = 5) {
  const rows = await all(
    `SELECT
        c.id,
        c.full_name AS "fullName",
        c.segment,
        (SELECT COUNT(*) FROM tickets t WHERE t.customer_id = c.id AND t.status IN ('OPEN', 'IN_PROGRESS')) AS "openTickets",
        (SELECT COUNT(*) FROM tickets t WHERE t.customer_id = c.id AND t.status IN ('OPEN', 'IN_PROGRESS') AND t.priority IN ('HIGH', 'CRITICAL')) AS "openHighTickets",
        (SELECT COUNT(*) FROM tickets t WHERE t.customer_id = c.id AND t.sentiment = 'NEGATIVE') AS "negativeTickets",
        (SELECT COUNT(*) FROM tickets t WHERE t.customer_id = c.id) AS "totalTickets",
        (SELECT COALESCE(SUM(amount), 0) FROM orders o WHERE o.customer_id = c.id) AS "totalSpend",
        (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.status = 'FAILED') AS "failedOrders"
     FROM customers c
     WHERE c.tenant_id = ?`,
    [tenantId],
  );

  return rows
    .map((row) => ({ id: row.id, fullName: row.fullName, segment: row.segment, ...scoreRisk(row) }))
    .filter((row) => row.level !== 'LOW')
    .sort((a, b) => Math.max(b.churnRisk, b.escalationRisk) - Math.max(a.churnRisk, a.escalationRisk))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countBy(rows, field, keys) {
  const counts = Object.fromEntries(keys.map((key) => [key, 0]));
  for (const row of rows) {
    if (counts[row[field]] !== undefined) counts[row[field]] += 1;
  }
  return counts;
}

function weeklyTrend(tickets, weeks) {
  const now = Date.now();
  const weekMs = 7 * 24 * 3600 * 1000;
  const buckets = Array.from({ length: weeks }, (_, index) => ({ weeksAgo: weeks - 1 - index, count: 0 }));
  for (const ticket of tickets) {
    const created = new Date(ticket.createdAt).getTime();
    if (!Number.isFinite(created)) continue;
    const weeksAgo = Math.floor((now - created) / weekMs);
    if (weeksAgo >= 0 && weeksAgo < weeks) {
      buckets[weeks - 1 - weeksAgo].count += 1;
    }
  }
  return buckets;
}

function hoursBetween(start, end) {
  return (new Date(end).getTime() - new Date(start).getTime()) / (3600 * 1000);
}

function hoursSince(start) {
  return (Date.now() - new Date(start).getTime()) / (3600 * 1000);
}

function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}
