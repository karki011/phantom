// PhantomOS v2 — Identity Rail glyph helpers
// Author: Subash Karki

const TOKEN_SPLIT = /[-\s]+/;

/**
 * Project glyph: 2-letter abbreviation taken from the first letter of each
 * of the first two hyphen/space-separated tokens. Falls back to first 2
 * letters when only one token exists.
 *   "phantom-os"          -> "PO"
 *   "feature-web-apps"    -> "FW"
 *   "frontend-mono-repo"  -> "FM"
 *   "single"              -> "SI"
 *   ""                    -> "??"
 */
export function projectGlyph(name: string): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '??';
  const tokens = trimmed.split(TOKEN_SPLIT).filter(Boolean);
  if (tokens.length >= 2) {
    return (tokens[0][0] + tokens[1][0]).toUpperCase();
  }
  const sole = tokens[0] ?? '';
  if (sole.length >= 2) return sole.slice(0, 2).toUpperCase();
  if (sole.length === 1) return sole.toUpperCase().repeat(2);
  return '??';
}

/**
 * Branch chip: a 4-char abbreviation of the most descriptive part of a
 * branch name. Algorithm:
 *   1. Take the last `/`-separated segment (path component).
 *   2. Split that segment on `-`. Skip leading "ticket-style" tokens —
 *      all-uppercase-letter prefixes (e.g. "CP") and pure-digit tokens
 *      (e.g. "40850") — to surface the descriptive word.
 *   3. Take the first remaining token's first 4 chars, uppercased.
 *   4. Fall back to the first 4 chars of the raw segment (also uppercased)
 *      when no descriptive token exists.
 *
 *   "CP-40850-granularity-dropdown" -> "GRAN"
 *   "feat/auth"                     -> "AUTH"
 *   "main"                          -> "MAIN"
 *   "release/2026.04"               -> "2026"
 */
const TICKET_TOKEN = /^([A-Z]+|\d+)$/;

export function branchChip(branch: string): string {
  const trimmed = (branch ?? '').trim();
  if (!trimmed) return '????';
  const segments = trimmed.split('/').filter(Boolean);
  const last = segments[segments.length - 1] ?? '';
  if (!last) return '????';
  const tokens = last.split('-').filter(Boolean);
  const descriptive = tokens.find((t) => !TICKET_TOKEN.test(t));
  const pick = descriptive ?? last;
  return pick.slice(0, 4).toUpperCase();
}
