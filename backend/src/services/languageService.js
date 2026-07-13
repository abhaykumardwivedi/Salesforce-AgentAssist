import { detectLanguageHeuristic } from '../utils/language.js';
import { callOpenAiJson, logOpenAiCall, resolveOpenAi } from './aiService.js';

// Detects the source language of `text` and translates it into `targetLanguage`.
// With OpenAI configured this handles any language; otherwise it falls back to a
// script-based guess and returns the original text untranslated.
export async function translateText(tenantId, text, targetLanguage = 'English') {
  const clean = String(text || '').trim();
  if (!clean) return { language: 'Unknown', translation: '', targetLanguage, translated: false };

  const openai = await resolveOpenAi(tenantId);
  if (!openai.enabled) {
    return { language: detectLanguageHeuristic(clean), translation: clean, targetLanguage, translated: false };
  }

  const started = Date.now();
  try {
    const result = await callOpenAiJson(openai, {
      name: 'translation',
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          language: { type: 'string', minLength: 2, maxLength: 40 },
          translation: { type: 'string', minLength: 1 },
        },
        required: ['language', 'translation'],
      },
      input: [
        {
          role: 'developer',
          content: `Detect the language of the user's text and translate it into ${targetLanguage}. Return the detected source language (English name) and the translation. If the text is already in ${targetLanguage}, return it unchanged.`,
        },
        { role: 'user', content: clean },
      ],
    });
    await logOpenAiCall(tenantId, '/v1/responses:translate', started, true, 200);
    return {
      language: result.language || detectLanguageHeuristic(clean),
      translation: result.translation || clean,
      targetLanguage,
      translated: true,
    };
  } catch (error) {
    await logOpenAiCall(tenantId, '/v1/responses:translate', started, false, error.statusCode || 502, error.message);
    return { language: detectLanguageHeuristic(clean), translation: clean, targetLanguage, translated: false };
  }
}
