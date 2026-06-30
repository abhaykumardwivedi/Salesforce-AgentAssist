import { all, get, now, run } from '../database/db.js';
import { badRequest, conflict, notFound } from '../utils/httpError.js';
import { hashPassword } from '../utils/password.js';

const ROLES = ['OWNER', 'ADMIN', 'AGENT'];

export async function listUsers(tenantId) {
  return all(
    `SELECT id, full_name AS "fullName", email, role, status, last_login_at AS "lastLoginAt", created_at AS "createdAt"
     FROM users WHERE tenant_id = ? ORDER BY created_at ASC`,
    [tenantId],
  );
}

export async function createUser(tenantId, payload) {
  const email = String(payload.email || '').trim().toLowerCase();
  const role = String(payload.role || 'AGENT').toUpperCase();
  if (!payload.fullName || !payload.fullName.trim()) throw badRequest('Full name is required.');
  if (!email) throw badRequest('Email is required.');
  if (!ROLES.includes(role)) throw badRequest('Role is invalid.');
  if (!payload.password || String(payload.password).length < 8) {
    throw badRequest('Password must be at least 8 characters.');
  }

  if (await get('SELECT id FROM users WHERE tenant_id = ? AND lower(email) = ?', [tenantId, email])) {
    throw conflict('A user with this email already exists in this workspace.');
  }

  const passwordHash = await hashPassword(payload.password);
  const createdAt = now();
  const result = await run(
    `INSERT INTO users (tenant_id, full_name, email, password_hash, role, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`,
    [tenantId, payload.fullName.trim(), email, passwordHash, role, createdAt, createdAt],
  );
  return getUser(tenantId, Number(result.lastInsertRowid));
}

export async function getUser(tenantId, id) {
  const user = await get(
    `SELECT id, full_name AS "fullName", email, role, status, last_login_at AS "lastLoginAt", created_at AS "createdAt"
     FROM users WHERE tenant_id = ? AND id = ?`,
    [tenantId, Number(id)],
  );
  if (!user) throw notFound('User not found.');
  return user;
}

export async function updateUser(tenantId, id, payload) {
  const user = await getUser(tenantId, id);
  const role = payload.role ? String(payload.role).toUpperCase() : user.role;
  const status = payload.status ? String(payload.status).toUpperCase() : user.status;
  if (!ROLES.includes(role)) throw badRequest('Role is invalid.');
  if (!['ACTIVE', 'DISABLED'].includes(status)) throw badRequest('Status is invalid.');

  await run(
    'UPDATE users SET role = ?, status = ?, updated_at = ? WHERE tenant_id = ? AND id = ?',
    [role, status, now(), tenantId, user.id],
  );
  return getUser(tenantId, user.id);
}
