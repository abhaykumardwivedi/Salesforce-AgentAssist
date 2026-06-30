INSERT INTO tenants (id, name, slug, status, created_at, updated_at)
VALUES (1, 'Demo Workspace', 'demo', 'ACTIVE', datetime('now'), datetime('now'));

INSERT INTO customers (id, tenant_id, full_name, email, phone, company_name, segment, salesforce_contact_id, created_at, updated_at)
VALUES
  (1, 1, 'Rahul Sharma', 'rahul.sharma@example.com', '+91-98765-10001', 'Nimbus Retail', 'HIGH_VALUE', NULL, datetime('now'), datetime('now')),
  (2, 1, 'Priya Menon', 'priya.menon@example.com', '+91-98765-10002', 'CloudCart India', 'PREMIUM', NULL, datetime('now'), datetime('now')),
  (3, 1, 'Aisha Khan', 'aisha.khan@example.com', '+91-98765-10003', 'GreenLine Logistics', 'AT_RISK', NULL, datetime('now'), datetime('now')),
  (4, 1, 'Vikram Patel', 'vikram.patel@example.com', '+91-98765-10004', 'Patel Electronics', 'NORMAL', NULL, datetime('now'), datetime('now')),
  (5, 1, 'Neha Gupta', 'neha.gupta@example.com', '+91-98765-10005', 'BrightDesk Services', 'PREMIUM', NULL, datetime('now'), datetime('now'));

INSERT INTO orders (tenant_id, customer_id, order_number, amount, status, order_date)
VALUES
  (1, 1, 'ORD-10001', 18999, 'PAID', '2026-01-12'),
  (1, 1, 'ORD-10002', 24500, 'PAID', '2026-02-18'),
  (1, 1, 'ORD-10003', 8999, 'PAID', '2026-04-05'),
  (1, 2, 'ORD-10004', 15999, 'PAID', '2026-02-02'),
  (1, 2, 'ORD-10005', 4999, 'PENDING', '2026-05-20'),
  (1, 3, 'ORD-10006', 3499, 'FAILED', '2026-01-29'),
  (1, 3, 'ORD-10007', 6999, 'PAID', '2026-03-14'),
  (1, 4, 'ORD-10008', 1299, 'PAID', '2026-04-21'),
  (1, 5, 'ORD-10009', 11999, 'PAID', '2026-03-08'),
  (1, 5, 'ORD-10010', 23999, 'PAID', '2026-06-02');

INSERT INTO tickets (tenant_id, customer_id, subject, description, category, priority, sentiment, assigned_team, status, salesforce_case_id, created_at, updated_at)
VALUES
  (1, 1, 'Payment deducted twice', 'My payment was deducted twice and I need a refund urgently.', 'REFUND', 'HIGH', 'NEGATIVE', 'Billing Support', 'OPEN', NULL, datetime('now', '-7 days'), datetime('now', '-7 days')),
  (1, 1, 'Invoice copy required', 'Please send the latest invoice copy for our finance team.', 'BILLING', 'LOW', 'NEUTRAL', 'Billing Support', 'RESOLVED', NULL, datetime('now', '-25 days'), datetime('now', '-20 days')),
  (1, 2, 'Login error after password reset', 'I cannot login after resetting my password. The app shows an error.', 'TECHNICAL', 'MEDIUM', 'NEGATIVE', 'Technical Support', 'IN_PROGRESS', NULL, datetime('now', '-3 days'), datetime('now', '-2 days')),
  (1, 2, 'Positive feedback', 'The new dashboard is great and our team loves it.', 'GENERAL', 'LOW', 'POSITIVE', 'General Support', 'CLOSED', NULL, datetime('now', '-16 days'), datetime('now', '-14 days')),
  (1, 3, 'Delivery delayed', 'Shipment is delayed and tracking has not updated for a week.', 'DELIVERY', 'MEDIUM', 'NEGATIVE', 'Logistics Support', 'OPEN', NULL, datetime('now', '-5 days'), datetime('now', '-5 days')),
  (1, 3, 'Charged but order failed', 'The order failed but my card was charged. This is very frustrating.', 'BILLING', 'HIGH', 'NEGATIVE', 'Billing Support', 'OPEN', NULL, datetime('now', '-1 days'), datetime('now', '-1 days')),
  (1, 4, 'Update account email', 'Please help me update my account email address.', 'ACCOUNT', 'MEDIUM', 'NEUTRAL', 'Account Support', 'OPEN', NULL, datetime('now', '-8 days'), datetime('now', '-8 days')),
  (1, 5, 'App crash during checkout', 'The mobile app crashes during checkout and blocks purchases.', 'TECHNICAL', 'HIGH', 'NEGATIVE', 'Technical Support', 'IN_PROGRESS', NULL, datetime('now', '-4 days'), datetime('now', '-4 days'));

INSERT INTO ai_insights (tenant_id, customer_id, ticket_id, summary, next_best_action, created_at)
VALUES
  (1, 1, NULL, 'High-value customer with recent billing and refund concerns. Prioritize fast resolution and proactive follow-up.', 'Offer a callback from Billing Support and confirm refund status.', datetime('now')),
  (1, 3, NULL, 'At-risk customer with repeated delivery and payment friction. Monitor open tickets closely.', 'Escalate open issues and confirm next delivery update.', datetime('now'));
