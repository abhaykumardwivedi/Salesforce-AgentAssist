import { all, dbMode, get, now, run } from '../database/db.js';
import { badRequest, notFound } from '../utils/httpError.js';
import { lexicalScore, tokenize } from '../utils/textSearch.js';
import { embedText, logOpenAiCall, resolveOpenAi, toVectorLiteral } from './aiService.js';

const STATUSES = ['PUBLISHED', 'DRAFT'];

function kbSelect(extra = '') {
  return `SELECT
      id,
      tenant_id AS "tenantId",
      title,
      content,
      category,
      status,
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM kb_articles ${extra}`;
}

export async function listArticles(tenantId) {
  return all(kbSelect('WHERE tenant_id = ? ORDER BY updated_at DESC'), [tenantId]);
}

export async function getArticle(tenantId, id) {
  const article = await get(kbSelect('WHERE tenant_id = ? AND id = ?'), [tenantId, Number(id)]);
  if (!article) throw notFound('Knowledge base article not found.');
  return article;
}

export async function createArticle(tenantId, payload) {
  const data = normalize(payload);
  const createdAt = now();
  const result = await run(
    `INSERT INTO kb_articles (tenant_id, title, content, category, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [tenantId, data.title, data.content, data.category, data.status, createdAt, createdAt],
  );
  const id = Number(result.lastInsertRowid);
  await indexArticle(tenantId, id, data.title, data.content);
  return getArticle(tenantId, id);
}

export async function updateArticle(tenantId, id, payload) {
  const existing = await getArticle(tenantId, id);
  const data = normalize({ ...existing, ...payload });
  await run(
    `UPDATE kb_articles SET title = ?, content = ?, category = ?, status = ?, updated_at = ?
     WHERE tenant_id = ? AND id = ?`,
    [data.title, data.content, data.category, data.status, now(), tenantId, existing.id],
  );
  await indexArticle(tenantId, existing.id, data.title, data.content);
  return getArticle(tenantId, existing.id);
}

export async function deleteArticle(tenantId, id) {
  const existing = await getArticle(tenantId, id);
  await run('DELETE FROM kb_articles WHERE tenant_id = ? AND id = ?', [tenantId, existing.id]);
}

// Returns the most relevant published articles for a free-text query. Uses
// pgvector cosine distance when embeddings are available, otherwise falls back
// to lexical token overlap so search still works on SQLite / without an API key.
export async function searchArticles(tenantId, query, limit = 3) {
  const text = String(query || '').trim();
  if (!text) return [];

  const openai = await resolveOpenAi(tenantId);
  if (openai.enabled && dbMode === 'postgres') {
    const vectorMatches = await vectorSearch(tenantId, openai, text, limit);
    if (vectorMatches) return vectorMatches;
  }
  return lexicalSearch(tenantId, text, limit);
}

async function vectorSearch(tenantId, openai, text, limit) {
  const started = Date.now();
  try {
    const literal = toVectorLiteral(await embedText(openai, text));
    const rows = await all(
      `SELECT id, title, content, category,
              1 - (embedding <=> ?::vector) AS score
       FROM kb_articles
       WHERE tenant_id = ? AND status = 'PUBLISHED' AND embedding IS NOT NULL
       ORDER BY embedding <=> ?::vector
       LIMIT ?`,
      [literal, tenantId, literal, limit],
    );
    await logOpenAiCall(tenantId, '/v1/embeddings:kb-search', started, true, 200);
    return rows.map((row) => ({ ...row, score: Number(row.score) }));
  } catch (error) {
    await logOpenAiCall(tenantId, '/v1/embeddings:kb-search', started, false, error.statusCode || 502, error.message);
    return null;
  }
}

async function lexicalSearch(tenantId, text, limit) {
  const rows = await all(
    kbSelect("WHERE tenant_id = ? AND status = 'PUBLISHED'"),
    [tenantId],
  );
  const queryTokens = tokenize(text);
  return rows
    .map((row) => ({
      id: row.id,
      title: row.title,
      content: row.content,
      category: row.category,
      score: lexicalScore(queryTokens, `${row.title} ${row.content}`),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

async function indexArticle(tenantId, id, title, content) {
  if (dbMode !== 'postgres') return;
  const openai = await resolveOpenAi(tenantId);
  if (!openai.enabled) return;
  const started = Date.now();
  try {
    const literal = toVectorLiteral(await embedText(openai, `${title}\n\n${content}`));
    await run('UPDATE kb_articles SET embedding = ? WHERE id = ? AND tenant_id = ?', [literal, id, tenantId]);
    await logOpenAiCall(tenantId, `/v1/embeddings:kb-article/${id}`, started, true, 200);
  } catch (error) {
    await logOpenAiCall(tenantId, `/v1/embeddings:kb-article/${id}`, started, false, error.statusCode || 502, error.message);
  }
}

function normalize(payload) {
  const title = String(payload.title || '').trim();
  const content = String(payload.content || '').trim();
  if (title.length < 3) throw badRequest('Article title is required.');
  if (content.length < 10) throw badRequest('Article content is too short.');
  const status = String(payload.status || 'PUBLISHED').toUpperCase();
  if (!STATUSES.includes(status)) throw badRequest('Article status is invalid.');
  const category = payload.category ? String(payload.category).trim().toUpperCase().slice(0, 60) : null;
  return { title: title.slice(0, 200), content, category, status };
}
