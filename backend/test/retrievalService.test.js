import assert from 'node:assert/strict';
import test from 'node:test';
import { searchArticles } from '../src/services/knowledgeService.js';
import { answerQuestion, findSimilarByText } from '../src/services/retrievalService.js';

const TENANT = 1;

test('knowledge base search ranks the most relevant article first (lexical fallback)', async () => {
  const results = await searchArticles(TENANT, 'charged twice duplicate refund', 3);
  assert.ok(results.length >= 1);
  assert.match(results[0].title, /duplicate charge/i);
  assert.ok(results[0].score > 0);
});

test('similar-ticket retrieval finds a related past ticket', async () => {
  const results = await findSimilarByText(TENANT, 'cannot login after resetting my password', { limit: 3 });
  assert.ok(results.length >= 1);
  assert.match(results[0].subject, /login/i);
});

test('RAG answer is grounded and returns sources when context exists', async () => {
  const result = await answerQuestion(TENANT, 'How do I refund a duplicate charge?');
  assert.equal(result.grounded, true);
  assert.ok(result.sources.length > 0);
  assert.ok(result.answer.length > 0);
});

test('RAG answer degrades gracefully when nothing relevant is found', async () => {
  const result = await answerQuestion(TENANT, 'zzzz qqqq unrelated gibberish xxxx');
  assert.equal(result.grounded, false);
  assert.deepEqual(result.sources, []);
});
