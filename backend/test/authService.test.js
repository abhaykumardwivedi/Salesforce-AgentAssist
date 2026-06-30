import assert from 'node:assert/strict';
import test from 'node:test';
import { login, signup } from '../src/services/authService.js';
import { createCustomer, listCustomers } from '../src/services/customerService.js';
import { verifyAccessToken } from '../src/utils/tokens.js';

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
