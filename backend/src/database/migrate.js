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
    {
      version: '003_knowledge_base_and_retrieval',
      sqlite: () => `
        CREATE TABLE IF NOT EXISTS kb_articles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tenant_id INTEGER NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          category TEXT,
          status TEXT NOT NULL DEFAULT 'PUBLISHED',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          CHECK (status IN ('PUBLISHED', 'DRAFT')),
          FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_kb_articles_tenant ON kb_articles(tenant_id, status);
      `,
      postgres: () => `
        ALTER TABLE tickets ADD COLUMN IF NOT EXISTS embedding vector(1536);
        CREATE INDEX IF NOT EXISTS idx_tickets_embedding ON tickets USING ivfflat (embedding vector_cosine_ops);

        CREATE TABLE IF NOT EXISTS kb_articles (
          id BIGSERIAL PRIMARY KEY,
          tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          title VARCHAR(200) NOT NULL,
          content TEXT NOT NULL,
          category VARCHAR(60),
          status VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED',
          embedding vector(1536),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT chk_kb_status CHECK (status IN ('PUBLISHED', 'DRAFT'))
        );
        CREATE INDEX IF NOT EXISTS idx_kb_articles_tenant ON kb_articles(tenant_id, status);
        CREATE INDEX IF NOT EXISTS idx_kb_articles_embedding ON kb_articles USING ivfflat (embedding vector_cosine_ops);
      `,
    },
    {
      version: '004_ticket_language',
      sqlite: async () => {
        await addSqliteColumn('tickets', 'language', "TEXT NOT NULL DEFAULT 'English'");
      },
      postgres: () => `
        ALTER TABLE tickets ADD COLUMN IF NOT EXISTS language VARCHAR(40) NOT NULL DEFAULT 'English';
      `,
    },
    {
      version: '005_conversation_threads',
      sqlite: async () => {
        await addSqliteColumn('tickets', 'assigned_user_id', 'INTEGER REFERENCES users(id)');
        return `
        CREATE TABLE IF NOT EXISTS ticket_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tenant_id INTEGER NOT NULL,
          ticket_id INTEGER NOT NULL,
          author_type TEXT NOT NULL,
          author_user_id INTEGER,
          body TEXT NOT NULL,
          is_internal INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          CHECK (author_type IN ('CUSTOMER', 'AGENT', 'SYSTEM')),
          FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
          FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
          FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(tenant_id, ticket_id, created_at);
        `;
      },
      postgres: () => `
        ALTER TABLE tickets ADD COLUMN IF NOT EXISTS assigned_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL;

        CREATE TABLE IF NOT EXISTS ticket_messages (
          id BIGSERIAL PRIMARY KEY,
          tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          ticket_id BIGINT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
          author_type VARCHAR(20) NOT NULL,
          author_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
          body TEXT NOT NULL,
          is_internal BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT chk_ticket_message_author CHECK (author_type IN ('CUSTOMER', 'AGENT', 'SYSTEM'))
        );
        CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(tenant_id, ticket_id, created_at);
      `,
    },
    {
      version: '006_automation_rules',
      sqlite: () => `
        CREATE TABLE IF NOT EXISTS automation_rules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tenant_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          trigger_event TEXT NOT NULL,
          condition_field TEXT,
          condition_op TEXT,
          condition_value TEXT,
          action_type TEXT NOT NULL,
          action_value TEXT,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          CHECK (trigger_event IN ('TICKET_CREATED', 'CUSTOMER_MESSAGE')),
          CHECK (action_type IN ('SET_PRIORITY', 'SET_STATUS', 'ADD_NOTE', 'ASSIGN_USER')),
          FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_automation_rules_tenant ON automation_rules(tenant_id, trigger_event, is_active);
      `,
      postgres: () => `
        CREATE TABLE IF NOT EXISTS automation_rules (
          id BIGSERIAL PRIMARY KEY,
          tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          name VARCHAR(150) NOT NULL,
          trigger_event VARCHAR(40) NOT NULL,
          condition_field VARCHAR(40),
          condition_op VARCHAR(20),
          condition_value VARCHAR(200),
          action_type VARCHAR(40) NOT NULL,
          action_value VARCHAR(200),
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT chk_rule_trigger CHECK (trigger_event IN ('TICKET_CREATED', 'CUSTOMER_MESSAGE')),
          CONSTRAINT chk_rule_action CHECK (action_type IN ('SET_PRIORITY', 'SET_STATUS', 'ADD_NOTE', 'ASSIGN_USER'))
        );
        CREATE INDEX IF NOT EXISTS idx_automation_rules_tenant ON automation_rules(tenant_id, trigger_event, is_active);
      `,
    },
    {
      version: '007_deflection_widget',
      sqlite: async () => {
        await addSqliteColumn('tenants', 'public_key', 'TEXT');
        return `
        CREATE TABLE IF NOT EXISTS deflection_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tenant_id INTEGER NOT NULL,
          question TEXT NOT NULL,
          deflected INTEGER NOT NULL DEFAULT 1,
          ticket_id INTEGER,
          created_at TEXT NOT NULL,
          FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_deflection_events_tenant ON deflection_events(tenant_id, created_at);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_public_key ON tenants(public_key);
        `;
      },
      postgres: () => `
        ALTER TABLE tenants ADD COLUMN IF NOT EXISTS public_key VARCHAR(64) UNIQUE;

        CREATE TABLE IF NOT EXISTS deflection_events (
          id BIGSERIAL PRIMARY KEY,
          tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          question TEXT NOT NULL,
          deflected BOOLEAN NOT NULL DEFAULT TRUE,
          ticket_id BIGINT REFERENCES tickets(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_deflection_events_tenant ON deflection_events(tenant_id, created_at);
      `,
    },
    {
      version: '008_salesforce_account',
      sqlite: async () => {
        await addSqliteColumn('customers', 'salesforce_account_id', 'TEXT');
      },
      postgres: () => `
        ALTER TABLE customers ADD COLUMN IF NOT EXISTS salesforce_account_id VARCHAR(255);
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
