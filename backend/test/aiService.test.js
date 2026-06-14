import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyTicket } from '../src/services/aiService.js';

test('classifies refund/payment issues as high priority billing work', async () => {
  const result = await classifyTicket('My payment was deducted twice and I need a refund urgently.');
  assert.equal(result.category, 'REFUND');
  assert.equal(result.priority, 'HIGH');
  assert.equal(result.sentiment, 'NEGATIVE');
  assert.equal(result.assignedTeam, 'Billing Support');
});

test('uses defaults for ambiguous descriptions', async () => {
  const result = await classifyTicket('Need help with this request.');
  assert.equal(result.category, 'GENERAL');
  assert.equal(result.priority, 'MEDIUM');
  assert.equal(result.sentiment, 'NEUTRAL');
  assert.equal(result.assignedTeam, 'General Support');
});
