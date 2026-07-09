import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { all, dbMode, exec, now, run } from './db.js';

// SQLite has no `ADD COLUMN IF NOT EXISTS`, so guard each add with the table's
// current columns. This keeps the migration idempotent whether it runs against
// a fresh database (columns already present from the baseline schema) or an
// older one created before these columns existed.
async function addSqliteColumn(table, column, definition) {
  const columns = await all(`PRAGMA table_info(${table})`, []);
  if (columns.some((c) => c.name === column)) return;
  await exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..', '..');

function readSql(...segments) {
  return fs.readFileSync(path.join(...segments), 'utf8');
}

// Ordered list of migrations. Each migration provides engine-specific SQL.
// 001 is the baseline schema, so a brand-new database can be built from the
// runner alone. Every migration must be idempotent (IF NOT EXISTS / IF EXISTS)
// so it is safe to re-run against a database that is already up to date.
function migrations() {
  return [
    {
      version: '001_baseline',
      sqlite: () => readSql(__dirname, 'schema.sql'),
      postgres: () => readSql(repoRoot, 'docs', 'supabase-schema.sql'),
    },
    {
      version: '002_auth_recovery_and_usage',
      sqlite: async () => {
        // Bring existing databases up to the current users/tenants shape. On a
        // fresh database these columns already exist, so the guard makes this a
        // no-op there.
        await addSqliteColumn('users', 'email_verified', 'INTEGER NOT NULL DEFAULT 0');
        await addSqliteColumn('users', 'email_verified_at', 'TEXT');
        await addSqliteColumn('tenants', 'ai_monthly_limit', 'INTEGER');
        return `
        CREATE TABLE IF NOT EXISTS user_tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          purpose TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL,
          used_at TEXT,
          created_at TEXT NOT NULL,
          CHECK (purpose IN ('PASSWORD_RESET', 'EMAIL_VERIFY')),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_user_tokens_user ON user_tokens(user_id, purpose);

        CREATE TABLE IF NOT EXISTS ai_usage (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tenant_id INTEGER NOT NULL,
          period_month TEXT NOT NULL,
          calls INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_usage_period ON ai_usage(tenant_id, period_month);
        `;
      },
      postgres: () => `
        ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ai_monthly_limit INTEGER;

        CREATE TABLE IF NOT EXISTS user_tokens (
          id BIGSERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          purpose VARCHAR(40) NOT NULL,
          token_hash VARCHAR(255) NOT NULL UNIQUE,
          expires_at TIMESTAMPTZ NOT NULL,
          used_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT chk_user_token_purpose CHECK (purpose IN ('PASSWORD_RESET', 'EMAIL_VERIFY'))
        );
        CREATE INDEX IF NOT EXISTS idx_user_tokens_user ON user_tokens(user_id, purpose);

        CREATE TABLE IF NOT EXISTS ai_usage (
          id BIGSERIAL PRIMARY KEY,
          tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          period_month VARCHAR(7) NOT NULL,
          calls INTEGER NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_usage_period ON ai_usage(tenant_id, period_month);
      `,
    },
  ];
}

async function ensureMigrationsTable() {
  if (dbMode === 'postgres') {
    await exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(120) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  } else {
    await exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);
  }
}

export async function runMigrations({ log = false } = {}) {
  await ensureMigrationsTable();
  const applied = new Set(
    (await all('SELECT version FROM schema_migrations', [])).map((row) => row.version),
  );

  const pending = migrations().filter((migration) => !applied.has(migration.version));
  for (const migration of pending) {
    // A migration step may run imperative work (e.g. guarded SQLite column
    // adds) and/or return a SQL string to execute.
    const sql = await migration[dbMode]();
    if (sql && sql.trim()) await exec(sql);
    await run('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', [migration.version, now()]);
    if (log) console.log(`Applied migration ${migration.version} (${dbMode}).`);
  }

  if (log && pending.length === 0) console.log('Database is up to date; no migrations to apply.');
  return pending.map((migration) => migration.version);
}
