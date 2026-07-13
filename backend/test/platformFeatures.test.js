import assert from 'node:assert/strict';
import test from 'node:test';
import { createRule, runRules, runSlaEscalation } from '../src/services/automationService.js';
import { createTicket, getTicket } from '../src/services/ticketService.js';
import { listMessages } from '../src/services/conversationService.js';
import { ensureWidgetKey, getDeflectionStats, widgetAsk, widgetEscalate } from '../src/services/widgetService.js';
import { getWebhookInfo, handleInboundCaseUpdate, rotateWebhookSecret } from '../src/services/salesforceService.js';
import { createCase } from '../src/services/ticketService.js';
import { bulkImportCustomers, bulkImportTickets } from '../src/services/dataService.js';
import { getBenchmark } from '../src/services/benchmarkService.js';
import { signup } from '../src/services/authService.js';

const TENANT = 1;

// --- ③ Automation ---
test('automation rule fires on ticket creation and applies its action', async () => {
  await createRule(TENANT, { name: 'Refund to critical', triggerEvent: 'TICKET_CREATED', conditionField: 'category', conditionOp: 'EQUALS', conditionValue: 'REFUND', actionType: 'SET_PRIORITY', actionValue: 'CRITICAL' });
  const ticket = await createTicket(TENANT, { customerId: 4, subject: 'Refund', description: 'My payment was deducted twice and I need a refund urgently.' });
  assert.equal(ticket.priority, 'CRITICAL');
  const notes = (await listMessages(TENANT, ticket.id)).filter((m) => m.authorType === 'SYSTEM');
  assert.ok(notes.some((n) => /priority set to CRITICAL/.test(n.body)));
});

test('SLA escalation bumps priority on breached open tickets', async () => {
  const escalated = await runSlaEscalation(TENANT);
  assert.ok(Array.isArray(escalated));
  assert.ok(escalated.every((e) => e.to));
});

// --- ④ Deflection widget ---
test('widget answers from KB only and records deflection; escalation creates a ticket', async () => {
  const key = await ensureWidgetKey(TENANT);
  const ask = await widgetAsk(key, 'How do I get a refund for a duplicate charge?');
  assert.ok(ask.answer.length > 0);
  const esc = await widgetEscalate(key, { name: 'Visitor', email: 'visitor.widget@example.com', subject: 'Need help', message: 'The article did not help.' });
  assert.match(esc.reference, /TICKET-\d+/);
  const stats = await getDeflectionStats(TENANT);
  assert.ok(stats.total >= 2);
  assert.equal(stats.escalated + stats.deflected, stats.total);
});

// --- ⑤ Salesforce-deep ---
test('inbound Salesforce webhook maps case status back to the ticket', async () => {
  const ticket = await createTicket(TENANT, { customerId: 4, subject: 'SF case', description: 'Please update my account email.' });
  const sfCase = await createCase(TENANT, ticket.id);
  const secret = await rotateWebhookSecret(TENANT);
  const info = await getWebhookInfo(TENANT);
  assert.equal(info.configured, true);
  const result = await handleInboundCaseUpdate(TENANT, secret, { caseId: sfCase.id, status: 'Closed' });
  assert.equal(result.updated, true);
  assert.equal((await getTicket(TENANT, ticket.id)).status, 'CLOSED');
  await assert.rejects(() => handleInboundCaseUpdate(TENANT, 'wrong-secret', { caseId: sfCase.id, status: 'Closed' }));
});

// --- ⑥ Big data + anonymized benchmark ---
test('bulk import validates and de-duplicates rows', async () => {
  const result = await bulkImportCustomers(TENANT, [
    { fullName: 'Import A', email: 'import.a@example.com' },
    { fullName: '', email: 'bad' },
    { fullName: 'Dup', email: 'import.a@example.com' },
  ]);
  assert.equal(result.created, 1);
  assert.ok(result.errors.length >= 1);
  const tickets = await bulkImportTickets(TENANT, [
    { customerEmail: 'import.a@example.com', subject: 'Bulk ticket', description: 'App crashes on login.' },
  ]);
  assert.equal(tickets.created, 1);
});

test('benchmark enforces k-anonymity then reports once enough tenants contribute', async () => {
  const before = await getBenchmark(TENANT);
  assert.equal(before.available, false);
  assert.equal(before.minTenants, 3);

  // Stand up two more workspaces with ticket data.
  for (const suffix of ['b1', 'b2']) {
    const session = await signup({ companyName: `Bench ${suffix}`, fullName: `Owner ${suffix}`, email: `owner.${suffix}@bench.test`, password: 'password123' });
    const tid = session.user.tenantId;
    await bulkImportCustomers(tid, [{ fullName: `Cust ${suffix}`, email: `cust.${suffix}@bench.test` }]);
    await bulkImportTickets(tid, [{ customerEmail: `cust.${suffix}@bench.test`, subject: 'Issue', description: 'Payment failed and I need help.' }]);
  }

  const after = await getBenchmark(TENANT);
  assert.equal(after.available, true);
  assert.ok(after.contributing >= 3);
  assert.ok(after.network.negativeRate != null);
  assert.ok(after.mine != null);
});
