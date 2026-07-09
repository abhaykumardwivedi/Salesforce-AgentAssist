import crypto from 'node:crypto';
import path from 'node:path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendRoot, '..');

dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(backendRoot, '.env'), override: true });

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

// Mirror the key derivation in src/utils/crypto.js so a raw passphrase and a
// 64-char hex key resolve to the same bytes the app uses.
function deriveKey(raw, label) {
  if (!raw) throw new Error(`${label} is required.`);
  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, 'hex')
    : crypto.createHash('sha256').update(raw, 'utf8').digest();
  if (key.length !== KEY_LENGTH) throw new Error(`${label} must resolve to a 32 byte key.`);
  return key;
}

function decryptWith(key, payload) {
  const buffer = Buffer.from(payload, 'base64');
  const iv = buffer.subarray(0, IV_LENGTH);
  const tag = buffer.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buffer.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

function encryptWith(key, plaintext) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

// APP_ENCRYPTION_KEY is the new (current) key the app runs with.
// APP_ENCRYPTION_KEY_OLD is the previous key the secrets were encrypted under.
const oldKey = deriveKey(process.env.APP_ENCRYPTION_KEY_OLD, 'APP_ENCRYPTION_KEY_OLD');
const newKey = deriveKey(process.env.APP_ENCRYPTION_KEY, 'APP_ENCRYPTION_KEY');

const { all, run } = await import('../src/database/db.js');

let rotated = 0;
let alreadyCurrent = 0;
let failed = 0;

try {
  const rows = await all(
    'SELECT id, config_encrypted AS "config" FROM tenant_integrations WHERE config_encrypted IS NOT NULL',
    [],
  );

  for (const row of rows) {
    let plaintext;
    try {
      plaintext = decryptWith(oldKey, row.config);
    } catch {
      // The row may already be encrypted with the new key from a previous
      // (interrupted) run. If so, leave it untouched so the script is re-runnable.
      try {
        decryptWith(newKey, row.config);
        alreadyCurrent += 1;
        continue;
      } catch {
        failed += 1;
        console.error(`Integration ${row.id}: could not decrypt with old or new key; skipped.`);
        continue;
      }
    }

    const reEncrypted = encryptWith(newKey, plaintext);
    await run('UPDATE tenant_integrations SET config_encrypted = ? WHERE id = ?', [reEncrypted, row.id]);
    rotated += 1;
  }

  console.log(`Key rotation complete: ${rotated} rotated, ${alreadyCurrent} already current, ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
} catch (error) {
  console.error('Key rotation failed:', error.message);
  process.exit(1);
}
