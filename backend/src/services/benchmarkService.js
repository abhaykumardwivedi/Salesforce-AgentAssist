import { all, dbMode } from '../database/db.js';

// Minimum number of contributing workspaces before any network figure is shown.
// This is the k in k-anonymity: below it, we reveal nothing.
const MIN_TENANTS = Number(process.env.BENCHMARK_MIN_TENANTS || 3);

// Anonymized cross-tenant benchmarking. Aggregates are computed over ALL active
// workspaces, but only bare numbers (medians) leave — never any tenant identity
// or row-level data. If too few workspaces contribute, nothing is returned.
export async function getBenchmark(tenantId) {
  const metricsByTenant = await computeTenantMetrics();
  const contributing = metricsByTenant.length;

  if (contributing < MIN_TENANTS) {
    return { available: false, minTenants: MIN_TENANTS, contributing };
  }

  const mine = metricsByTenant.find((row) => row.tenantId === tenantId) || null;
  const metrics = ['avgResolutionHours', 'negativeRate', 'ticketsPerWeek', 'deflectionRate'];
  const network = {};
  for (const metric of metrics) {
    const values = metricsByTenant.map((row) => row[metric]).filter((v) => v != null && Number.isFinite(v));
    network[metric] = values.length ? median(values) : null;
  }

  return {
    available: true,
    contributing,
    network,
    mine: mine ? pick(mine, metrics) : null,
    // Lower is better for these; higher is better for deflectionRate.
    lowerIsBetter: ['avgResolutionHours', 'negativeRate'],
  };
}

async function computeTenantMetrics() {
  const tickets = await all(
    `SELECT tenant_id AS "tenantId", status, sentiment,
            created_at AS "createdAt", updated_at AS "updatedAt"
     FROM tickets`,
    [],
  );
  const deflections = await all(
    `SELECT tenant_id AS "tenantId", COUNT(*) AS total,
            SUM(CASE WHEN deflected ${dbMode === 'postgres' ? '= TRUE' : '= 1'} THEN 1 ELSE 0 END) AS deflected
     FROM deflection_events GROUP BY tenant_id`,
    [],
  );

  const deflectionByTenant = new Map(
    deflections.map((row) => [Number(row.tenantId), { total: Number(row.total), deflected: Number(row.deflected) }]),
  );

  const byTenant = new Map();
  for (const ticket of tickets) {
    const id = Number(ticket.tenantId);
    if (!byTenant.has(id)) byTenant.set(id, { tenantId: id, tickets: [] });
    byTenant.get(id).tickets.push(ticket);
  }

  const result = [];
  for (const { tenantId, tickets: rows } of byTenant.values()) {
    const total = rows.length;
    if (!total) continue;
    const negative = rows.filter((t) => t.sentiment === 'NEGATIVE').length;
    const resolved = rows.filter((t) => ['RESOLVED', 'CLOSED'].includes(t.status));
    const resolutionHours = resolved
      .map((t) => (new Date(t.updatedAt).getTime() - new Date(t.createdAt).getTime()) / 3600000)
      .filter((h) => Number.isFinite(h) && h >= 0);
    const weeks = spanWeeks(rows);
    const deflection = deflectionByTenant.get(tenantId);

    result.push({
      tenantId,
      avgResolutionHours: resolutionHours.length ? Math.round(avg(resolutionHours)) : null,
      negativeRate: Math.round((negative / total) * 100),
      ticketsPerWeek: Math.round((total / weeks) * 10) / 10,
      deflectionRate: deflection && deflection.total ? Math.round((deflection.deflected / deflection.total) * 100) : null,
    });
  }
  return result;
}

function spanWeeks(rows) {
  const times = rows.map((t) => new Date(t.createdAt).getTime()).filter(Number.isFinite);
  if (times.length < 2) return 1;
  const weeks = (Math.max(...times) - Math.min(...times)) / (7 * 24 * 3600 * 1000);
  return Math.max(1, weeks);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(value * 10) / 10;
}

function avg(values) {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function pick(obj, keys) {
  return Object.fromEntries(keys.map((key) => [key, obj[key]]));
}
