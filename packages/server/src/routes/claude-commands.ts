/**
 * Claude CLI slash-command discovery.
 *
 * Returns the union of:
 *   - Built-in `/foo` commands (hardcoded on the client)
 *   - User skills under `~/.claude/skills/<name>/SKILL.md`
 *   - User commands under `~/.claude/commands/**\/*.md`
 *   - Project commands under `<worktree>/.claude/commands/**\/*.md`
 *
 * Skills come from directories with a SKILL.md metadata file. Commands are
 * plain markdown files where the filename (minus extension) is the command.
 *
 * @author Subash Karki
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { db, worktrees } from '@phantom-os/db';

export const claudeCommandRoutes = new Hono();

interface SlashCommand {
  name: string; // "/gsd-plan" → "gsd-plan"
  description: string;
  source: 'skill' | 'user-command' | 'project-command';
}

/** Extract a human-readable description from the top of a markdown file. */
function extractDescription(filePath: string): string {
  try {
    const raw = readFileSync(filePath, 'utf8');

    // Frontmatter `description:` wins if present
    const fm = /^---\s*\n([\s\S]*?)\n---/.exec(raw);
    if (fm) {
      const descMatch = /^description:\s*(.+)$/m.exec(fm[1]);
      if (descMatch) return descMatch[1].trim().slice(0, 200);
    }

    // Otherwise first non-empty, non-heading, non-fence line
    const lines = raw
      .replace(/^---[\s\S]*?\n---\n/, '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('```'));
    return (lines[0] ?? '').slice(0, 200);
  } catch {
    return '';
  }
}

/** Walk a commands directory; filenames become command names, dir names are
 *  prefixed with a colon (e.g. `github/issue-triage.md` → `github:issue-triage`). */
function scanCommandsDir(
  root: string,
  source: SlashCommand['source'],
  prefix = '',
): SlashCommand[] {
  const out: SlashCommand[] = [];
  if (!existsSync(root)) return out;
  let entries;
  try { entries = readdirSync(root); } catch { return out; }

  for (const entry of entries) {
    if (entry.startsWith('.')) continue;
    const abs = join(root, entry);
    let stat;
    try { stat = statSync(abs); } catch { continue; }

    if (stat.isDirectory()) {
      const nestedPrefix = prefix ? `${prefix}:${entry}` : entry;
      out.push(...scanCommandsDir(abs, source, nestedPrefix));
      continue;
    }

    if (!entry.endsWith('.md')) continue;
    const base = entry.slice(0, -3); // strip .md
    const name = prefix ? `${prefix}:${base}` : base;
    out.push({ name, description: extractDescription(abs), source });
  }
  return out;
}

/** Walk ~/.claude/skills/<name>/ — each subdirectory with SKILL.md is a skill. */
function scanSkillsDir(root: string): SlashCommand[] {
  const out: SlashCommand[] = [];
  if (!existsSync(root)) return out;
  let entries;
  try { entries = readdirSync(root); } catch { return out; }

  for (const entry of entries) {
    if (entry.startsWith('.')) continue;
    const abs = join(root, entry);
    let stat;
    try { stat = statSync(abs); } catch { continue; }
    if (!stat.isDirectory()) continue;

    const skillMd = join(abs, 'SKILL.md');
    if (!existsSync(skillMd)) continue;
    out.push({
      name: entry,
      description: extractDescription(skillMd),
      source: 'skill',
    });
  }
  return out;
}

// Cache: scanning ~300+ files per keystroke would be wasteful. Cache for 30s
// per worktree and invalidate on explicit refresh.
interface CacheEntry {
  fetchedAt: number;
  commands: SlashCommand[];
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30_000;

/** GET /api/claude/slash-commands?worktreeId=... */
claudeCommandRoutes.get('/claude/slash-commands', (c) => {
  const worktreeId = c.req.query('worktreeId') ?? '';
  const refresh = c.req.query('refresh') === '1';

  const cached = cache.get(worktreeId);
  if (!refresh && cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return c.json({ commands: cached.commands, cached: true });
  }

  const home = homedir();
  const userSkills = scanSkillsDir(join(home, '.claude/skills'));
  const userCommands = scanCommandsDir(join(home, '.claude/commands'), 'user-command');

  let projectCommands: SlashCommand[] = [];
  if (worktreeId) {
    const worktree = db
      .select()
      .from(worktrees)
      .where(eq(worktrees.id, worktreeId))
      .get();
    if (worktree?.worktreePath) {
      projectCommands = scanCommandsDir(
        join(worktree.worktreePath, '.claude/commands'),
        'project-command',
      );
    }
  }

  // Dedupe by name — project beats user beats skill (closest scope wins).
  const byName = new Map<string, SlashCommand>();
  for (const c of [...userSkills, ...userCommands, ...projectCommands]) {
    byName.set(c.name, c);
  }
  const commands = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));

  cache.set(worktreeId, { fetchedAt: Date.now(), commands });
  return c.json({ commands, cached: false });
});
