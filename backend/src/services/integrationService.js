import { all, get, now, run } from '../database/db.js';
import { decryptJson, encryptJson, hasEncryptionKey } from '../utils/crypto.js';
import { badRequest, notFound } from '../utils/httpError.js';

const PROVIDERS = ['OPENAI', 'SALESFORCE'];

export async function getIntegrationConfig(tenantId, provider) {
  const row = await get(
    'SELECT config_encrypted AS "config", status FROM tenant_integrations WHERE tenant_id = ? AND provider = ?',
    [tenantId, provider],
  );
  if (!row || !row.config) return null;
  try {
    return decryptJson(row.config);
  } catch (error) {
    console.error(`Failed to decrypt ${provider} integration for tenant ${tenantId}`, error.message);
    return null;
  }
}

export async function getIntegrationStatus(tenantId, provider) {
  const row = await get(
    'SELECT status, updated_at AS "updatedAt" FROM tenant_integrations WHERE tenant_id = ? AND provider = ?',
    [tenantId, provider],
  );
  return row || { status: 'DISCONNECTED', updatedAt: null };
}

export async function listIntegrations(tenantId) {
  const rows = await all(
    'SELECT provider, status, updated_at AS "updatedAt" FROM tenant_integrations WHERE tenant_id = ?',
    [tenantId],
  );
  const byProvider = new Map(rows.map((row) => [row.provider, row]));
  return PROVIDERS.map((provider) => ({
    provider,
    status: byProvider.get(provider)?.status || 'DISCONNECTED',
    updatedAt: byProvider.get(provider)?.updatedAt || null,
  }));
}

export async function saveIntegration(tenantId, provider, config, status = 'CONNECTED') {
  if (!PROVIDERS.includes(provider)) throw badRequest('Unknown integration provider.');
  if (!hasEncryptionKey()) throw badRequest('APP_ENCRYPTION_KEY must be set before saving credentials.');
  const encrypted = encryptJson(config);
  const existing = await get(
    'SELECT id FROM tenant_integrations WHERE tenant_id = ? AND provider = ?',
    [tenantId, provider],
  );
  if (existing) {
    await run(
      'UPDATE tenant_integrations SET config_encrypted = ?, status = ?, updated_at = ? WHERE id = ?',
      [encrypted, status, now(), existing.id],
    );
  } else {
    await run(
      'INSERT INTO tenant_integrations (tenant_id, provider, config_encrypted, status, updated_at) VALUES (?, ?, ?, ?, ?)',
      [tenantId, provider, encrypted, status, now()],
    );
  }
}

export async function mergeIntegration(tenantId, provider, partial, status) {
  const current = (await getIntegrationConfig(tenantId, provider)) || {};
  const next = { ...current, ...partial };
  await saveIntegration(tenantId, provider, next, status || 'CONNECTED');
  return next;
}

export async function setIntegrationStatus(tenantId, provider, status) {
  const existing = await get(
    'SELECT id FROM tenant_integrations WHERE tenant_id = ? AND provider = ?',
    [tenantId, provider],
  );
  if (!existing) return;
  await run('UPDATE tenant_integrations SET status = ?, updated_at = ? WHERE id = ?', [status, now(), existing.id]);
}

export async function disconnectIntegration(tenantId, provider) {
  if (!PROVIDERS.includes(provider)) throw notFound('Unknown integration provider.');
  await run(
    'UPDATE tenant_integrations SET config_encrypted = NULL, status = ?, updated_at = ? WHERE tenant_id = ? AND provider = ?',
    ['DISCONNECTED', now(), tenantId, provider],
  );
}
