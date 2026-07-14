import { get, now, run } from '../database/db.js';
import { badRequest } from '../utils/httpError.js';

// Current billing period as YYYY-MM (UTC), matching the ai_usage.period_month key.
export function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

// Increment this tenant's AI request counter for the current period. Best-effort:
// metering must never break an AI call, so callers ignore failures.
export async function recordAiUsage(tenantId, count = 1) {
  if (!tenantId) return;
  const period = currentPeriod();
  const timestamp = now();
  try {
    await run(
      `INSERT INTO ai_usage (tenant_id, period_month, calls, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (tenant_id, period_month)
       DO UPDATE SET calls = ai_usage.calls + ?, updated_at = ?`,
      [tenantId, period, count, timestamp, count, timestamp],
    );
  } catch (error) {
    console.error('Failed to record AI usage', error.message);
  }
}

export async function getUsage(tenantId) {
  const period = currentPeriod();
  const usageRow = await get(
    'SELECT calls FROM ai_usage WHERE tenant_id = ? AND period_month = ?',
    [tenantId, period],
  );
  const tenantRow = await get('SELECT ai_monthly_limit AS "limit" FROM tenants WHERE id = ?', [tenantId]);

  const used = Number(usageRow?.calls || 0);
  const limit = tenantRow?.limit == null ? null : Number(tenantRow.limit);
  return {
    period,
    used,
    limit,
    remaining: limit == null ? null : Math.max(0, limit - used),
    exceeded: limit != null && used >= limit,
  };
}

export async function isOverQuota(tenantId) {
  const usage = await getUsage(tenantId);
  return usage.exceeded;
}

// Set (or clear, with null) a tenant's monthly AI request cap.
export async function setMonthlyLimit(tenantId, limit) {
  let value = null;
  if (limit !== null && limit !== undefined) {
    const parsed = Number(limit);
    if (!Number.isInteger(parsed) || parsed < 0) throw badRequest('Monthly limit must be a non-negative whole number.');
    value = parsed;
  }
  await run('UPDATE tenants SET ai_monthly_limit = ?, updated_at = ? WHERE id = ?', [value, now(), tenantId]);
  return getUsage(tenantId);
}
