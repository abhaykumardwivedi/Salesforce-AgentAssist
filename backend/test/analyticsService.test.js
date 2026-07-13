import assert from 'node:assert/strict';
import test from 'node:test';
import { getAnalyticsOverview, getCustomerRisk, predictResolution } from '../src/services/analyticsService.js';

const TENANT = 1;

test('at-risk customer scores high churn with explainable signals', async () => {
  const risk = await getCustomerRisk(TENANT, 3); // Aisha Khan — AT_RISK, open negative tickets, failed order
  assert.equal(risk.level, 'HIGH');
  assert.ok(risk.churnRisk >= 60);
  assert.ok(risk.signals.length > 0);
});

test('SLA prediction flags an old open high-priority ticket as breached', async () => {
  const prediction = predictResolution({ priority: 'HIGH', category: 'REFUND', status: 'OPEN', createdAt: '2020-01-01T00:00:00.000Z' });
  assert.equal(prediction.breachRisk, 'BREACHED');
  assert.equal(prediction.targetHours, 8);
  assert.ok(prediction.estimatedHours > 0);
});

test('SLA prediction stays low risk for a fresh ticket', async () => {
  const prediction = predictResolution({ priority: 'LOW', category: 'GENERAL', status: 'OPEN', createdAt: new Date().toISOString() });
  assert.equal(prediction.breachRisk, 'LOW');
});

test('analytics overview aggregates ticket counts and top risk customers', async () => {
  const overview = await getAnalyticsOverview(TENANT);
  assert.equal(overview.totals.total, 8);
  assert.ok(overview.totals.open >= 1);
  assert.equal(overview.weeklyTrend.length, 8);
  assert.ok(Array.isArray(overview.topRiskCustomers));
  assert.ok(overview.topRiskCustomers.every((c) => c.level !== 'LOW'));
});
