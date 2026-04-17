/**
 * Gitignore matcher — loads .gitignore rules for a worktree and answers
 * isIgnored(relativePath) for the file tree listing.
 *
 * Caches per worktree root, invalidated when the root's .gitignore mtime
 * changes. Nested .gitignore files are walked lazily: when a descendant
 * path is checked, any .gitignore files along its ancestors are loaded
 * once and folded into the matcher.
 *
 * @author Subash Karki
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

import ignore, { type Ignore } from 'ignore';

interface CacheEntry {
  matcher: Ignore;
  rootMtime: number;
  nestedLoaded: Set<string>;
}

const cache = new Map<string, CacheEntry>();

const ALWAYS_IGNORE = ['.git', '.git/**'];

function readRules(absFile: string): string[] {
  try {
    return readFileSync(absFile, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.length > 0 && !l.startsWith('#'));
  } catch {
    return [];
  }
}

function buildRoot(rootAbs: string): CacheEntry {
  const matcher = ignore();
  matcher.add(ALWAYS_IGNORE);

  const rootFile = join(rootAbs, '.gitignore');
  let rootMtime = 0;
  if (existsSync(rootFile)) {
    try {
      rootMtime = statSync(rootFile).mtimeMs;
    } catch { /* ignore */ }
    matcher.add(readRules(rootFile));
  }

  return { matcher, rootMtime, nestedLoaded: new Set() };
}

function ensureFresh(rootAbs: string): CacheEntry {
  const existing = cache.get(rootAbs);
  if (existing) {
    const rootFile = join(rootAbs, '.gitignore');
    let currentMtime = 0;
    if (existsSync(rootFile)) {
      try { currentMtime = statSync(rootFile).mtimeMs; } catch { /* ignore */ }
    }
    if (currentMtime === existing.rootMtime) return existing;
  }

  const fresh = buildRoot(rootAbs);
  cache.set(rootAbs, fresh);
  return fresh;
}

/**
 * Lazily fold nested .gitignore files along the given relative path into the
 * matcher. The `ignore` package applies rules relative to the root — nested
 * rules are re-written by prefixing their directory.
 */
function loadNestedAlong(entry: CacheEntry, rootAbs: string, relativePath: string): void {
  const parts = relativePath.split(/[\\/]/).filter(Boolean);
  // Walk each ancestor directory (shallowest first), excluding the file itself
  for (let i = 0; i < parts.length - 1; i++) {
    const relDir = parts.slice(0, i + 1).join('/');
    if (entry.nestedLoaded.has(relDir)) continue;
    entry.nestedLoaded.add(relDir);

    const absGitignore = join(rootAbs, relDir, '.gitignore');
    if (!existsSync(absGitignore)) continue;

    const rules = readRules(absGitignore);
    // Prefix each rule with the directory so it anchors correctly from root.
    // Rules that start with '!' (negation) or '/' (root-anchored relative to
    // the .gitignore file) also get prefixed; gitignore semantics match this
    // because a nested .gitignore's rules are scoped to its directory.
    const prefixed = rules.map((rule) => {
      const trimmed = rule.trim();
      if (trimmed.length === 0 || trimmed.startsWith('#')) return trimmed;
      const negate = trimmed.startsWith('!');
      const body = negate ? trimmed.slice(1) : trimmed;
      const anchored = body.startsWith('/') ? body.slice(1) : body;
      return `${negate ? '!' : ''}${relDir}/${anchored}`;
    });
    entry.matcher.add(prefixed);
  }
}

export interface GitignoreMatcher {
  isIgnored(relativePath: string): boolean;
}

/**
 * Get a matcher for a worktree root. Cached per root path with mtime-based
 * invalidation for the root-level .gitignore.
 */
export function getMatcher(rootAbs: string): GitignoreMatcher {
  return {
    isIgnored(relativePath: string): boolean {
      if (!relativePath || relativePath === '/' || relativePath === '.') return false;
      const entry = ensureFresh(rootAbs);

      // Normalize — ignore package wants forward slashes and no leading slash.
      const normalized = relativePath.replace(/^[\\/]+/, '').split(sep).join('/');

      loadNestedAlong(entry, rootAbs, normalized);

      try {
        return entry.matcher.ignores(normalized);
      } catch {
        return false;
      }
    },
  };
}

/** Clear all cached matchers — used in tests. */
export function _resetGitignoreCache(): void {
  cache.clear();
}
