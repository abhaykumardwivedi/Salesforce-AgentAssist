import { all, get } from '../database/db.js';
import { badRequest } from '../utils/httpError.js';
import { extractOutputText, generateText, logOpenAiCall, requestResponses, resolveOpenAi } from './aiService.js';
import { addMessage, assignTicket, listAssignees } from './conversationService.js';
import { getCustomer360 } from './customerService.js';
import { searchArticles } from './knowledgeService.js';
import { answerQuestion, findSimilarByText } from './retrievalService.js';
import { createCase, updateTicketStatus } from './ticketService.js';

const TONES = ['FRIENDLY', 'FORMAL', 'EMPATHETIC', 'CONCISE'];
const MAX_TOOL_STEPS = 5;

// ---------------------------------------------------------------------------
// Reply drafting
// ---------------------------------------------------------------------------

// Draft a customer-facing reply for a ticket, grounded in the customer's
// context and the most relevant KB articles / past tickets.
export async function draftReply(tenantId, ticket, customer, options = {}) {
  const tone = normalizeTone(options.tone);
  const instructions = String(options.instructions || '').trim().slice(0, 500);
  const language = String(options.language || ticket.language || 'English').trim().slice(0, 40) || 'English';

  const [articles, similar] = await Promise.all([
    searchArticles(tenantId, `${ticket.subject} ${ticket.description}`, 3),
    findSimilarByText(tenantId, `${ticket.subject} ${ticket.description}`, { excludeId: ticket.id, limit: 3 }),
  ]);
  const sources = toSources(articles, similar);

  const openai = await resolveOpenAi(tenantId);
  if (!openai.enabled) {
    return { draft: localDraft(ticket, customer, articles), tone, language: 'English', sources, mode: 'LOCAL' };
  }

  const started = Date.now();
  try {
    const draft = await generateText(openai, [
      {
        role: 'developer',
        content: [
          'You are a customer support agent drafting a reply to a customer.',
          `Write in a ${tone.toLowerCase()} tone.`,
          `Write the entire reply in ${language} — the customer's language.`,
          'Ground the reply in the provided customer context and knowledge base. Do not invent policies, amounts, or commitments that are not supported by the context.',
          'Address the customer by their first name, acknowledge the issue, give clear next steps, and close politely. Return only the reply body.',
          instructions ? `Extra instruction from the agent: ${instructions}` : '',
        ].filter(Boolean).join(' '),
      },
      { role: 'user', content: buildDraftPrompt(ticket, customer, articles, similar) },
    ], { maxOutputTokens: 600 });
    await logOpenAiCall(tenantId, `/v1/responses:draft-reply/${ticket.id}`, started, true, 200);
    return { draft, tone, language, sources, mode: 'REAL' };
  } catch (error) {
    await logOpenAiCall(tenantId, `/v1/responses:draft-reply/${ticket.id}`, started, false, error.statusCode || 502, error.message);
    return { draft: localDraft(ticket, customer, articles), tone, language: 'English', sources, mode: 'LOCAL' };
  }
}

function buildDraftPrompt(ticket, customer, articles, similar) {
  const lines = [
    `Customer: ${customer.fullName}`,
    `Company: ${customer.companyName || 'Not provided'}`,
    `Segment: ${customer.segment}`,
    '',
    `Ticket subject: ${ticket.subject}`,
    `Ticket message: ${ticket.description}`,
    `Category: ${ticket.category} | Priority: ${ticket.priority} | Sentiment: ${ticket.sentiment}`,
  ];
  if (articles.length) {
    lines.push('', 'Relevant knowledge base:');
    articles.forEach((article) => lines.push(`- ${article.title}: ${article.content}`));
  }
  if (similar.length) {
    lines.push('', 'How similar past tickets were handled:');
    similar.forEach((row) => lines.push(`- ${row.subject} (${row.status}): ${row.description}`));
  }
  return lines.join('\n');
}

function localDraft(ticket, customer, articles) {
  const firstName = customer.fullName.trim().split(/\s+/)[0] || 'there';
  const guidance = articles[0]
    ? `\n\nHere is how we can help: ${articles[0].content}`
    : '\n\nOur team is reviewing the details and will follow up shortly with the next steps.';
  return [
    `Hi ${firstName},`,
    '',
    `Thank you for reaching out about "${ticket.subject}". I understand this is important and I'm here to help.${guidance}`,
    '',
    'Please let me know if there is anything else I can do for you.',
    '',
    'Best regards,',
    'Support Team',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Copilot chat (function-calling loop over read-only workspace data)
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    type: 'function',
    name: 'search_customers',
    description: 'Search customers in this workspace by name, email, or company name.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { query: { type: 'string', description: 'Search text.' } },
      required: ['query'],
    },
  },
  {
    type: 'function',
    name: 'get_customer_360',
    description: 'Get a full profile for one customer: orders, tickets, total spend, open tickets, and AI summary.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { customerId: { type: 'integer', description: 'The customer id.' } },
      required: ['customerId'],
    },
  },
  {
    type: 'function',
    name: 'list_recent_tickets',
    description: 'List the most recent tickets, optionally filtered by status.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        status: { type: 'string', enum: ['ANY', 'OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] },
      },
      required: ['status'],
    },
  },
  {
    type: 'function',
    name: 'search_knowledge_base',
    description: 'Search internal knowledge base articles for guidance and policies.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  {
    type: 'function',
    name: 'list_agents',
    description: 'List agents in the workspace who can own a ticket (needed to propose an assignment).',
    parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] },
  },
  {
    type: 'function',
    name: 'propose_reply',
    description: 'Propose a reply or internal note on a ticket for the agent to approve. Does not send anything.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ticketId: { type: 'integer' },
        body: { type: 'string' },
        internal: { type: 'boolean', description: 'true for an internal note not visible to the customer.' },
      },
      required: ['ticketId', 'body', 'internal'],
    },
  },
  {
    type: 'function',
    name: 'propose_status_change',
    description: 'Propose changing a ticket status for the agent to approve.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ticketId: { type: 'integer' },
        status: { type: 'string', enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] },
      },
      required: ['ticketId', 'status'],
    },
  },
  {
    type: 'function',
    name: 'propose_assignment',
    description: 'Propose assigning a ticket to an agent (use list_agents first to get the userId).',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { ticketId: { type: 'integer' }, userId: { type: 'integer' } },
      required: ['ticketId', 'userId'],
    },
  },
  {
    type: 'function',
    name: 'propose_salesforce_case',
    description: 'Propose creating a Salesforce case from a ticket for the agent to approve.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { ticketId: { type: 'integer' } },
      required: ['ticketId'],
    },
  },
];

// Runs the agent copilot. `messages` is the prior chat [{ role, content }].
export async function runCopilot(tenantId, messages) {
  const history = sanitizeMessages(messages);
  if (!history.length) throw badRequest('A message is required.');

  const openai = await resolveOpenAi(tenantId);
  if (!openai.enabled) {
    // No LLM configured: degrade to a grounded knowledge-base answer on the
    // latest user turn so the copilot still returns something useful.
    const lastUser = [...history].reverse().find((m) => m.role === 'user');
    const fallback = await answerQuestion(tenantId, lastUser?.content || '');
    return { reply: fallback.answer, sources: fallback.sources, actions: [], mode: 'LOCAL' };
  }

  let input = [{ role: 'developer', content: SYSTEM_PROMPT }, ...history];
  const sources = new SourceSet();
  const actions = new ProposalSet();
  const started = Date.now();

  try {
    for (let step = 0; step < MAX_TOOL_STEPS; step += 1) {
      const data = await requestResponses(openai, { input, tools: TOOLS });
      const calls = (data.output || []).filter((item) => item.type === 'function_call');

      if (!calls.length) {
        await logOpenAiCall(tenantId, '/v1/responses:copilot', started, true, 200);
        return { reply: extractOutputText(data) || 'I do not have an answer for that.', sources: sources.list(), actions: actions.list(), mode: 'REAL' };
      }

      input = input.concat(data.output);
      for (const call of calls) {
        const args = parseArguments(call.arguments);
        const result = await executeTool(tenantId, call.name, args, sources, actions);
        input.push({
          type: 'function_call_output',
          call_id: call.call_id,
          output: JSON.stringify(result).slice(0, 6000),
        });
      }
    }
    await logOpenAiCall(tenantId, '/v1/responses:copilot', started, true, 200);
    return { reply: 'I gathered some information but could not finish. Please narrow your question.', sources: sources.list(), actions: actions.list(), mode: 'REAL' };
  } catch (error) {
    await logOpenAiCall(tenantId, '/v1/responses:copilot', started, false, error.statusCode || 502, error.message);
    throw error;
  }
}

// Execute an agent-approved action by delegating to the existing tenant-scoped
// services. Params are re-validated here — approval does not bypass validation.
export async function executeAction(tenantId, userId, action = {}) {
  const ticketId = Number(action.ticketId);
  if (!Number.isInteger(ticketId) || ticketId <= 0) throw badRequest('A valid ticketId is required.');

  switch (action.type) {
    case 'SEND_REPLY':
    case 'ADD_NOTE': {
      const body = String(action.body || '').trim();
      if (!body) throw badRequest('A message body is required.');
      const internal = action.type === 'ADD_NOTE' || Boolean(action.isInternal);
      await addMessage(tenantId, ticketId, { authorType: 'AGENT', authorUserId: userId, body, isInternal: internal });
      return { type: action.type, ticketId, summary: internal ? 'Internal note added.' : 'Reply sent to the customer.' };
    }
    case 'SET_STATUS': {
      const ticket = await updateTicketStatus(tenantId, ticketId, String(action.status || '').toUpperCase());
      return { type: action.type, ticketId, summary: `Status set to ${ticket.status}.` };
    }
    case 'ASSIGN': {
      const result = await assignTicket(tenantId, ticketId, action.userId ?? null);
      return { type: action.type, ticketId, summary: result.assignedUserName ? `Assigned to ${result.assignedUserName}.` : 'Ticket unassigned.' };
    }
    case 'CREATE_SALESFORCE_CASE': {
      const result = await createCase(tenantId, ticketId);
      return { type: action.type, ticketId, summary: result.message || 'Salesforce case created.' };
    }
    default:
      throw badRequest('Unknown action type.');
  }
}

const SYSTEM_PROMPT = [
  'You are AgentAssist Copilot, helping a support agent understand customers and tickets in their workspace.',
  'Use the read tools to look up real data before answering — never invent customer names, ids, orders, or ticket details.',
  'When you reference a customer or ticket, be specific. Keep answers concise and action-oriented.',
  'You may PROPOSE actions with the propose_* tools (reply, internal note, status change, assignment, Salesforce case).',
  'You cannot perform actions yourself — every proposal must be approved by the human agent. Only propose an action when it is clearly warranted and after you have looked up the specific ticket id.',
  'After proposing, briefly tell the agent what you proposed and that it awaits their approval. Never claim an action has been completed.',
  'If the tools return nothing relevant, say so honestly.',
].join(' ');

async function executeTool(tenantId, name, args, sources, actions) {
  try {
    switch (name) {
      case 'search_customers':
        return await toolSearchCustomers(tenantId, args.query);
      case 'get_customer_360':
        return await toolCustomer360(tenantId, args.customerId, sources);
      case 'list_recent_tickets':
        return await toolRecentTickets(tenantId, args.status);
      case 'search_knowledge_base':
        return await toolSearchKb(tenantId, args.query, sources);
      case 'list_agents':
        return { agents: await listAssignees(tenantId) };
      case 'propose_reply':
        return proposeAction(actions, { type: 'SEND_REPLY', ticketId: args.ticketId, body: args.body, isInternal: Boolean(args.internal) });
      case 'propose_status_change':
        return proposeAction(actions, { type: 'SET_STATUS', ticketId: args.ticketId, status: args.status });
      case 'propose_assignment':
        return proposeAction(actions, { type: 'ASSIGN', ticketId: args.ticketId, userId: args.userId });
      case 'propose_salesforce_case':
        return proposeAction(actions, { type: 'CREATE_SALESFORCE_CASE', ticketId: args.ticketId });
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (error) {
    return { error: error.message || 'Tool execution failed.' };
  }
}

// Records a proposed action (for the agent to approve) and returns a synthetic
// tool result. Never mutates data — proposals are executed only via executeAction.
function proposeAction(actions, action) {
  const ticketId = Number(action.ticketId);
  if (!Number.isInteger(ticketId) || ticketId <= 0) return { error: 'A valid ticketId is required.' };
  if ((action.type === 'SEND_REPLY') && !String(action.body || '').trim()) return { error: 'A message body is required.' };
  const proposal = { ...action, ticketId, label: actionLabel(action, ticketId) };
  actions.add(proposal);
  return { proposed: true, label: proposal.label, note: 'Queued for the agent to approve. Do not state it is done.' };
}

function actionLabel(action, ticketId) {
  switch (action.type) {
    case 'SEND_REPLY':
      return action.isInternal ? `Add internal note to ticket #${ticketId}` : `Send reply to ticket #${ticketId}`;
    case 'SET_STATUS':
      return `Set ticket #${ticketId} status to ${action.status}`;
    case 'ASSIGN':
      return `Assign ticket #${ticketId} to user ${action.userId}`;
    case 'CREATE_SALESFORCE_CASE':
      return `Create a Salesforce case for ticket #${ticketId}`;
    default:
      return `Action on ticket #${ticketId}`;
  }
}

async function toolSearchCustomers(tenantId, query) {
  const like = `%${String(query || '').trim().toLowerCase()}%`;
  const rows = await all(
    `SELECT id, full_name AS "fullName", email, company_name AS "companyName", segment
     FROM customers
     WHERE tenant_id = ?
       AND (lower(full_name) LIKE ? OR lower(email) LIKE ? OR lower(company_name) LIKE ?)
     ORDER BY lower(full_name) ASC
     LIMIT 10`,
    [tenantId, like, like, like],
  );
  return { customers: rows };
}

async function toolCustomer360(tenantId, customerId, sources) {
  const id = Number(customerId);
  if (!Number.isInteger(id) || id <= 0) return { error: 'A valid customerId is required.' };
  const data = await getCustomer360(tenantId, id);
  sources.add({ type: 'CUSTOMER', id: data.customer.id, title: data.customer.fullName });
  return {
    customer: data.customer,
    totalSpend: data.totalSpend,
    totalOrders: data.totalOrders,
    openTickets: data.openTickets,
    summary: data.aiCustomerSummary,
    recentTickets: data.tickets.slice(0, 5).map((t) => ({ id: t.id, subject: t.subject, status: t.status, priority: t.priority })),
  };
}

async function toolRecentTickets(tenantId, status) {
  const wantStatus = String(status || 'ANY').toUpperCase();
  const filtered = wantStatus !== 'ANY';
  const rows = await all(
    `SELECT t.id, t.subject, t.status, t.priority, t.category, c.full_name AS "customerName"
     FROM tickets t
     JOIN customers c ON c.id = t.customer_id
     WHERE t.tenant_id = ? ${filtered ? 'AND t.status = ?' : ''}
     ORDER BY t.created_at DESC
     LIMIT 15`,
    filtered ? [tenantId, wantStatus] : [tenantId],
  );
  return { tickets: rows };
}

async function toolSearchKb(tenantId, query, sources) {
  const articles = await searchArticles(tenantId, query, 3);
  articles.forEach((article) => sources.add({ type: 'ARTICLE', id: article.id, title: article.title }));
  return { articles: articles.map((a) => ({ id: a.id, title: a.title, content: a.content })) };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

class SourceSet {
  constructor() {
    this.map = new Map();
  }

  add(source) {
    this.map.set(`${source.type}:${source.id}`, source);
  }

  list() {
    return [...this.map.values()];
  }
}

class ProposalSet {
  constructor() {
    this.map = new Map();
  }

  add(action) {
    // Dedupe identical proposals; index gives each a stable id for the UI.
    const key = JSON.stringify([action.type, action.ticketId, action.body, action.status, action.userId, action.isInternal]);
    if (!this.map.has(key)) this.map.set(key, { id: `act-${this.map.size + 1}`, ...action });
  }

  list() {
    return [...this.map.values()];
  }
}

function toSources(articles, tickets) {
  return [
    ...articles.map((article) => ({ type: 'ARTICLE', id: article.id, title: article.title })),
    ...tickets.map((ticket) => ({ type: 'TICKET', id: ticket.id, title: ticket.subject })),
  ];
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 4000) }));
}

function parseArguments(raw) {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

function normalizeTone(tone) {
  const value = String(tone || 'FRIENDLY').toUpperCase();
  return TONES.includes(value) ? value : 'FRIENDLY';
}
