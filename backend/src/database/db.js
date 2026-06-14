import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..', '..');
const dataDir = path.join(backendRoot, 'data');
const defaultDbPath = path.join(dataDir, 'agentassist.sqlite');

export const dbMode = process.env.DATABASE_URL ? 'postgres' : 'sqlite';

let sqlite;
let pool;

if (dbMode === 'postgres') {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
} else {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = process.env.DB_PATH || defaultDbPath;
  sqlite = new DatabaseSync(dbPath);
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec('PRAGMA busy_timeout = 5000');
  sqlite.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

  const count = sqlite.prepare('SELECT COUNT(*) AS count FROM customers').get().count;
  if (count === 0) {
    sqlite.exec(fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8'));
  }
}

export async function all(sql, params = []) {
  if (dbMode === 'postgres') {
    const result = await pool.query(toPostgresSql(sql), params);
    return result.rows;
  }
  return sqlite.prepare(sql).all(...params);
}

export async function get(sql, params = []) {
  if (dbMode === 'postgres') {
    const result = await pool.query(toPostgresSql(sql), params);
    return result.rows[0];
  }
  return sqlite.prepare(sql).get(...params);
}

export async function run(sql, params = []) {
  if (dbMode === 'postgres') {
    const finalSql = shouldReturnId(sql) ? `${toPostgresSql(sql)} RETURNING id` : toPostgresSql(sql);
    const result = await pool.query(finalSql, params);
    return {
      lastInsertRowid: result.rows[0]?.id,
      changes: result.rowCount,
    };
  }
  return sqlite.prepare(sql).run(...params);
}

export async function healthCheck() {
  if (dbMode === 'postgres') {
    await pool.query('SELECT 1');
    return { mode: 'postgres', ok: true };
  }
  sqlite.prepare('SELECT 1').get();
  return { mode: 'sqlite', ok: true };
}

export function now() {
  return new Date().toISOString();
}

export const enums = {
  customerSegments: ['NORMAL', 'PREMIUM', 'HIGH_VALUE', 'AT_RISK'],
  ticketCategories: ['BILLING', 'TECHNICAL', 'DELIVERY', 'ACCOUNT', 'REFUND', 'GENERAL'],
  ticketPriorities: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
  ticketSentiments: ['POSITIVE', 'NEUTRAL', 'NEGATIVE'],
  ticketStatuses: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'],
};

function toPostgresSql(sql) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

function shouldReturnId(sql) {
  return /^\s*INSERT\s+/i.test(sql) && !/\bRETURNING\b/i.test(sql);
}
