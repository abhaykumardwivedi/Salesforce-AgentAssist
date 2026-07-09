import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
});

try {
  const { runMigrations } = await import('../src/database/migrate.js');
  await runMigrations({ log: true });
  const seed = fs.readFileSync(path.join(repoRoot, 'docs', 'supabase-seed.sql'), 'utf8');
  await pool.query(seed);
  const { ensureSeedData } = await import('../src/database/bootstrap.js');
  await ensureSeedData();
  console.log('PostgreSQL schema and seed data applied.');
} finally {
  await pool.end();
}
