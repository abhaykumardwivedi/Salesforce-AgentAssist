CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  phone VARCHAR(30),
  company_name VARCHAR(150),
  segment VARCHAR(30) NOT NULL DEFAULT 'NORMAL',
  salesforce_contact_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_customer_segment CHECK (segment IN ('NORMAL', 'PREMIUM', 'HIGH_VALUE', 'AT_RISK'))
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  order_number VARCHAR(100) NOT NULL UNIQUE,
  amount NUMERIC(12, 2) NOT NULL,
  status VARCHAR(40) NOT NULL,
  order_date DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
  id BIGSERIAL PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  subject VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  category VARCHAR(40) NOT NULL,
  priority VARCHAR(40) NOT NULL,
  sentiment VARCHAR(40) NOT NULL,
  assigned_team VARCHAR(100) NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'OPEN',
  salesforce_case_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_ticket_category CHECK (category IN ('BILLING', 'TECHNICAL', 'DELIVERY', 'ACCOUNT', 'REFUND', 'GENERAL')),
  CONSTRAINT chk_ticket_priority CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  CONSTRAINT chk_ticket_sentiment CHECK (sentiment IN ('POSITIVE', 'NEUTRAL', 'NEGATIVE')),
  CONSTRAINT chk_ticket_status CHECK (status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'))
);

CREATE TABLE IF NOT EXISTS api_logs (
  id BIGSERIAL PRIMARY KEY,
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
  customer_id BIGINT NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  ticket_id BIGINT REFERENCES tickets(id) ON DELETE SET NULL,
  summary TEXT NOT NULL,
  next_best_action TEXT,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_tickets_customer_id ON tickets(customer_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_api_logs_created_at ON api_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_insights_customer_id ON ai_insights(customer_id);
CREATE INDEX IF NOT EXISTS idx_ai_insights_embedding ON ai_insights USING ivfflat (embedding vector_cosine_ops);
