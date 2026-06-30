import assert from 'node:assert/strict';
import test from 'node:test';
import { getCustomer360 } from '../src/services/customerService.js';

const TENANT = 1;

test('customer 360 aggregates orders, tickets, and AI summary', async () => {
  const result = await getCustomer360(TENANT, 1);
  assert.equal(result.customer.fullName, 'Rahul Sharma');
  assert.equal(result.totalOrders, 3);
  assert.equal(result.openTickets, 1);
  assert.ok(result.totalSpend > 50000);
  assert.ok(result.aiCustomerSummary.includes('High-value'));
});
