// Strips personally identifiable contact details from text before it leaves the
// system for an LLM. This mirrors the log secret-masking approach: reduce the
// blast radius of what we send to a third party. Names are intentionally kept —
// only emails, phone numbers, and card-like number sequences are removed — so
// prompts stay useful (e.g. an agent reply can still greet the customer).

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// 13-16 digit sequences, optionally grouped by spaces or dashes (card numbers).
const CARD = /\b(?:\d[ -]?){13,16}\b/g;
// Candidate phone runs: a digit (optionally after +), then separators/digits.
// A candidate only counts as a phone if it contains at least 9 actual digits,
// which keeps dates (e.g. 2026-01-12) and small amounts from being redacted.
const PHONE_CANDIDATE = /\+?\d[\d\s().-]{7,}\d/g;

export function redactPii(value) {
  if (typeof value !== 'string' || !value) return value;
  return value
    .replace(EMAIL, '[redacted-email]')
    .replace(CARD, '[redacted-card]')
    .replace(PHONE_CANDIDATE, (match) => (digitCount(match) >= 9 ? '[redacted-phone]' : match));
}

function digitCount(text) {
  return (text.match(/\d/g) || []).length;
}

// Returns a shallow copy of an OpenAI Responses/Embeddings request body with all
// free-text inputs redacted. Tool schemas, model names, and formatting options
// are left untouched. Idempotent — safe to run on already-redacted content.
export function redactModelInput(body) {
  if (!body || body.input === undefined) return body;
  const { input } = body;
  let redacted;
  if (typeof input === 'string') redacted = redactPii(input);
  else if (Array.isArray(input)) redacted = input.map(redactInputItem);
  else redacted = input;
  return { ...body, input: redacted };
}

function redactInputItem(item) {
  if (typeof item === 'string') return redactPii(item);
  if (!item || typeof item !== 'object') return item;
  const next = { ...item };
  if (typeof next.content === 'string') {
    next.content = redactPii(next.content);
  } else if (Array.isArray(next.content)) {
    next.content = next.content.map((part) => (part && typeof part.text === 'string' ? { ...part, text: redactPii(part.text) } : part));
  }
  // Copilot tool results are carried as function_call_output.output strings.
  if (typeof next.output === 'string') next.output = redactPii(next.output);
  return next;
}
