// Lightweight lexical similarity used when pgvector embeddings are not
// available (SQLite dev/test, or when no OpenAI key is configured). It is a
// deliberately simple token-overlap score — good enough to surface related
// tickets and knowledge-base articles without an external dependency.

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'to', 'of', 'in', 'on', 'for', 'with',
  'is', 'are', 'was', 'were', 'be', 'been', 'it', 'this', 'that', 'these',
  'those', 'i', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'they', 'them',
  'as', 'at', 'by', 'from', 'not', 'no', 'do', 'does', 'did', 'have', 'has',
  'had', 'can', 'cannot', 'will', 'would', 'should', 'could', 'me', 'us', 'so',
  'if', 'then', 'than', 'about', 'after', 'before', 'up', 'out', 'please',
]);

export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

// Weighted Jaccard-style overlap in [0, 1]. Repeated query terms count once.
export function lexicalScore(queryTokens, candidateText) {
  if (!queryTokens.length) return 0;
  const query = new Set(queryTokens);
  const candidate = new Set(tokenize(candidateText));
  if (!candidate.size) return 0;
  let shared = 0;
  for (const token of query) {
    if (candidate.has(token)) shared += 1;
  }
  const union = query.size + candidate.size - shared;
  return union === 0 ? 0 : shared / union;
}
