// PhantomOS v2 — Fuzzy search for command palette
// Author: Subash Karki

export interface FuzzyResult<T> {
  item: T;
  score: number;
}

/**
 * Fuzzy-match a query against a text string.
 * Returns a score (higher = better match) or -1 for no match.
 *
 * Scoring:
 * - Exact substring match at start -> +100
 * - Exact substring match elsewhere -> +50
 * - All query tokens present (AND match) -> +25 per token
 * - Single token partial match -> +10
 */
export const fuzzyScore = (query: string, text: string): number => {
  const q = query.toLowerCase().trim();
  const t = text.toLowerCase();

  if (!q) return 0; // empty query matches everything with neutral score

  // Exact substring at start
  if (t.startsWith(q)) return 100 + q.length;

  // Exact substring anywhere
  if (t.includes(q)) return 50 + q.length;

  // Token-based: all tokens must appear
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;

  let matched = 0;
  for (const token of tokens) {
    if (t.includes(token)) matched++;
  }

  if (matched === tokens.length) return 25 * tokens.length;
  if (matched > 0) return 10 * matched;

  return -1; // no match
};

/**
 * Filter and rank items by fuzzy match against one or more text fields.
 */
export const fuzzyFilter = <T>(
  items: T[],
  query: string,
  getText: (item: T) => string[],
): FuzzyResult<T>[] => {
  if (!query.trim()) return items.map((item) => ({ item, score: 0 }));

  const results: FuzzyResult<T>[] = [];

  for (const item of items) {
    const texts = getText(item);
    let bestScore = -1;
    for (const text of texts) {
      const score = fuzzyScore(query, text);
      if (score > bestScore) bestScore = score;
    }
    if (bestScore >= 0) {
      results.push({ item, score: bestScore });
    }
  }

  // Sort by score descending, then alphabetically
  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aLabel = getText(a.item)[0] ?? '';
    const bLabel = getText(b.item)[0] ?? '';
    return aLabel.localeCompare(bLabel);
  });

  return results;
};
