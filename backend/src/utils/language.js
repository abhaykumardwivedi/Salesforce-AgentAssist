// Script-based language guess used when no LLM is available. It can only
// distinguish scripts (not Latin-alphabet languages from each other), so it
// returns 'English' as the default for Latin text. When OpenAI is configured,
// the model does the real detection.
const SCRIPT_RANGES = [
  { language: 'Hindi', re: /[ऀ-ॿ]/ },
  { language: 'Arabic', re: /[؀-ۿ]/ },
  { language: 'Russian', re: /[Ѐ-ӿ]/ },
  { language: 'Japanese', re: /[぀-ヿ]/ },
  { language: 'Korean', re: /[가-힯]/ },
  { language: 'Chinese', re: /[一-鿿]/ },
  { language: 'Greek', re: /[Ͱ-Ͽ]/ },
  { language: 'Hebrew', re: /[֐-׿]/ },
];

export function detectLanguageHeuristic(text) {
  const value = String(text || '');
  for (const { language, re } of SCRIPT_RANGES) {
    if (re.test(value)) return language;
  }
  return 'English';
}
