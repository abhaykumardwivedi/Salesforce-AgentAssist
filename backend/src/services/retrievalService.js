import { all, dbMode, run } from '../database/db.js';
import { lexicalScore, tokenize } from '../utils/textSearch.js';
import { embedText, generateText, logOpenAiCall, resolveOpenAi, toVectorLiteral } from './aiService.js';
import { searchArticles } from './knowledgeService.js';

// Store a ticket's embedding so it can be retrieved as a "similar past ticket".
// No-op on SQLite / without an API key — similarity then falls back to lexical.
export async function indexTicket(tenantId, ticket) {
  if (dbMode !== 'postgres') return;
  const openai = await resolveOpenAi(tenantId);
  if (!openai.enabled) return;
  const started = Date.now();
  try {
    const literal = toVectorLiteral(await embedText(openai, ticketText(ticket)));
    await run('UPDATE tickets SET embedding = ? WHERE id = ? AND tenant_id = ?', [literal, ticket.id, tenantId]);
    await logOpenAiCall(tenantId, `/v1/embeddings:ticket/${ticket.id}`, started, true, 200);
  } catch (error) {
    await logOpenAiCall(tenantId, `/v1/embeddings:ticket/${ticket.id}`, started, false, error.statusCode || 502, error.message);
  }
}

export function findSimilarTickets(tenantId, ticket, limit = 5) {
  return findSimilarByText(tenantId, ticketText(ticket), { excludeId: ticket.id, limit });
}

export async function findSimilarByText(tenantId, text, { excludeId = null, limit = 5 } = {}) {
  const query = String(text || '').trim();
  if (!query) return [];

  const openai = await resolveOpenAi(tenantId);
  if (openai.enabled && dbMode === 'postgres') {
    const matches = await vectorSimilar(tenantId, openai, query, excludeId, limit);
    if (matches) return matches;
  }
  return lexicalSimilar(tenantId, query, excludeId, limit);
}

async function vectorSimilar(tenantId, openai, query, excludeId, limit) {
  const started = Date.now();
  try {
    const literal = toVectorLiteral(await embedText(openai, query));
    const rows = await all(
      `SELECT t.id, t.subject, t.description, t.category, t.priority, t.status,
              t.assigned_team AS "assignedTeam", c.full_name AS "customerName",
              1 - (t.embedding <=> ?::vector) AS score
       FROM tickets t
       JOIN customers c ON c.id = t.customer_id
       WHERE t.tenant_id = ? AND t.embedding IS NOT NULL AND (? IS NULL OR t.id != ?)
       ORDER BY t.embedding <=> ?::vector
       LIMIT ?`,
      [literal, tenantId, excludeId, excludeId, literal, limit],
    );
    await logOpenAiCall(tenantId, '/v1/embeddings:similar-tickets', started, true, 200);
    return rows.map((row) => ({ ...row, score: Number(row.score) }));
  } catch (error) {
    await logOpenAiCall(tenantId, '/v1/embeddings:similar-tickets', started, false, error.statusCode || 502, error.message);
    return null;
  }
}

async function lexicalSimilar(tenantId, query, excludeId, limit) {
  const rows = await all(
    `SELECT t.id, t.subject, t.description, t.category, t.priority, t.status,
            t.assigned_team AS "assignedTeam", c.full_name AS "customerName"
     FROM tickets t
     JOIN customers c ON c.id = t.customer_id
     WHERE t.tenant_id = ? AND (? IS NULL OR t.id != ?)`,
    [tenantId, excludeId, excludeId],
  );
  const queryTokens = tokenize(query);
  return rows
    .map((row) => ({ ...row, score: lexicalScore(queryTokens, `${row.subject} ${row.description}`) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// Retrieval-augmented answer: pull the most relevant KB articles and past
// tickets, then have the model answer strictly from that context with citations.
export async function answerQuestion(tenantId, question, { includeTickets = true } = {}) {
  const query = String(question || '').trim();
  if (!query) return { answer: 'Please enter a question.', sources: [] };

  // The public deflection widget passes includeTickets:false so no internal
  // ticket content is ever exposed to customers — only knowledge base articles.
  const [articles, tickets] = await Promise.all([
    searchArticles(tenantId, query, 3),
    includeTickets ? findSimilarByText(tenantId, query, { limit: 3 }) : Promise.resolve([]),
  ]);

  const sources = [
    ...articles.map((article) => ({ type: 'ARTICLE', id: article.id, title: article.title })),
    ...tickets.map((ticket) => ({ type: 'TICKET', id: ticket.id, title: ticket.subject })),
  ];

  if (!articles.length && !tickets.length) {
    return {
      answer: 'I could not find anything relevant in the knowledge base or past tickets. Try rephrasing, or add an article covering this topic.',
      sources: [],
      grounded: false,
    };
  }

  const openai = await resolveOpenAi(tenantId);
  if (!openai.enabled) {
    return { answer: fallbackAnswer(articles, tickets), sources, grounded: true };
  }

  const started = Date.now();
  try {
    const answer = await generateText(openai, [
      {
        role: 'developer',
        content: [
          'You are a support knowledge assistant. Answer the agent\'s question using ONLY the provided context.',
          'If the context does not contain the answer, say so plainly instead of guessing.',
          'Be concise and practical. Reference the source titles you used.',
        ].join(' '),
      },
      { role: 'user', content: `Question:\n${query}\n\n${buildContext(articles, tickets)}` },
    ], { maxOutputTokens: 500 });
    await logOpenAiCall(tenantId, '/v1/responses:kb-answer', started, true, 200);
    return { answer, sources, grounded: true };
  } catch (error) {
    await logOpenAiCall(tenantId, '/v1/responses:kb-answer', started, false, error.statusCode || 502, error.message);
    return { answer: fallbackAnswer(articles, tickets), sources, grounded: true };
  }
}

export function buildContext(articles, tickets) {
  const parts = [];
  if (articles.length) {
    parts.push('Knowledge base articles:');
    articles.forEach((article, index) => {
      parts.push(`[Article ${index + 1}] ${article.title}\n${article.content}`);
    });
  }
  if (tickets.length) {
    parts.push('\nRelated past tickets:');
    tickets.forEach((ticket, index) => {
      parts.push(`[Ticket ${index + 1}] ${ticket.subject} (${ticket.status})\n${ticket.description}`);
    });
  }
  return parts.join('\n');
}

function fallbackAnswer(articles, tickets) {
  if (articles.length) {
    const top = articles[0];
    return `Based on the knowledge base article "${top.title}":\n\n${top.content}`;
  }
  const top = tickets[0];
  return `A similar past ticket ("${top.subject}") was handled as follows:\n\n${top.description}`;
}

function ticketText(ticket) {
  return `${ticket.subject}\n\n${ticket.description}`;
}
