import { all, get, now, run } from '../database/db.js';
import { logApiCall } from './logService.js';

export async function classifyTicket(description = '') {
  const started = Date.now();
  try {
    const result = classify(description);
    await logApiCall({
      provider: 'AI-MOCK',
      endpoint: '/classify-ticket',
      method: 'POST',
      statusCode: 200,
      responseTimeMs: Date.now() - started,
      success: true,
    });
    return result;
  } catch (error) {
    await logApiCall({
      provider: 'AI-MOCK',
      endpoint: '/classify-ticket',
      method: 'POST',
      statusCode: 500,
      responseTimeMs: Date.now() - started,
      success: false,
      errorMessage: error.message,
    });
    return defaultClassification();
  }
}

export async function getOrCreateCustomerSummary(customer) {
  const existing = await get(
    `SELECT summary FROM ai_insights
     WHERE customer_id = ? AND ticket_id IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [customer.id],
  );
  if (existing) return existing.summary;

  const started = Date.now();
  const orders = await all('SELECT amount FROM orders WHERE customer_id = ?', [customer.id]);
  const tickets = await all('SELECT status FROM tickets WHERE customer_id = ?', [customer.id]);
  const totalSpend = orders.reduce((sum, order) => sum + Number(order.amount), 0);
  const openTickets = tickets.filter((ticket) => ['OPEN', 'IN_PROGRESS'].includes(ticket.status)).length;
  const summary = makeSummary(customer, totalSpend, openTickets, tickets.length);

  await run(
    `INSERT INTO ai_insights (customer_id, ticket_id, summary, next_best_action, created_at)
     VALUES (?, NULL, ?, ?, ?)`,
    [
      customer.id,
      summary,
      openTickets ? 'Review unresolved tickets and confirm next action with the customer.' : 'Maintain standard service cadence.',
      now(),
    ],
  );

  await logApiCall({
    provider: 'AI-MOCK',
    endpoint: `/customer-summary/${customer.id}`,
    method: 'POST',
    statusCode: 200,
    responseTimeMs: Date.now() - started,
    success: true,
  });

  return summary;
}

function classify(description) {
  const text = description.toLowerCase();

  if (containsAny(text, ['fraud', 'security', 'breach', 'legal', 'lawsuit', 'production down', 'charged multiple'])) {
    return result('BILLING', 'CRITICAL', 'NEGATIVE', 'Priority Escalation');
  }
  if (containsAny(text, ['refund', 'return money', 'money back', 'deducted', 'charged'])) {
    return result('REFUND', 'HIGH', 'NEGATIVE', 'Billing Support');
  }
  if (containsAny(text, ['payment', 'invoice', 'billing', 'card', 'upi', 'amount'])) {
    return result('BILLING', 'HIGH', sentiment(text), 'Billing Support');
  }
  if (containsAny(text, ['login', 'password', 'error', 'bug', 'crash', 'unable', 'not working', 'app'])) {
    const priority = containsAny(text, ['crash', 'blocked', 'down', 'urgent']) ? 'HIGH' : 'MEDIUM';
    return result('TECHNICAL', priority, sentiment(text), 'Technical Support');
  }
  if (containsAny(text, ['delivery', 'shipment', 'courier', 'tracking', 'delayed', 'late'])) {
    return result('DELIVERY', 'MEDIUM', sentiment(text), 'Logistics Support');
  }
  if (containsAny(text, ['account', 'profile', 'email address', 'change email', 'update email'])) {
    return result('ACCOUNT', 'MEDIUM', sentiment(text), 'Account Support');
  }
  if (containsAny(text, ['great', 'thanks', 'thank you', 'love', 'excellent', 'happy'])) {
    return result('GENERAL', 'LOW', 'POSITIVE', 'General Support');
  }
  return defaultClassification();
}

function sentiment(text) {
  if (containsAny(text, ['angry', 'frustrated', 'bad', 'terrible', 'urgent', 'failed', 'cannot', 'not working', 'deducted', 'delayed'])) {
    return 'NEGATIVE';
  }
  if (containsAny(text, ['thanks', 'thank you', 'great', 'excellent', 'happy', 'love'])) {
    return 'POSITIVE';
  }
  return 'NEUTRAL';
}

function makeSummary(customer, totalSpend, openTickets, totalTickets) {
  if (customer.segment === 'HIGH_VALUE' || totalSpend >= 40000) {
    return `High-value customer with total spend of ${totalSpend}. Prioritize fast resolution and proactive follow-up.`;
  }
  if (customer.segment === 'AT_RISK' || openTickets > 1) {
    return `At-risk customer with ${openTickets} open ticket(s) across ${totalTickets} total ticket(s). Escalate unresolved issues.`;
  }
  if (openTickets === 0) {
    return `Stable customer with no open tickets and total spend of ${totalSpend}. Maintain standard service cadence.`;
  }
  return `Customer has ${openTickets} open ticket(s) and total spend of ${totalSpend}. Monitor support progress.`;
}

function result(category, priority, sentimentValue, assignedTeam) {
  return { category, priority, sentiment: sentimentValue, assignedTeam };
}

function defaultClassification() {
  return result('GENERAL', 'MEDIUM', 'NEUTRAL', 'General Support');
}

function containsAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}
