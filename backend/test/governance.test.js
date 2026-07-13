import assert from 'node:assert/strict';
import test from 'node:test';
import { redactModelInput, redactPii } from '../src/utils/pii.js';
import { detectLanguageHeuristic } from '../src/utils/language.js';
import { getUsage, recordAiUsage, setMonthlyLimit } from '../src/services/usageService.js';

test('PII redaction strips emails, phones, and card numbers but keeps names', () => {
  const input = 'Hi, I am Rahul Sharma, email rahul@example.com, phone +91-98765-10001, card 4111 1111 1111 1111.';
  const out = redactPii(input);
  assert.ok(out.includes('Rahul Sharma'));
  assert.ok(!out.includes('rahul@example.com'));
  assert.ok(out.includes('[redacted-email]'));
  assert.ok(out.includes('[redacted-card]'));
  assert.ok(!out.includes('4111 1111 1111 1111'));
  assert.ok(!/98765/.test(out));
});

test('redactModelInput redacts message content and tool outputs, not schema', () => {
  const body = {
    model: 'gpt-4.1-mini',
    input: [
      { role: 'user', content: 'Reach me at jane@acme.io' },
      { type: 'function_call_output', call_id: 'c1', output: '{"email":"bob@acme.io"}' },
    ],
    tools: [{ type: 'function', name: 'search' }],
  };
  const safe = redactModelInput(body);
  assert.ok(!JSON.stringify(safe.input).includes('jane@acme.io'));
  assert.ok(!JSON.stringify(safe.input).includes('bob@acme.io'));
  assert.equal(safe.model, 'gpt-4.1-mini');
  assert.equal(safe.tools[0].name, 'search');
  // original object is not mutated
  assert.ok(JSON.stringify(body.input).includes('jane@acme.io'));
});

test('language heuristic detects scripts and defaults to English', () => {
  assert.equal(detectLanguageHeuristic('मेरा भुगतान दो बार कट गया'), 'Hindi');
  assert.equal(detectLanguageHeuristic('I was charged twice'), 'English');
});

test('AI usage metering and monthly quota accounting', async () => {
  const TENANT = 1;
  await setMonthlyLimit(TENANT, null); // reset to unlimited baseline
  const before = await getUsage(TENANT);
  await recordAiUsage(TENANT, 3);
  const after = await getUsage(TENANT);
  assert.equal(after.used, before.used + 3);
  assert.equal(after.limit, null);
  assert.equal(after.exceeded, false);

  const limited = await setMonthlyLimit(TENANT, after.used); // limit == current usage
  assert.equal(limited.limit, after.used);
  assert.equal(limited.exceeded, true);
  assert.equal(limited.remaining, 0);

  await setMonthlyLimit(TENANT, null); // leave DB clean for other suites
});
