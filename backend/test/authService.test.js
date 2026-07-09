import assert from 'node:assert/strict';
import test from 'node:test';
import { get, now, run } from '../src/database/db.js';
import { login, refresh, requestPasswordReset, resetPassword, signup, verifyEmail } from '../src/services/authService.js';
import { createCustomer, listCustomers } from '../src/services/customerService.js';
import { generateUrlToken, verifyAccessToken } from '../src/utils/tokens.js';

// Reset/verify tokens are only ever delivered by email, so tests mint their own
// token the same way the service does (raw token + its hash) and store the hash,
// then exercise the flow with the raw token a user would receive in their inbox.
async function issueToken(userId, purpose, ttlMinutes = 60) {
  const { token, tokenHash } = generateUrlToken();
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();
  await run(
    'INSERT INTO user_tokens (user_id, purpose, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
    [userId, purpose, tokenHash, expiresAt, now()],
  );
  return token;
}

test('signup creates an isolated workspace with an owner', async () => {
  const session = await signup({ companyName: 'Acme Co', fullName: 'Ann Admin', email: 'ann@acme.test', password: 'Password123' });
  assert.ok(session.accessToken);
  assert.ok(session.refreshToken);
  assert.equal(session.user.role, 'OWNER');

  const decoded = verifyAccessToken(session.accessToken);
  assert.equal(String(decoded.sub), String(session.user.id));
  assert.equal(decoded.tenantId, session.user.tenantId);

  // A fresh workspace starts with no customers, isolated from the seeded demo tenant (id 1).
  const customers = await listCustomers(session.user.tenantId);
  assert.equal(customers.length, 0);

  await createCustomer(session.user.tenantId, { fullName: 'Bob Buyer', email: 'bob@acme.test' });
  assert.equal((await listCustomers(session.user.tenantId)).length, 1);
  assert.equal((await listCustomers(1)).length, 5);
});

test('login rejects an invalid password', async () => {
  await signup({ companyName: 'Beta Co', fullName: 'Bea Boss', email: 'bea@beta.test', password: 'Password123' });
  await assert.rejects(() => login({ email: 'bea@beta.test', password: 'wrong-password' }));
  const session = await login({ email: 'bea@beta.test', password: 'Password123' });
  assert.ok(session.accessToken);
});

test('password reset lets a user set a new password and revokes old sessions', async () => {
  const session = await signup({ companyName: 'Reset Co', fullName: 'Rex Reset', email: 'rex@reset.test', password: 'Password123' });
  const token = await issueToken(session.user.id, 'PASSWORD_RESET');

  const result = await resetPassword(token, 'BrandNewPass1');
  assert.equal(result.reset, true);

  // Old password no longer works; the new one does.
  await assert.rejects(() => login({ email: 'rex@reset.test', password: 'Password123' }));
  const relogin = await login({ email: 'rex@reset.test', password: 'BrandNewPass1' });
  assert.ok(relogin.accessToken);

  // The refresh token issued at signup was revoked by the reset.
  await assert.rejects(() => refresh(session.refreshToken));

  // A reset token is single use.
  await assert.rejects(() => resetPassword(token, 'AnotherPass1'));
});

test('requestPasswordReset never reveals whether an email exists', async () => {
  const result = await requestPasswordReset('nobody@nowhere.test');
  assert.deepEqual(result, { requested: true });
});

test('email verification marks the account verified with a one-time token', async () => {
  const session = await signup({ companyName: 'Verify Co', fullName: 'Val Verify', email: 'val@verify.test', password: 'Password123' });
  assert.equal(session.user.emailVerified, false);

  const token = await issueToken(session.user.id, 'EMAIL_VERIFY', 24 * 60);
  const result = await verifyEmail(token);
  assert.equal(result.verified, true);

  const relogin = await login({ email: 'val@verify.test', password: 'Password123' });
  assert.equal(relogin.user.emailVerified, true);

  // Verification tokens cannot be replayed.
  await assert.rejects(() => verifyEmail(token));
});
