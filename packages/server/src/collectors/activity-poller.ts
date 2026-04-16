/**
 * PhantomOS Activity Poller
 * Tail-reads active sessions' JSONL files for real-time activity events.
 * @author Subash Karki
 */
import { logger } from '../logger.js';
import { openSync, readSync, closeSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { eq } from 'drizzle-orm';
import { db, sessions, activityLog } from '@phantom-os/db';
import { PROJECTS_DIR } from '@phantom-os/shared/constants-node';
import { safeReadDir } from '@phantom-os/shared/file-utils';

type Broadcast = (event: string, data: unknown) => void;

interface ActivityEvent {
  id: string;
  sessionId: string;
  sessionName: string;
  category: string;    // 'code', 'terminal', 'search', 'task', 'agent', 'git', 'user', 'response'
  icon: string;        // Lucide icon name
  message: string;
  detail?: string;     // Extra context (file path, command, etc.)
  timestamp: string;
}

const TOOL_EVENTS: Record<string, { icon: string; prefix: string; category: string }> = {
  'Read': { icon: 'file-text', prefix: 'Reading', category: 'code' },
  'Edit': { icon: 'pencil', prefix: 'Editing', category: 'code' },
  'Write': { icon: 'file-plus', prefix: 'Creating', category: 'code' },
  'MultiEdit': { icon: 'pencil', prefix: 'Multi-editing', category: 'code' },
  'Bash': { icon: 'terminal-square', prefix: 'Running', category: 'terminal' },
  'Grep': { icon: 'search', prefix: 'Searching', category: 'search' },
  'Glob': { icon: 'folder-search', prefix: 'Finding', category: 'search' },
  'Agent': { icon: 'bot', prefix: 'Spawning', category: 'agent' },
  'TaskCreate': { icon: 'list-plus', prefix: 'Task', category: 'task' },
  'TaskUpdate': { icon: 'check-square', prefix: 'Updated', category: 'task' },
  'WebSearch': { icon: 'globe', prefix: 'Searching web', category: 'search' },
  'WebFetch': { icon: 'download', prefix: 'Fetching', category: 'search' },
  'Skill': { icon: 'wand', prefix: 'Using skill', category: 'agent' },
};

// Track by file path, not sessionId (conversation ID changes on /clear)
const fileOffsets = new Map<string, number>();

/**
 * Find the most recently modified JSONL in the project directory matching a session's cwd.
 * After /clear, Claude creates a new JSONL with a different UUID, so we can't match by sessionId.
 * Instead, find the most recently modified .jsonl in the project dir.
 */
const findActiveJsonl = (cwd: string | null): string | null => {
  if (!cwd) return null;

  // Encode cwd to project dir name: /Users/subash.karki/CZ/foo → -Users-subash-karki-CZ-foo
  const encoded = cwd.replace(/\//g, '-');
  const projectDir = join(PROJECTS_DIR, encoded);

  try {
    const files = safeReadDir(projectDir)
      .filter((f) => f.endsWith('.jsonl') && !f.includes('/'))
      .map((f) => {
        const fullPath = join(projectDir, f);
        try {
          return { path: fullPath, mtime: statSync(fullPath).mtimeMs };
        } catch {
          return null;
        }
      })
      .filter((f): f is { path: string; mtime: number } => f !== null)
      .sort((a, b) => b.mtime - a.mtime);

    // Return most recently modified JSONL (that was touched in last 5 minutes)
    if (files.length > 0 && Date.now() - files[0].mtime < 5 * 60 * 1000) {
      return files[0].path;
    }
  } catch { /* project dir doesn't exist */ }
  return null;
};

const extractToolDetail = (toolName: string, input: Record<string, unknown>): string => {
  if (toolName === 'Read' || toolName === 'Edit' || toolName === 'Write') {
    const filePath = input.file_path as string | undefined;
    return filePath ? basename(filePath) : toolName;
  }
  if (toolName === 'Bash') {
    const command = input.command as string | undefined;
    return command ? command.slice(0, 60) : toolName;
  }
  if (toolName === 'Grep') {
    const pattern = input.pattern as string | undefined;
    return pattern ? pattern.slice(0, 60) : toolName;
  }
  if (toolName === 'Glob') {
    const pattern = input.pattern as string | undefined;
    return pattern ? pattern.slice(0, 60) : toolName;
  }
  if (toolName === 'Agent') {
    const description = input.description as string | undefined;
    return description ? description.slice(0, 60) : toolName;
  }
  if (toolName === 'TaskCreate') {
    const subject = input.subject as string | undefined;
    return subject ? subject.slice(0, 50) : toolName;
  }
  return toolName;
};

const extractEvents = (chunk: string, sessionId: string, sessionName: string): ActivityEvent[] => {
  const events: ActivityEvent[] = [];
  const lines = chunk.split('\n');

  for (const line of lines) {
    if (!line.trim()) continue;

    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    const type = entry.type as string | undefined;
    const timestamp = (entry.timestamp as string) ?? new Date().toISOString();

    if (type === 'assistant') {
      const message = entry.message as Record<string, unknown> | undefined;
      if (!message) continue;

      const content = message.content as unknown[] | undefined;
      if (!Array.isArray(content)) continue;

      for (const block of content) {
        if (!block || typeof block !== 'object') continue;
        const b = block as Record<string, unknown>;

        if (b.type === 'tool_use') {
          const toolName = b.name as string;
          const toolInput = (b.input as Record<string, unknown>) ?? {};
          const toolConfig = TOOL_EVENTS[toolName];

          // Detect git commits from Bash commands
          if (toolName === 'Bash') {
            const cmd = (toolInput.command as string) ?? '';
            const commitMatch = cmd.match(/git\s+commit\s+-m\s+["']?(.{1,60})/);
            if (commitMatch) {
              events.push({
                id: `act-${sessionId.slice(0, 6)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                sessionId,
                sessionName,
                category: 'git',
                icon: 'git-commit-horizontal',
                message: `Committed: ${commitMatch[1].replace(/["']$/, '')}`,
                detail: cmd.slice(0, 120),
                timestamp,
              });
              continue;
            }
            // Detect git push
            if (/git\s+push/.test(cmd)) {
              events.push({
                id: `act-${sessionId.slice(0, 6)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                sessionId,
                sessionName,
                category: 'git',
                icon: 'upload',
                message: 'Pushed to remote',
                detail: cmd.slice(0, 120),
                timestamp,
              });
              continue;
            }
            // Detect git checkout / branch
            const branchMatch = cmd.match(/git\s+(?:checkout|switch)\s+(?:-[bB]\s+)?(\S+)/);
            if (branchMatch) {
              events.push({
                id: `act-${sessionId.slice(0, 6)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                sessionId,
                sessionName,
                category: 'git',
                icon: 'git-branch',
                message: `Branch: ${branchMatch[1]}`,
                detail: cmd.slice(0, 120),
                timestamp,
              });
              continue;
            }
          }

          // Resolve category/icon for known tools, MCP tools, and unknown tools
          let category: string;
          let icon: string;
          let displayName = toolName;
          let mcpServer: string | undefined;
          let mcpTool: string | undefined;

          if (toolConfig) {
            category = toolConfig.category;
            icon = toolConfig.icon;
          } else if (toolName.startsWith('mcp__')) {
            // MCP tool: mcp__<server>__<tool> → extract server + tool
            const parts = toolName.split('__');
            mcpServer = parts[1] ?? 'unknown';
            mcpTool = parts.slice(2).join('__') || 'unknown';
            displayName = `${mcpServer}:${mcpTool}`;
            category = 'mcp';
            icon = 'plug';
          } else {
            category = 'code';
            icon = 'circle';
          }

          const detail = extractToolDetail(toolName, toolInput);
          events.push({
            id: `act-${sessionId.slice(0, 6)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            sessionId,
            sessionName,
            category,
            icon,
            message: toolConfig ? `${toolConfig.prefix} ${detail}` : `${displayName} ${detail}`,
            detail: toolName === 'Read' || toolName === 'Edit' || toolName === 'Write'
              ? (toolInput.file_path as string | undefined) ?? undefined
              : undefined,
            timestamp,
          });

          // Persist to DB for cross-session analytics
          try {
            db.insert(activityLog).values({
              timestamp: new Date(timestamp).getTime(),
              type: toolName,
              sessionId,
              metadata: JSON.stringify({
                category,
                detail,
                sessionName,
                displayName,
                skill: toolName === 'Skill' ? (toolInput.skill as string | undefined) : undefined,
                agentDesc: toolName === 'Agent' ? (toolInput.description as string | undefined) : undefined,
                mcpServer,
                mcpTool,
              }),
            }).run();
          } catch { /* non-critical — don't break the poller */ }
        } else if (b.type === 'text') {
          const text = b.text as string | undefined;
          if (!text) continue;
          if (text.startsWith('<')) continue;
          if (text.length < 15) continue;

          events.push({
            id: `act-${sessionId.slice(0, 6)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            sessionId,
            sessionName,
            category: 'response',
            icon: 'message-square',
            message: text.slice(0, 80),
            timestamp,
          });
        }
      }
    }

    if (type === 'user') {
      const message = entry.message as Record<string, unknown> | undefined;
      if (!message) continue;

      const content = message.content;
      let text: string | null = null;

      if (typeof content === 'string') {
        text = content;
      } else if (Array.isArray(content) && content.length > 0) {
        const first = content[0] as Record<string, unknown> | undefined;
        if (first && typeof first.text === 'string') {
          text = first.text;
        }
      }

      if (!text) continue;
      if (text.startsWith('<command')) continue;
      if (text.startsWith('<system')) continue;

      events.push({
        id: `act-${sessionId.slice(0, 6)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        sessionId,
        sessionName,
        category: 'user',
        icon: 'user',
        message: text.slice(0, 80),
        timestamp,
      });
    }
  }

  return events;
};

export const startActivityPoller = (broadcast: Broadcast): void => {
  const poll = () => {
    const activeSessions = db.select({ id: sessions.id, name: sessions.name, repo: sessions.repo, cwd: sessions.cwd })
      .from(sessions).where(eq(sessions.status, 'active')).all();

    // Accumulate events across ALL sessions, then emit a single broadcast per poll tick.
    // Without this, N active sessions can fire N separate SSE messages in one tick.
    const allEvents: ActivityEvent[] = [];

    for (const session of activeSessions) {
      // Find the actively-written JSONL by recent mtime, not by sessionId
      const jsonlPath = findActiveJsonl(session.cwd);
      if (!jsonlPath) continue;

      let fileSize: number;
      try { fileSize = statSync(jsonlPath).size; } catch { continue; }

      // Track by file path (different conversations have different files)
      const lastOffset = fileOffsets.get(jsonlPath) ?? Math.max(0, fileSize - 20_000);
      if (fileSize <= lastOffset) continue;

      const readSize = Math.min(fileSize - lastOffset, 100_000);
      const buffer = Buffer.alloc(readSize);
      const fd = openSync(jsonlPath, 'r');
      readSync(fd, buffer, 0, readSize, lastOffset);
      closeSync(fd);

      fileOffsets.set(jsonlPath, fileSize);

      const chunk = buffer.toString('utf-8');
      const sessionName = session.name ?? session.repo ?? session.id.slice(0, 8);
      const events = extractEvents(chunk, session.id, sessionName);

      allEvents.push(...events);
    }

    // Single broadcast per poll tick — cap at 100 events (across all sessions)
    if (allEvents.length > 0) {
      broadcast('activity', { events: allEvents.slice(-100) });
    }
  };

  setInterval(poll, 5_000);
  setTimeout(poll, 2_000);
  logger.info('ActivityPoller', 'Polling active sessions every 5s');
};
