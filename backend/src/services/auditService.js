import { all, now, run } from '../database/db.js';

export async function recordAudit({ tenantId, userId = null, action, entity = null, entityId = null, metadata = null }) {
  if (!tenantId || !action) return null;
  try {
    const result = await run(
      `INSERT INTO audit_logs (tenant_id, user_id, action, entity, entity_id, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId,
        userId,
        String(action).slice(0, 80),
        entity ? String(entity).slice(0, 80) : null,
        entityId !== null && entityId !== undefined ? String(entityId).slice(0, 80) : null,
        metadata ? JSON.stringify(metadata).slice(0, 2000) : null,
        now(),
      ],
    );
    return result.lastInsertRowid;
  } catch (error) {
    console.error('Failed to write audit log', error);
    return null;
  }
}

export async function listAudit(tenantId, limit = 100) {
  const rows = await all(
    `SELECT id, user_id AS "userId", action, entity, entity_id AS "entityId", metadata, created_at AS "timestamp"
     FROM audit_logs
     WHERE tenant_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [tenantId, limit],
  );
  return rows.map((row) => ({ ...row, metadata: row.metadata ? JSON.parse(row.metadata) : null }));
}
