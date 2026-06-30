import { all, dbMode, get, now, run } from '../database/db.js';
import { logApiCall } from './logService.js';
import { getIntegrationConfig } from './integrationService.js';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

const CATEGORIES = ['BILLING', 'TECHNICAL', 'DELIVERY', 'ACCOUNT', 'REFUND', 'GENERAL'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const SENTIMENTS = ['POSITIVE', 'NEUTRAL', 'NEGATIVE'];

async function resolveOpenAi(tenantId) {
  const tenantConfig = await getIntegrationConfig(tenantId, 'OPENAI');
  if (tenantConfig?.apiKey) {
    return {
      enabled: true,
      source: 'tenant',
      apiKey: tenantConfig.apiKey,
      model: tenantConfig.model || DEFAULT_OPENAI_MODEL,
      embeddingModel: tenantConfig.embeddingModel || DEFAULT_EMBEDDING_MODEL,
    };
  }
  if (String(process.env.AI_PROVIDER || '').toLowerCase() === 'openai' && process.env.OPENAI_API_KEY) {
    return {
      enabled: true,
      source: 'env',
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
      embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL,
    };
  }
  return { enabled: false, source: 'local', model: 'local-rules', embeddingModel: null };
}

export async function getAiStatus(tenantId) {
  const openai = await resolveOpenAi(tenantId);
  return {
    provider: openai.enabled ? 'OpenAI' : 'Local Rules',
    mode: openai.enabled ? 'REAL' : 'LOCAL_FALLBACK',
    configured: openai.enabled,
    source: openai.source,
    model: openai.enabled ? openai.model : 'local-rules',
    embeddingsEnabled: openai.enabled && dbMode === 'postgres',
    embeddingModel: openai.enabled && dbMode === 'postgres' ? openai.embeddingModel : null,
  };
}

export async function classifyTicket(tenantId, description = '') {
  const openai = await resolveOpenAi(tenantId);
  const started = Date.now();

  if (openai.enabled) {
    try {
      const result = normalizeClassification(await classifyWithOpenAi(openai, description));
      await logOpenAiCall(tenantId, '/v1/responses:classify-ticket', started, true, 200);
      return result;
    } catch (error) {
      await logOpenAiCall(tenantId, '/v1/responses:classify-ticket', started, false, error.statusCode || 502, error.message);
      return classifyLocally(description);
    }
  }

  const result = classifyLocally(description);
  await logApiCall({
    tenantId,
    provider: 'AI-Local',
    endpoint: '/classify-ticket',
    method: 'POST',
    statusCode: 200,
    responseTimeMs: Date.now() - started,
    success: true,
  });
  return result;
}

export async function getOrCreateCustomerSummary(customer) {
  const tenantId = customer.tenantId;
  const existing = await get(
    `SELECT summary FROM ai_insights
     WHERE tenant_id = ? AND customer_id = ? AND ticket_id IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [tenantId, customer.id],
  );
  if (existing) return existing.summary;

  const openai = await resolveOpenAi(tenantId);
  const context = await getCustomerContext(tenantId, customer.id);
  const started = Date.now();
  let insight;

  if (openai.enabled) {
    try {
      insight = normalizeInsight(await summarizeWithOpenAi(openai, customer, context));
      await logOpenAiCall(tenantId, `/v1/responses:customer-summary/${customer.id}`, started, true, 200);
    } catch (error) {
      await logOpenAiCall(tenantId, `/v1/responses:customer-summary/${customer.id}`, started, false, error.statusCode || 502, error.message);
    }
  }

  if (!insight) {
    insight = makeLocalInsight(customer, context);
    await logApiCall({
      tenantId,
      provider: 'AI-Local',
      endpoint: `/customer-summary/${customer.id}`,
      method: 'POST',
      statusCode: 200,
      responseTimeMs: Date.now() - started,
      success: true,
    });
  }

  const insert = await run(
    `INSERT INTO ai_insights (tenant_id, customer_id, ticket_id, summary, next_best_action, created_at)
     VALUES (?, ?, NULL, ?, ?, ?)`,
    [tenantId, customer.id, insight.summary, insight.nextBestAction, now()],
  );

  await storeEmbeddingIfAvailable(tenantId, openai, insert.lastInsertRowid, insight.summary);
  return insight.summary;
}

async function classifyWithOpenAi(openai, description) {
  return callOpenAiJson(openai, {
    name: 'ticket_classification',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        category: { type: 'string', enum: CATEGORIES },
        priority: { type: 'string', enum: PRIORITIES },
        sentiment: { type: 'string', enum: SENTIMENTS },
        assignedTeam: { type: 'string', minLength: 3, maxLength: 80 },
      },
      required: ['category', 'priority', 'sentiment', 'assignedTeam'],
    },
    input: [
      {
        role: 'developer',
        content: [
          'You classify customer support tickets for a Salesforce service team.',
          'Pick the most useful category, priority, sentiment, and assignment team.',
          'Use CRITICAL only for legal, fraud, security, production-down, or severe business-blocking issues.',
        ].join(' '),
      },
      {
        role: 'user',
        content: `Ticket description:\n${description}`,
      },
    ],
  });
}

async function summarizeWithOpenAi(openai, customer, context) {
  return callOpenAiJson(openai, {
    name: 'customer_support_summary',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        summary: { type: 'string', minLength: 40, maxLength: 320 },
        nextBestAction: { type: 'string', minLength: 20, maxLength: 220 },
      },
      required: ['summary', 'nextBestAction'],
    },
    input: [
      {
        role: 'developer',
        content: [
          'You write concise Customer 360 support intelligence for service agents.',
          'Focus on risk, value, open issues, and a concrete next action.',
          'Do not invent facts that are not present in the customer, order, or ticket context.',
        ].join(' '),
      },
      {
        role: 'user',
        content: buildSummaryPrompt(customer, context),
      },
    ],
  });
}

async function callOpenAiJson(openai, { name, schema, input }) {
  const data = await postOpenAi(openai, OPENAI_RESPONSES_URL, {
    model: openai.model,
    input,
    text: {
      format: {
        type: 'json_schema',
        name,
        strict: true,
        schema,
      },
    },
  });
  const outputText = extractOutputText(data);
  if (!outputText) throw new Error('OpenAI returned an empty response.');
  try {
    return JSON.parse(outputText);
  } catch (error) {
    throw new Error(`OpenAI returned invalid JSON: ${error.message}`);
  }
}

async function storeEmbeddingIfAvailable(tenantId, openai, insightId, summary) {
  if (!openai.enabled || dbMode !== 'postgres' || !insightId) return;

  const started = Date.now();
  try {
    const data = await postOpenAi(openai, OPENAI_EMBEDDINGS_URL, {
      model: openai.embeddingModel,
      input: summary,
    });
    const embedding = data.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) throw new Error('OpenAI returned no embedding vector.');
    if (embedding.length !== 1536) {
      throw new Error(`Embedding dimension ${embedding.length} does not match pgvector column dimension 1536.`);
    }
    await run('UPDATE ai_insights SET embedding = ? WHERE id = ? AND tenant_id = ?', [toVectorLiteral(embedding), Number(insightId), tenantId]);
    await logOpenAiCall(tenantId, '/v1/embeddings:customer-summary', started, true, 200);
  } catch (error) {
    await logOpenAiCall(tenantId, '/v1/embeddings:customer-summary', started, false, error.statusCode || 502, error.message);
  }
}

async function postOpenAi(openai, url, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.OPENAI_TIMEOUT_MS || 20000));
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openai.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await parseJsonResponse(response);
    if (!response.ok) {
      const error = new Error(data.error?.message || data.raw || `OpenAI request failed with status ${response.status}.`);
      error.statusCode = response.status;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function parseJsonResponse(response) {
  const raw = await response.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

function extractOutputText(data) {
  if (data.output_text) return data.output_text.trim();
  const text = data.output
    ?.flatMap((item) => item.content || [])
    .map((part) => part.text || '')
    .join('')
    .trim();
  return text || '';
}

async function getCustomerContext(tenantId, customerId) {
  const orders = await all(
    `SELECT order_number AS "orderNumber", amount, status, order_date AS "orderDate"
     FROM orders
     WHERE tenant_id = ? AND customer_id = ?
     ORDER BY order_date DESC`,
    [tenantId, customerId],
  );
  const tickets = await all(
    `SELECT subject, description, category, priority, sentiment, status, created_at AS "createdAt"
     FROM tickets
     WHERE tenant_id = ? AND customer_id = ?
     ORDER BY created_at DESC`,
    [tenantId, customerId],
  );
  const totalSpend = orders.reduce((sum, order) => sum + Number(order.amount), 0);
  const openTickets = tickets.filter((ticket) => ['OPEN', 'IN_PROGRESS'].includes(ticket.status)).length;
  return { orders, tickets, totalSpend, openTickets };
}

function buildSummaryPrompt(customer, context) {
  const recentOrders = context.orders
    .slice(0, 5)
    .map((order) => `${order.orderNumber}: ${order.status}, amount ${order.amount}, date ${order.orderDate}`)
    .join('\n') || 'No orders found.';
  const recentTickets = context.tickets
    .slice(0, 6)
    .map((ticket) => `${ticket.subject}: ${ticket.status}, ${ticket.priority}, ${ticket.sentiment}. ${ticket.description}`)
    .join('\n') || 'No tickets found.';

  return [
    `Customer: ${customer.fullName}`,
    `Email: ${customer.email}`,
    `Company: ${customer.companyName || 'Not provided'}`,
    `Segment: ${customer.segment}`,
    `Total spend: ${context.totalSpend}`,
    `Open tickets: ${context.openTickets}`,
    '',
    'Recent orders:',
    recentOrders,
    '',
    'Recent tickets:',
    recentTickets,
  ].join('\n');
}

function normalizeClassification(value = {}) {
  return {
    category: normalizeEnum(value.category, CATEGORIES, 'GENERAL'),
    priority: normalizeEnum(value.priority, PRIORITIES, 'MEDIUM'),
    sentiment: normalizeEnum(value.sentiment, SENTIMENTS, 'NEUTRAL'),
    assignedTeam: cleanText(value.assignedTeam, 'General Support', 80),
  };
}

function normalizeInsight(value = {}) {
  return {
    summary: cleanText(value.summary, 'Customer summary is unavailable. Review recent orders and tickets before outreach.', 320),
    nextBestAction: cleanText(value.nextBestAction, 'Review customer context and confirm the next support action.', 220),
  };
}

function makeLocalInsight(customer, context) {
  const { totalSpend, openTickets, tickets } = context;
  if (customer.segment === 'HIGH_VALUE' || totalSpend >= 40000) {
    return {
      summary: `High-value customer with total spend of ${totalSpend}. Prioritize fast resolution and proactive follow-up.`,
      nextBestAction: 'Assign a senior support owner and send a same-day follow-up.',
    };
  }
  if (customer.segment === 'AT_RISK' || openTickets > 1) {
    return {
      summary: `At-risk customer with ${openTickets} open ticket(s) across ${tickets.length} total ticket(s). Escalate unresolved issues.`,
      nextBestAction: 'Escalate the oldest unresolved issue and confirm a recovery plan.',
    };
  }
  if (openTickets === 0) {
    return {
      summary: `Stable customer with no open tickets and total spend of ${totalSpend}. Maintain standard service cadence.`,
      nextBestAction: 'Continue normal account monitoring and periodic service check-ins.',
    };
  }
  return {
    summary: `Customer has ${openTickets} open ticket(s) and total spend of ${totalSpend}. Monitor support progress.`,
    nextBestAction: 'Review active tickets and send an expectation-setting update.',
  };
}

function classifyLocally(description) {
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
  return result('GENERAL', 'MEDIUM', 'NEUTRAL', 'General Support');
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

function result(category, priority, sentimentValue, assignedTeam) {
  return { category, priority, sentiment: sentimentValue, assignedTeam };
}

function normalizeEnum(value, allowed, fallback) {
  const normalized = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  return allowed.includes(normalized) ? normalized : fallback;
}

function cleanText(value, fallback, maxLength) {
  const text = String(value || '').trim();
  return (text || fallback).slice(0, maxLength);
}

function containsAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function toVectorLiteral(embedding) {
  return `[${embedding.join(',')}]`;
}

function logOpenAiCall(tenantId, endpoint, started, success, statusCode, errorMessage) {
  return logApiCall({
    tenantId,
    provider: 'OpenAI',
    endpoint,
    method: 'POST',
    statusCode,
    responseTimeMs: Date.now() - started,
    success,
    errorMessage,
  });
}
