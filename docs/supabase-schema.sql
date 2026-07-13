CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS tenants (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  slug VARCHAR(80) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  ai_monthly_limit INTEGER,
  public_key VARCHAR(64) UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_tenant_status CHECK (status IN ('ACTIVE', 'SUSPENDED'))
);

CREATE TABLE IF NOT EXISTS deflection_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  deflected BOOLEAN NOT NULL DEFAULT TRUE,
  ticket_id BIGINT REFERENCES tickets(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deflection_events_tenant ON deflection_events(tenant_id, created_at);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'AGENT',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  email_verified_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_user_role CHECK (role IN ('OWNER', 'ADMIN', 'AGENT')),
  CONSTRAINT chk_user_status CHECK (status IN ('ACTIVE', 'DISABLED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_tenant_email ON users(tenant_id, lower(email));

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);

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

CREATE TABLE IF NOT EXISTS tenant_integrations (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider VARCHAR(40) NOT NULL,
  config_encrypted TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'DISCONNECTED',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_integration_provider CHECK (provider IN ('OPENAI', 'SALESFORCE')),
  CONSTRAINT chk_integration_status CHECK (status IN ('CONNECTED', 'DISCONNECTED', 'ERROR'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_integrations_provider ON tenant_integrations(tenant_id, provider);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  entity VARCHAR(80),
  entity_id VARCHAR(80),
  metadata TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL,
  phone VARCHAR(30),
  company_name VARCHAR(150),
  segment VARCHAR(30) NOT NULL DEFAULT 'NORMAL',
  salesforce_contact_id VARCHAR(255),
  salesforce_account_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_customer_segment CHECK (segment IN ('NORMAL', 'PREMIUM', 'HIGH_VALUE', 'AT_RISK'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_tenant_email ON customers(tenant_id, lower(email));

CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  order_number VARCHAR(100) NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  status VARCHAR(40) NOT NULL,
  order_date DATE NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tenant_number ON orders(tenant_id, order_number);

CREATE TABLE IF NOT EXISTS tickets (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  subject VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(40) NOT NULL,
  priority VARCHAR(40) NOT NULL,
  sentiment VARCHAR(40) NOT NULL,
  assigned_team VARCHAR(100) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'OPEN',
  language VARCHAR(40) NOT NULL DEFAULT 'English',
  assigned_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  salesforce_case_id VARCHAR(255),
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ticket_category CHECK (category IN ('BILLING', 'TECHNICAL', 'DELIVERY', 'ACCOUNT', 'REFUND', 'GENERAL')),
  CONSTRAINT chk_ticket_priority CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  CONSTRAINT chk_ticket_sentiment CHECK (sentiment IN ('POSITIVE', 'NEUTRAL', 'NEGATIVE')),
  CONSTRAINT chk_ticket_status CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'))
);

CREATE TABLE IF NOT EXISTS api_logs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT REFERENCES tenants(id) ON DELETE CASCADE,
  provider VARCHAR(100) NOT NULL,
  endpoint VARCHAR(255) NOT NULL,
  method VARCHAR(10) NOT NULL,
  status_code INTEGER NOT NULL,
  response_time_ms BIGINT NOT NULL,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_insights (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  ticket_id BIGINT REFERENCES tickets(id) ON DELETE SET NULL,
  summary TEXT NOT NULL,
  next_best_action TEXT,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_tickets_customer_id ON tickets(customer_id);
CREATE INDEX IF NOT EXISTS idx_tickets_tenant_status ON tickets(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_api_logs_tenant_created ON api_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_insights_customer_id ON ai_insights(customer_id);
CREATE INDEX IF NOT EXISTS idx_ai_insights_embedding ON ai_insights USING ivfflat (embedding vector_cosine_ops);
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
