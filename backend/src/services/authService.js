import { get, now, run } from '../database/db.js';
import { badRequest, unauthorized } from '../utils/httpError.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { generateRefreshToken, generateUrlToken, hashRefreshToken, signAccessToken } from '../utils/tokens.js';
import { recordAudit } from './auditService.js';
import { sendPasswordResetEmail, sendVerificationEmail } from './emailService.js';

const PASSWORD_RESET_TTL_MIN = 60;
const EMAIL_VERIFY_TTL_MIN = 24 * 60;

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
  await sendEmailVerification(user).catch((error) => console.error('Verification email failed', error.message));
  return issueSession(user);
}

export async function requestPasswordReset(email) {
  const normalized = normalizeEmail(email);
  const record = await get(
    `SELECT id, tenant_id AS "tenantId", email, status FROM users WHERE lower(email) = ? AND status = 'ACTIVE' ORDER BY id ASC LIMIT 1`,
    [normalized],
  );
  // Always report success so the endpoint cannot be used to probe which
  // email addresses have accounts.
  if (!record) return { requested: true };

  const token = await createUserToken(record.id, 'PASSWORD_RESET', PASSWORD_RESET_TTL_MIN);
  await sendPasswordResetEmail(record.email, token);
  await recordAudit({ tenantId: record.tenantId, userId: record.id, action: 'AUTH_PASSWORD_RESET_REQUEST', entity: 'user', entityId: record.id });
  return { requested: true };
}

export async function resetPassword(token, newPassword) {
  // Validate the password before consuming the token so a rejected password
  // does not burn an otherwise valid reset link.
  if (!newPassword || String(newPassword).length < 8) throw badRequest('Password must be at least 8 characters.');
  const userId = await consumeUserToken(token, 'PASSWORD_RESET');
  if (!userId) throw badRequest('This reset link is invalid or has expired.');

  const passwordHash = await hashPassword(newPassword);
  await run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [passwordHash, now(), userId]);
  // Invalidate every existing session after a password reset.
  await run('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL', [now(), userId]);
  const user = await getUserById(userId);
  await recordAudit({ tenantId: user.tenantId, userId, action: 'AUTH_PASSWORD_RESET', entity: 'user', entityId: userId });
  return { reset: true };
}

export async function sendEmailVerification(user) {
  const token = await createUserToken(user.id, 'EMAIL_VERIFY', EMAIL_VERIFY_TTL_MIN);
  return sendVerificationEmail(user.email, token);
}

export async function verifyEmail(token) {
  const userId = await consumeUserToken(token, 'EMAIL_VERIFY');
  if (!userId) throw badRequest('This verification link is invalid or has expired.');
  await run('UPDATE users SET email_verified = 1, email_verified_at = ?, updated_at = ? WHERE id = ?', [now(), now(), userId]);
  const user = await getUserById(userId);
  await recordAudit({ tenantId: user.tenantId, userId, action: 'AUTH_EMAIL_VERIFIED', entity: 'user', entityId: userId });
  return { verified: true };
}

async function createUserToken(userId, purpose, ttlMinutes) {
  const { token, tokenHash } = generateUrlToken();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
  // Drop any previous unused tokens of the same purpose for this user.
  await run('DELETE FROM user_tokens WHERE user_id = ? AND purpose = ? AND used_at IS NULL', [userId, purpose]);
  await run(
    'INSERT INTO user_tokens (user_id, purpose, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
    [userId, purpose, tokenHash, expiresAt, now()],
  );
  return token;
}

async function consumeUserToken(rawToken, purpose) {
  if (!rawToken) return null;
  const tokenHash = hashRefreshToken(rawToken);
  const stored = await get(
    `SELECT id, user_id AS "userId", expires_at AS "expiresAt", used_at AS "usedAt"
     FROM user_tokens WHERE token_hash = ? AND purpose = ?`,
    [tokenHash, purpose],
  );
  if (!stored || stored.usedAt || new Date(stored.expiresAt).getTime() < Date.now()) return null;
  await run('UPDATE user_tokens SET used_at = ? WHERE id = ?', [now(), stored.id]);
  return stored.userId;
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
            u.email_verified AS "emailVerified",
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
    emailVerified: Boolean(user.emailVerified),
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
