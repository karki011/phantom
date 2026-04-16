/**
 * PhantomOS JSONL Scanner
 * Scans ~/.claude/projects/ for conversation logs, discovers all sessions,
 * extracts token usage, costs, and metadata.
 * @author Subash Karki
 */
import { logger } from '../logger.js';
import { createReadStream, readdirSync, statSync } from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { basename, join } from 'node:path';
import { eq, and } from 'drizzle-orm';
import { db, sessions } from '@phantom-os/db';
import { PROJECTS_DIR } from '@phantom-os/shared/constants-node';
import { getModelPricing } from '@phantom-os/shared';

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
          const b = block as Record<string, unknown>;
          const toolName = b.name as string;
          if (toolName) {
            acc.toolBreakdown[toolName] = (acc.toolBreakdown[toolName] ?? 0) + 1;
            // Store per-skill/per-agent granularity for dashboard
            if (toolName === 'Skill') {
              const skill = (b.input as Record<string, unknown>)?.skill as string | undefined;
              if (skill) acc.toolBreakdown[`Skill:/${skill}`] = (acc.toolBreakdown[`Skill:/${skill}`] ?? 0) + 1;
            }
            if (toolName === 'Agent') {
              const desc = (b.input as Record<string, unknown>)?.description as string | undefined;
              if (desc) acc.toolBreakdown[`Agent:${desc.slice(0, 50)}`] = (acc.toolBreakdown[`Agent:${desc.slice(0, 50)}`] ?? 0) + 1;
            }
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

const calculateCostMicros = (acc: TokenAccumulator): number => {
  const pricing = getModelPricing(acc.model);
  // API input_tokens includes cache hits — subtract them to avoid double-counting
  const nonCachedInput = Math.max(0, acc.inputTokens - acc.cacheReadTokens);
  return Math.round(
    nonCachedInput * pricing.input +
    acc.outputTokens * pricing.output +
    acc.cacheReadTokens * pricing.cacheRead +
    acc.cacheWriteTokens * pricing.cacheWrite,
  );
};

/**
 * Tail-read a JSONL file to get the LAST assistant message's context size.
 * Reads only the last 50KB — cheap enough to run every 10 seconds.
 * Uses async fs.promises to avoid blocking the event loop.
 */
const tailReadContext = async (filePath: string): Promise<number | null> => {
  let handle: fsPromises.FileHandle | null = null;
  try {
    handle = await fsPromises.open(filePath, 'r');
    const stat = await handle.stat();
    const size = stat.size;
    // Read last 50KB (enough for several messages)
    const readSize = Math.min(size, 50_000);
    const buffer = Buffer.alloc(readSize);
    await handle.read(buffer, 0, readSize, size - readSize);
    await handle.close();
    handle = null;

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
  } catch { /* file not found or read error */ } finally {
    if (handle) {
      try { await handle.close(); } catch { /* ignore */ }
    }
  }
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
  const poll = async () => {
    const activeSessions = db
      .select({ id: sessions.id, cwd: sessions.cwd, lastInputTokens: sessions.lastInputTokens, model: sessions.model })
      .from(sessions)
      .where(eq(sessions.status, 'active'))
      .all();

    for (const session of activeSessions) {
      // Find by recent mtime, not sessionId (handles /clear)
      const jsonlPath = findActiveJsonlByCwd(session.cwd) ?? findJsonlPath(session.id);
      if (!jsonlPath) continue;

      const ctx = await tailReadContext(jsonlPath);
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
  logger.info('ContextPoller', 'Polling active sessions every 10s');
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

  logger.info('JsonlScanner', `Scanned ${scannedCount} sessions from ${projectDirs.length} projects, enriched ${enrichedCount}`);
  broadcast('jsonl:scan-complete', { scanned: scannedCount, enriched: enrichedCount });
};

/**
 * Periodically re-enrich sessions that have 0 tokens.
 * Handles the case where a session was discovered before its JSONL had data
 * (e.g., session-watcher creates the record before any assistant messages arrive,
 * or /clear rotates to a new JSONL file that wasn't yet populated at boot scan).
 * Runs every 60 seconds.
 * @author Subash Karki
 */
export const startPeriodicRescan = (broadcast: Broadcast): void => {
  // Track rescan attempts per session — stop retrying after MAX_RESCAN_ATTEMPTS
  const rescanAttempts = new Map<string, number>();
  const MAX_RESCAN_ATTEMPTS = 5;

  const rescan = async () => {
    // Find sessions with 0 input tokens that might have JSONL data now
    const emptySessions = db
      .select({ id: sessions.id, cwd: sessions.cwd })
      .from(sessions)
      .where(eq(sessions.inputTokens, 0))
      .all();

    let enrichedCount = 0;

    for (const session of emptySessions) {
      // Skip sessions that have exceeded retry limit
      const attempts = rescanAttempts.get(session.id) ?? 0;
      if (attempts >= MAX_RESCAN_ATTEMPTS) continue;

      const jsonlPath = findActiveJsonlByCwd(session.cwd) ?? findJsonlPath(session.id);
      if (!jsonlPath) {
        rescanAttempts.set(session.id, attempts + 1);
        continue;
      }

      // Check file has content (>100 bytes to skip nearly-empty files)
      try {
        const stat = statSync(jsonlPath);
        if (stat.size < 100) {
          rescanAttempts.set(session.id, attempts + 1);
          continue;
        }
      } catch {
        rescanAttempts.set(session.id, attempts + 1);
        continue;
      }

      const acc = await parseJsonlFile(jsonlPath);
      if (acc.messageCount === 0) {
        rescanAttempts.set(session.id, attempts + 1);
        continue;
      }

      const costMicros = calculateCostMicros(acc);

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
          firstPrompt: acc.firstPrompt ?? undefined,
          model: acc.model ?? undefined,
          ...(acc.startedAt ? { startedAt: acc.startedAt } : {}),
          ...(acc.endedAt ? { endedAt: acc.endedAt } : {}),
        })
        .where(eq(sessions.id, session.id))
        .run();

      // Success — clear retry counter
      rescanAttempts.delete(session.id);
      enrichedCount++;
    }

    if (enrichedCount > 0) {
      logger.debug('JsonlScanner', `Re-enriched ${enrichedCount} sessions`);
      broadcast('jsonl:rescan', { enriched: enrichedCount });
    }
  };

  // First rescan after 30 seconds (let boot finish), then every 60 seconds
  setTimeout(rescan, 30_000);
  setInterval(rescan, 60_000);
  logger.info('JsonlScanner', 'Periodic rescan enabled (every 60s for 0-token sessions)');
};
