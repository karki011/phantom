/**
 * PhantomOS JSONL Scanner
 * Scans ~/.claude/projects/ for conversation logs, discovers all sessions,
 * extracts token usage, costs, and metadata.
 * @author Subash Karki
 */
import { createReadStream, readdirSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { basename, join } from 'node:path';
import { eq, and } from 'drizzle-orm';
import { db, sessions } from '@phantom-os/db';
import { PROJECTS_DIR, COST_PER_TOKEN } from '@phantom-os/shared';

type Broadcast = (event: string, data: unknown) => void;

interface TokenAccumulator {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  lastInputTokens: number;
  messageCount: number;
  toolUseCount: number;
  toolBreakdown: Record<string, number>;
  firstPrompt: string | null;
  startedAt: number | null;
  endedAt: number | null;
  cwd: string | null;
  repo: string | null;
  model: string | null;
}

const safeDirs = (dir: string): string[] => {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
};

const extractFirstText = (content: unknown): string | null => {
  if (typeof content === 'string') return content.slice(0, 200);
  if (Array.isArray(content)) {
    for (const block of content) {
      if (block && typeof block === 'object' && 'type' in block && block.type === 'text' && 'text' in block) {
        return (block.text as string).slice(0, 200);
      }
    }
  }
  return null;
};

/**
 * Process a single JSONL entry and accumulate token/tool data into acc.
 */
const processEntry = (entry: Record<string, unknown>, acc: TokenAccumulator, foundFirstUser: { value: boolean }): void => {
  const type = entry.type as string | undefined;
  const timestamp = entry.timestamp as string | undefined;

  // Track timestamps
  if (timestamp) {
    const ts = new Date(timestamp).getTime();
    if (!Number.isNaN(ts)) {
      if (acc.startedAt === null || ts < acc.startedAt) acc.startedAt = ts;
      if (acc.endedAt === null || ts > acc.endedAt) acc.endedAt = ts;
    }
  }

  // Extract cwd from first message that has it
  if (!acc.cwd && entry.cwd) {
    acc.cwd = entry.cwd as string;
    acc.repo = basename(acc.cwd);
  }

  if (type === 'assistant') {
    acc.messageCount++;

    const message = entry.message as Record<string, unknown> | undefined;
    if (!message) return;

    if (!acc.model && message.model) {
      acc.model = message.model as string;
    }

    // Sum token usage
    const usage = message.usage as Record<string, number> | undefined;
    if (usage) {
      const msgInputTokens = usage.input_tokens ?? 0;
      const msgCacheRead = usage.cache_read_input_tokens ?? 0;
      const msgCacheWrite = usage.cache_creation_input_tokens ?? 0;
      acc.inputTokens += msgInputTokens;
      acc.outputTokens += usage.output_tokens ?? 0;
      acc.cacheReadTokens += msgCacheRead;
      acc.cacheWriteTokens += msgCacheWrite;
      // Full context = non-cached + cache read + cache write (all sent to model)
      acc.lastInputTokens = msgInputTokens + msgCacheRead + msgCacheWrite;
    }

    // Count tool_use blocks
    const content = message.content as unknown[] | undefined;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block && typeof block === 'object' && 'type' in block && (block as Record<string, unknown>).type === 'tool_use') {
          acc.toolUseCount++;
          const toolName = (block as Record<string, unknown>).name as string;
          if (toolName) {
            acc.toolBreakdown[toolName] = (acc.toolBreakdown[toolName] ?? 0) + 1;
          }
        }
      }
    }
  }

  if (type === 'user') {
    acc.messageCount++;

    // Capture first user message
    if (!foundFirstUser.value) {
      foundFirstUser.value = true;
      const message = entry.message as Record<string, unknown> | undefined;
      if (message) {
        acc.firstPrompt = extractFirstText(message.content);
      }
    }
  }
};

/**
 * Stream-parse a JSONL file line-by-line to avoid loading entire file into memory.
 * Claude conversation JSONL files can be 10-50MB+; streaming prevents OOM.
 */
const parseJsonlFile = async (filePath: string): Promise<TokenAccumulator> => {
  const acc: TokenAccumulator = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    lastInputTokens: 0,
    messageCount: 0,
    toolUseCount: 0,
    toolBreakdown: {},
    firstPrompt: null,
    startedAt: null,
    endedAt: null,
    cwd: null,
    repo: null,
    model: null,
  };

  const foundFirstUser = { value: false };

  try {
    const rl = createInterface({
      input: createReadStream(filePath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line.trim()) continue;

      let entry: Record<string, unknown>;
      try {
        entry = JSON.parse(line);
      } catch {
        continue; // skip malformed lines
      }

      processEntry(entry, acc, foundFirstUser);
    }
  } catch {
    // file not found or read error — return empty accumulator
  }

  return acc;
};

const getMaxContext = (model: string | null): number => {
  if (model?.includes('opus')) return 1_000_000;
  return 200_000;
};

const calculateCostMicros = (acc: TokenAccumulator): number =>
  Math.round(
    acc.inputTokens * COST_PER_TOKEN.INPUT +
    acc.outputTokens * COST_PER_TOKEN.OUTPUT +
    acc.cacheReadTokens * COST_PER_TOKEN.CACHE_READ +
    acc.cacheWriteTokens * COST_PER_TOKEN.CACHE_WRITE,
  );

/**
 * Tail-read a JSONL file to get the LAST assistant message's context size.
 * Reads only the last 50KB — cheap enough to run every 10 seconds.
 */
const tailReadContext = (filePath: string): number | null => {
  try {
    const stat = statSync(filePath);
    const size = stat.size;
    // Read last 50KB (enough for several messages)
    const readSize = Math.min(size, 50_000);
    const fd = openSync(filePath, 'r');
    const buffer = Buffer.alloc(readSize);
    readSync(fd, buffer, 0, readSize, size - readSize);
    closeSync(fd);

    const chunk = buffer.toString('utf-8');
    const lines = chunk.split('\n').filter(Boolean);

    // Walk backwards to find the last assistant message with usage
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.type === 'assistant' && entry.message?.usage) {
          const u = entry.message.usage;
          return (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
        }
      } catch { /* skip malformed line at chunk boundary */ }
    }
  } catch { /* file not found or read error */ }
  return null;
};

/**
 * Find the JSONL path for a session ID across all project directories.
 */
const findJsonlPath = (sessionId: string): string | null => {
  for (const dir of safeDirs(PROJECTS_DIR)) {
    const candidate = join(PROJECTS_DIR, dir, `${sessionId}.jsonl`);
    try {
      statSync(candidate);
      return candidate;
    } catch { /* not in this project */ }
  }
  return null;
};

/**
 * Periodically update context for active sessions by tail-reading their JSONL files.
 * Runs every 10 seconds. Much cheaper than full JSONL parse.
 */
/**
 * Find the most recently modified JSONL for a given cwd (handles /clear creating new files).
 */
const findActiveJsonlByCwd = (cwd: string | null): string | null => {
  if (!cwd) return null;
  const encoded = cwd.replace(/\//g, '-');
  const projectDir = join(PROJECTS_DIR, encoded);
  try {
    const files = safeDirs(projectDir)
      .filter((f) => f.endsWith('.jsonl') && !f.includes('/'))
      .map((f) => {
        const fullPath = join(projectDir, f);
        try { return { path: fullPath, mtime: statSync(fullPath).mtimeMs }; } catch { return null; }
      })
      .filter((f): f is { path: string; mtime: number } => f !== null)
      .sort((a, b) => b.mtime - a.mtime);
    if (files.length > 0 && Date.now() - files[0].mtime < 10 * 60 * 1000) return files[0].path;
  } catch { /* project dir doesn't exist */ }
  return null;
};

export const startActiveContextPoller = (broadcast: Broadcast): void => {
  const poll = () => {
    const activeSessions = db
      .select({ id: sessions.id, cwd: sessions.cwd, lastInputTokens: sessions.lastInputTokens, model: sessions.model })
      .from(sessions)
      .where(eq(sessions.status, 'active'))
      .all();

    for (const session of activeSessions) {
      // Find by recent mtime, not sessionId (handles /clear)
      const jsonlPath = findActiveJsonlByCwd(session.cwd) ?? findJsonlPath(session.id);
      if (!jsonlPath) continue;

      const ctx = tailReadContext(jsonlPath);
      if (ctx !== null && ctx !== session.lastInputTokens) {
        const ctxPct = Math.round((ctx / getMaxContext(session.model)) * 100);
        db.update(sessions)
          .set({ lastInputTokens: ctx, contextUsedPct: ctxPct })
          .where(eq(sessions.id, session.id))
          .run();
        broadcast('session:context', { id: session.id, contextUsedPct: ctxPct });
      }
    }
  };

  // First poll after 3 seconds (let boot finish), then every 10 seconds
  setTimeout(poll, 3000);
  setInterval(poll, 10_000);
  console.log('[ContextPoller] Polling active sessions every 10s');
};

export const scanJsonlSessions = async (broadcast: Broadcast): Promise<void> => {
  const projectDirs = safeDirs(PROJECTS_DIR);
  let scannedCount = 0;
  let enrichedCount = 0;

  for (const projectDir of projectDirs) {
    const projectPath = join(PROJECTS_DIR, projectDir);

    // Skip non-directories
    try {
      if (!statSync(projectPath).isDirectory()) continue;
    } catch {
      continue;
    }

    const files = safeDirs(projectPath).filter((f) => f.endsWith('.jsonl'));

    for (const file of files) {
      const sessionId = file.replace(/\.jsonl$/, '');
      const filePath = join(projectPath, file);

      // Check if already enriched
      const existing = db
        .select({ inputTokens: sessions.inputTokens })
        .from(sessions)
        .where(eq(sessions.id, sessionId))
        .get();

      if (existing && (existing.inputTokens ?? 0) > 0) continue;

      scannedCount++;
      const acc = await parseJsonlFile(filePath);

      // Skip empty files
      if (acc.messageCount === 0) continue;

      const costMicros = calculateCostMicros(acc);

      if (existing) {
        // Update existing session with token data
        db.update(sessions)
          .set({
            inputTokens: acc.inputTokens,
            outputTokens: acc.outputTokens,
            cacheReadTokens: acc.cacheReadTokens,
            cacheWriteTokens: acc.cacheWriteTokens,
            lastInputTokens: acc.lastInputTokens,
            estimatedCostMicros: costMicros,
            messageCount: acc.messageCount,
            toolUseCount: acc.toolUseCount,
            toolBreakdown: JSON.stringify(acc.toolBreakdown),
            firstPrompt: acc.firstPrompt,
            model: acc.model,
            ...(acc.startedAt && !existing ? { startedAt: acc.startedAt } : {}),
            ...(acc.endedAt ? { endedAt: acc.endedAt } : {}),
          })
          .where(eq(sessions.id, sessionId))
          .run();
      } else {
        // Insert new session from JSONL discovery
        db.insert(sessions)
          .values({
            id: sessionId,
            cwd: acc.cwd,
            repo: acc.repo,
            status: 'completed',
            startedAt: acc.startedAt,
            endedAt: acc.endedAt,
            inputTokens: acc.inputTokens,
            outputTokens: acc.outputTokens,
            cacheReadTokens: acc.cacheReadTokens,
            cacheWriteTokens: acc.cacheWriteTokens,
            lastInputTokens: acc.lastInputTokens,
            estimatedCostMicros: costMicros,
            messageCount: acc.messageCount,
            toolUseCount: acc.toolUseCount,
            toolBreakdown: JSON.stringify(acc.toolBreakdown),
            firstPrompt: acc.firstPrompt,
            model: acc.model,
          })
          .run();
      }

      enrichedCount++;
    }
  }

  console.log(`[JsonlScanner] Scanned ${scannedCount} sessions from ${projectDirs.length} projects, enriched ${enrichedCount}`);
  broadcast('jsonl:scan-complete', { scanned: scannedCount, enriched: enrichedCount });
};
