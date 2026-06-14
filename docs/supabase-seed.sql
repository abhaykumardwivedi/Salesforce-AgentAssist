INSERT INTO customers (id, full_name, email, phone, company_name, segment, salesforce_contact_id, created_at, updated_at)
VALUES
  (1, 'Rahul Sharma', 'rahul.sharma@example.com', '+91-98765-10001', 'Nimbus Retail', 'HIGH_VALUE', NULL, NOW(), NOW()),
  (2, 'Priya Menon', 'priya.menon@example.com', '+91-98765-10002', 'CloudCart India', 'PREMIUM', NULL, NOW(), NOW()),
  (3, 'Aisha Khan', 'aisha.khan@example.com', '+91-98765-10003', 'GreenLine Logistics', 'AT_RISK', NULL, NOW(), NOW()),
  (4, 'Vikram Patel', 'vikram.patel@example.com', '+91-98765-10004', 'Patel Electronics', 'NORMAL', NULL, NOW(), NOW()),
  (5, 'Neha Gupta', 'neha.gupta@example.com', '+91-98765-10005', 'BrightDesk Services', 'PREMIUM', NULL, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO orders (customer_id, order_number, amount, status, order_date)
VALUES
  (1, 'ORD-10001', 18999, 'PAID', '2026-01-12'),
  (1, 'ORD-10002', 24500, 'PAID', '2026-02-18'),
  (1, 'ORD-10003', 8999, 'PAID', '2026-04-05'),
  (2, 'ORD-10004', 15999, 'PAID', '2026-02-02'),
  (2, 'ORD-10005', 4999, 'PENDING', '2026-05-20'),
  (3, 'ORD-10006', 3499, 'FAILED', '2026-01-29'),
  (3, 'ORD-10007', 6999, 'PAID', '2026-03-14'),
  (4, 'ORD-10008', 1299, 'PAID', '2026-04-21'),
  (5, 'ORD-10009', 11999, 'PAID', '2026-03-08'),
  (5, 'ORD-10010', 23999, 'PAID', '2026-06-02')
ON CONFLICT (order_number) DO NOTHING;

INSERT INTO tickets (customer_id, subject, description, category, priority, sentiment, assigned_team, status, salesforce_case_id, created_at, updated_at)
VALUES
  (1, 'Payment deducted twice', 'My payment was deducted twice and I need a refund urgently.', 'REFUND', 'HIGH', 'NEGATIVE', 'Billing Support', 'OPEN', NULL, NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days'),
  (1, 'Invoice copy required', 'Please send the latest invoice copy for our finance team.', 'BILLING', 'LOW', 'NEUTRAL', 'Billing Support', 'RESOLVED', NULL, NOW() - INTERVAL '25 days', NOW() - INTERVAL '20 days'),
  (2, 'Login error after password reset', 'I cannot login after resetting my password. The app shows an error.', 'TECHNICAL', 'MEDIUM', 'NEGATIVE', 'Technical Support', 'IN_PROGRESS', NULL, NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days'),
  (2, 'Positive feedback', 'The new dashboard is great and our team loves it.', 'GENERAL', 'LOW', 'POSITIVE', 'General Support', 'CLOSED', NULL, NOW() - INTERVAL '16 days', NOW() - INTERVAL '14 days'),
  (3, 'Delivery delayed', 'Shipment is delayed and tracking has not updated for a week.', 'DELIVERY', 'MEDIUM', 'NEGATIVE', 'Logistics Support', 'OPEN', NULL, NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days'),
  (3, 'Charged but order failed', 'The order failed but my card was charged. This is very frustrating.', 'BILLING', 'HIGH', 'NEGATIVE', 'Billing Support', 'OPEN', NULL, NOW() - INTERVAL '1 days', NOW() - INTERVAL '1 days'),
  (4, 'Update account email', 'Please help me update my account email address.', 'ACCOUNT', 'MEDIUM', 'NEUTRAL', 'Account Support', 'OPEN', NULL, NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days'),
  (5, 'App crash during checkout', 'The mobile app crashes during checkout and blocks purchases.', 'TECHNICAL', 'HIGH', 'NEGATIVE', 'Technical Support', 'IN_PROGRESS', NULL, NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days');

INSERT INTO ai_insights (customer_id, ticket_id, summary, next_best_action, created_at)
VALUES
  (1, NULL, 'High-value customer with recent billing and refund concerns. Prioritize fast resolution and proactive follow-up.', 'Offer a callback from Billing Support and confirm refund status.', NOW()),
  (3, NULL, 'At-risk customer with repeated delivery and payment friction. Monitor open tickets closely.', 'Escalate open issues and confirm next delivery update.', NOW());

SELECT setval('customers_id_seq', (SELECT COALESCE(MAX(id), 1) FROM customers));
