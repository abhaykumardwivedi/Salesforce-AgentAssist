import { get, now, run } from '../database/db.js';
import { unauthorized } from '../utils/httpError.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { generateRefreshToken, hashRefreshToken, signAccessToken } from '../utils/tokens.js';
import { recordAudit } from './auditService.js';

export async function signup(payload) {
  const email = normalizeEmail(payload.email);
  const slug = await uniqueSlug(payload.companyName);
  const createdAt = now();

  const tenantResult = await run(
    'INSERT INTO tenants (name, slug, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [payload.companyName.trim(), slug, 'ACTIVE', createdAt, createdAt],
  );
  const tenantId = Number(tenantResult.lastInsertRowid);

  const passwordHash = await hashPassword(payload.password);
  const userResult = await run(
    `INSERT INTO users (tenant_id, full_name, email, password_hash, role, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'OWNER', 'ACTIVE', ?, ?)`,
    [tenantId, payload.fullName.trim(), email, passwordHash, createdAt, createdAt],
  );

  const user = await getUserById(Number(userResult.lastInsertRowid));
  await recordAudit({ tenantId, userId: user.id, action: 'AUTH_SIGNUP', entity: 'user', entityId: user.id });
  return issueSession(user);
}

export async function login(payload) {
  const email = normalizeEmail(payload.email);
  const record = await get(
    `SELECT id, tenant_id AS "tenantId", full_name AS "fullName", email, password_hash AS "passwordHash", role, status
     FROM users WHERE lower(email) = ? ORDER BY id ASC LIMIT 1`,
    [email],
  );

  const ok = record && record.status === 'ACTIVE' && (await verifyPassword(payload.password, record.passwordHash));
  if (!ok) throw unauthorized('Invalid email or password.');

  await run('UPDATE users SET last_login_at = ? WHERE id = ?', [now(), record.id]);
  await recordAudit({ tenantId: record.tenantId, userId: record.id, action: 'AUTH_LOGIN' });
  const user = await getUserById(record.id);
  return issueSession(user);
}

export async function refresh(refreshToken) {
  if (!refreshToken) throw unauthorized('Refresh token is required.');
  const tokenHash = hashRefreshToken(refreshToken);
  const stored = await get(
    `SELECT rt.id, rt.user_id AS "userId", rt.expires_at AS "expiresAt", rt.revoked_at AS "revokedAt"
     FROM refresh_tokens rt WHERE rt.token_hash = ?`,
    [tokenHash],
  );

  if (!stored || stored.revokedAt || new Date(stored.expiresAt).getTime() < Date.now()) {
    throw unauthorized('Refresh token is invalid or expired.');
  }

  await run('UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?', [now(), stored.id]);
  const user = await getUserById(stored.userId);
  if (!user || user.status !== 'ACTIVE') throw unauthorized('Account is not active.');
  return issueSession(user);
}

export async function logout(refreshToken) {
  if (!refreshToken) return;
  const tokenHash = hashRefreshToken(refreshToken);
  await run('UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL', [now(), tokenHash]);
}

export function getUserById(id) {
  return get(
    `SELECT u.id, u.tenant_id AS "tenantId", u.full_name AS "fullName", u.email, u.role, u.status,
            t.name AS "tenantName", t.slug AS "tenantSlug"
     FROM users u JOIN tenants t ON t.id = u.tenant_id
     WHERE u.id = ?`,
    [Number(id)],
  );
}

async function issueSession(user) {
  const accessToken = signAccessToken(user);
  const { token, tokenHash, expiresAt } = generateRefreshToken();
  await run(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)',
    [user.id, tokenHash, expiresAt, now()],
  );
  return { accessToken, refreshToken: token, user: publicUser(user) };
}

export function publicUser(user) {
  return {
    id: user.id,
    tenantId: user.tenantId,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    tenantName: user.tenantName,
    tenantSlug: user.tenantSlug,
  };
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function uniqueSlug(companyName) {
  const base = String(companyName || 'workspace')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'workspace';

  let candidate = base;
  let suffix = 1;
  while (await get('SELECT id FROM tenants WHERE slug = ?', [candidate])) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}
