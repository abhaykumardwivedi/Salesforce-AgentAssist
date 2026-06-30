import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptJson, encryptJson } from '../src/utils/crypto.js';

test('encrypts and decrypts a JSON payload round-trip', () => {
  const secret = { apiKey: 'sk-test-123', model: 'gpt-4.1-mini' };
  const ciphertext = encryptJson(secret);
  assert.notEqual(ciphertext, JSON.stringify(secret));
  assert.deepEqual(decryptJson(ciphertext), secret);
});

test('produces a different ciphertext for the same input each time', () => {
  const value = { token: 'abc' };
  assert.notEqual(encryptJson(value), encryptJson(value));
});

test('fails to decrypt tampered ciphertext', () => {
  const ciphertext = encryptJson({ a: 1 });
  const tampered = `${ciphertext.slice(0, -4)}AAAA`;
  assert.throws(() => decryptJson(tampered));
});
