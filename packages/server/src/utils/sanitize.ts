/**
 * Sanitize content before injecting into XML-tagged prompt blocks.
 * Prevents prompt injection via source file contents that contain
 * closing tags or system-level XML elements.
 * @author Subash Karki
 */

const DANGEROUS_PATTERNS: [RegExp, string][] = [
  [/<\/codebase-context>/gi, '&lt;/codebase-context&gt;'],
  [/<\/strategy-guidance>/gi, '&lt;/strategy-guidance&gt;'],
  [/<\/phantom-context>/gi, '&lt;/phantom-context&gt;'],
  [/<\/phantom-analysis>/gi, '&lt;/phantom-analysis&gt;'],
  [/<system>/gi, '&lt;system&gt;'],
  [/<\/system>/gi, '&lt;/system&gt;'],
  [/<system-reminder>/gi, '&lt;system-reminder&gt;'],
  [/<\/system-reminder>/gi, '&lt;/system-reminder&gt;'],
];

export const sanitizeXMLTags = (content: string): string => {
  let result = content;
  for (const [pattern, replacement] of DANGEROUS_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
};
