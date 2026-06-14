import { all, now, run } from '../database/db.js';

export async function logApiCall(entry) {
  try {
    const result = await run(
      `INSERT INTO api_logs
       (provider, endpoint, method, status_code, response_time_ms, success, error_message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        trim(entry.provider, 100),
        trim(entry.endpoint, 255),
        trim(entry.method || 'GET', 10),
        entry.statusCode || 200,
        entry.responseTimeMs || 0,
        entry.success ? 1 : 0,
        trim(maskSecrets(entry.errorMessage || null), 500),
        now(),
      ],
    );
    return result.lastInsertRowid;
  } catch (error) {
    console.error('Failed to write API log', error);
    return null;
  }
}

export async function getLogs() {
  const logs = await all(
    `SELECT
       id,
       provider,
       endpoint,
       method,
       status_code AS "statusCode",
       response_time_ms AS "responseTimeMs",
       success,
       error_message AS "errorMessage",
       created_at AS "timestamp"
     FROM api_logs
     ORDER BY created_at DESC`,
  );
  return logs.map((log) => ({ ...log, success: Boolean(log.success) }));
}

function trim(value, max) {
  if (value === null || value === undefined) return null;
  const text = String(value);
  return text.length > max ? text.slice(0, max) : text;
}

function maskSecrets(value) {
  if (!value) return value;
  return String(value)
    .replace(/(access_token|client_secret|password|security_token)=([^&\s]+)/gi, '$1=***')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1***');
}
