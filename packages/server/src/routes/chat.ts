/**
 * PhantomOS Chat Routes — Talk to Claude via CLI pipe
 * Uses `claude -p` with JSON output for reliable responses.
 * Includes chat history persistence, per-worktree context, and conversation management.
 * @author Subash Karki
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { desc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { db, chatMessages, chatConversations, userPreferences } from '@phantom-os/db';
import { logger } from '../logger.js';
import { graphEngine } from '../services/graph-engine.js';
import { resolveProjectIdFromCwd } from '../services/mcp-config.js';

export const chatRoutes = new Hono();

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  message: string;
  model?: string;
  context?: ChatMessage[];
  cwd?: string;
  projectId?: string;       // PhantomOS project ID — used for graph context injection
  projectContext?: string;  // e.g. "Project: feature-web-apps, Branch: test, Path: /Users/.../repo"
}

/** Concise mode system instruction — inspired by caveman-speak token reduction */
const CAVEMAN_INSTRUCTION = `IMPORTANT STYLE RULE: Be extremely concise. No filler, no pleasantries, no restating the question. Lead with the answer or fix. Use sentence fragments, shorthand, and inline code. Skip "Sure!", "I'd be happy to", "Let me explain". If the answer is one line, give one line. Same technical accuracy, 75% fewer words.`;

/** Check if caveman/concise mode is enabled in user preferences */
function isCavemanEnabled(): boolean {
  const row = db.select().from(userPreferences).where(eq(userPreferences.key, 'caveman')).get();
  return row?.value === 'true';
}

/**
 * Build the prompt for multi-turn by including previous context
 * and optional project context.
 */
function buildPrompt(message: string, context?: ChatMessage[], projectContext?: string): string {
  const parts: string[] = [];

  // Inject concise mode instruction if enabled
  if (isCavemanEnabled()) {
    parts.push(CAVEMAN_INSTRUCTION);
  }

  if (projectContext) {
    parts.push(`Context: You are helping with a project. ${projectContext}`);
  }

  if (context && context.length > 0) {
    const transcript = context
      .map((msg) => `${msg.role === 'user' ? 'Human' : 'Assistant'}: ${msg.content}`)
      .join('\n\n');
    parts.push(`${transcript}\n\nHuman: ${message}`);
  } else {
    parts.push(message);
  }

  return parts.join('\n\n');
}

// ---------------------------------------------------------------------------
// Conversation CRUD
// ---------------------------------------------------------------------------

/** GET /chat/conversations — List conversations for a worktree */
chatRoutes.get('/chat/conversations', (c) => {
  const worktreeId = c.req.query('worktreeId') ?? c.req.query('workspaceId') ?? null;
  const limit = Number(c.req.query('limit')) || 20;

  const rows = worktreeId
    ? db.select().from(chatConversations).where(eq(chatConversations.workspaceId, worktreeId)).orderBy(desc(chatConversations.updatedAt)).limit(limit).all()
    : db.select().from(chatConversations).where(sql`${chatConversations.workspaceId} IS NULL`).orderBy(desc(chatConversations.updatedAt)).limit(limit).all();

  return c.json(rows);
});

/** POST /chat/conversations — Create a new conversation */
chatRoutes.post('/chat/conversations', async (c) => {
  const body = await c.req.json<{ worktreeId?: string; workspaceId?: string; title?: string; model?: string }>();
  const worktreeId = body.worktreeId ?? body.workspaceId ?? null;
  const id = randomUUID();
  const now = Date.now();

  db.insert(chatConversations).values({
    id,
    workspaceId: worktreeId,
    title: body.title ?? 'New Chat',
    model: body.model ?? 'sonnet',
    createdAt: now,
    updatedAt: now,
  }).run();

  return c.json({ id, workspaceId: worktreeId, title: body.title ?? 'New Chat', model: body.model ?? 'sonnet', createdAt: now, updatedAt: now }, 201);
});

/** DELETE /chat/conversations/:id — Delete a conversation and its messages */
chatRoutes.delete('/chat/conversations/:id', (c) => {
  const id = c.req.param('id');
  db.delete(chatMessages).where(eq(chatMessages.conversationId, id)).run();
  db.delete(chatConversations).where(eq(chatConversations.id, id)).run();
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// GET /chat/history — Load chat messages (by conversation or worktree)
// ---------------------------------------------------------------------------

chatRoutes.get('/chat/history', (c) => {
  const conversationId = c.req.query('conversationId');
  const worktreeId = c.req.query('worktreeId') ?? c.req.query('workspaceId') ?? null;
  const limit = Number(c.req.query('limit')) || 50;

  let rows;
  if (conversationId) {
    rows = db.select().from(chatMessages).where(eq(chatMessages.conversationId, conversationId)).orderBy(desc(chatMessages.createdAt)).limit(limit).all();
  } else if (worktreeId) {
    rows = db.select().from(chatMessages).where(eq(chatMessages.workspaceId, worktreeId)).orderBy(desc(chatMessages.createdAt)).limit(limit).all();
  } else {
    rows = db.select().from(chatMessages).where(sql`${chatMessages.workspaceId} IS NULL`).orderBy(desc(chatMessages.createdAt)).limit(limit).all();
  }

  // Return in chronological order (oldest first)
  return c.json(rows.reverse());
});

// ---------------------------------------------------------------------------
// POST /chat/save — Save a message pair (user + assistant) after response
// ---------------------------------------------------------------------------

chatRoutes.post('/chat/save', async (c) => {
  const body = await c.req.json<{
    messages: {
      id: string;
      conversationId?: string;
      worktreeId?: string;
      workspaceId?: string;
      role: string;
      content: string;
      model?: string;
      createdAt: number;
    }[];
  }>();

  for (const msg of body.messages) {
    db.insert(chatMessages).values({
      id: msg.id,
      conversationId: msg.conversationId ?? null,
      workspaceId: msg.worktreeId ?? msg.workspaceId ?? null,
      role: msg.role,
      content: msg.content,
      model: msg.model ?? null,
      createdAt: msg.createdAt,
    }).onConflictDoNothing().run();
  }

  // Auto-title conversation from first user message if title is still "New Chat"
  const convId = body.messages[0]?.conversationId;
  if (convId) {
    const conv = db.select().from(chatConversations).where(eq(chatConversations.id, convId)).get();
    if (conv && conv.title === 'New Chat') {
      const firstUser = body.messages.find((m) => m.role === 'user');
      if (firstUser) {
        const autoTitle = firstUser.content.slice(0, 60) + (firstUser.content.length > 60 ? '...' : '');
        db.update(chatConversations).set({ title: autoTitle, updatedAt: Date.now() }).where(eq(chatConversations.id, convId)).run();
      }
    } else if (conv) {
      db.update(chatConversations).set({ updatedAt: Date.now() }).where(eq(chatConversations.id, convId)).run();
    }
  }

  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// DELETE /chat/history — Clear chat history (by conversation or worktree)
// ---------------------------------------------------------------------------

chatRoutes.delete('/chat/history', (c) => {
  const conversationId = c.req.query('conversationId');
  const worktreeId = c.req.query('worktreeId') ?? c.req.query('workspaceId') ?? null;

  if (conversationId) {
    db.delete(chatMessages).where(eq(chatMessages.conversationId, conversationId)).run();
    db.delete(chatConversations).where(eq(chatConversations.id, conversationId)).run();
  } else if (worktreeId) {
    // Delete all conversations + messages for worktree
    const convs = db.select({ id: chatConversations.id }).from(chatConversations).where(eq(chatConversations.workspaceId, worktreeId)).all();
    for (const conv of convs) {
      db.delete(chatMessages).where(eq(chatMessages.conversationId, conv.id)).run();
    }
    db.delete(chatConversations).where(eq(chatConversations.workspaceId, worktreeId)).run();
    db.delete(chatMessages).where(eq(chatMessages.workspaceId, worktreeId)).run();
  } else {
    db.delete(chatMessages).where(sql`${chatMessages.workspaceId} IS NULL`).run();
    db.delete(chatConversations).where(sql`${chatConversations.workspaceId} IS NULL`).run();
  }

  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// POST /chat/upload — Save an uploaded file to temp directory, return path
// ---------------------------------------------------------------------------

chatRoutes.post('/chat/upload', async (c) => {
  const body = await c.req.parseBody();
  const file = body['file'];

  if (!file || typeof file === 'string') {
    return c.json({ error: 'No file provided' }, 400);
  }

  const uploadDir = join(tmpdir(), 'phantom-chat-uploads');
  mkdirSync(uploadDir, { recursive: true });

  const ext = file.name?.split('.').pop() ?? 'bin';
  const filename = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const filePath = join(uploadDir, filename);

  const buffer = await file.arrayBuffer();
  writeFileSync(filePath, Buffer.from(buffer));

  return c.json({ path: filePath, name: file.name, size: buffer.byteLength });
});

// ---------------------------------------------------------------------------
// POST /chat — Send a message to Claude, stream NDJSON response
// ---------------------------------------------------------------------------

/**
 * Extract file paths mentioned in a message.
 * Matches common patterns like src/foo.ts, ./bar/baz.tsx, etc.
 */
function extractFilePaths(message: string): string[] {
  const matches = message.match(/(?:^|\s|['"`(])([.\w/-]+\.\w{1,10})(?=['"`)\s,]|$)/g);
  if (!matches) return [];
  return [...new Set(matches.map((m) => m.trim().replace(/^['"`(]+|['"`),]+$/g, '')))];
}

/**
 * Build graph context string from the AI engine for a project.
 * Extracts file paths from the user's message and queries the graph.
 */
/** Max characters for injected graph context — prevents prompt bloat */
const MAX_GRAPH_CONTEXT_CHARS = 2000;

function buildGraphContext(projectId: string, message: string): string | null {
  const query = graphEngine.getQuery(projectId);
  if (!query) return null;

  const filePaths = extractFilePaths(message);
  if (filePaths.length === 0) return null;

  const sections: string[] = [];
  let totalChars = 0;

  for (const file of filePaths.slice(0, 3)) { // Limit files to avoid prompt bloat
    if (totalChars >= MAX_GRAPH_CONTEXT_CHARS) break;

    try {
      const ctx = query.getContext(file, 2);
      if (ctx.files.length > 0) {
        const related = ctx.files
          .map((f) => ({ path: f.path, relevance: ctx.scores.get(f.id) ?? 0 }))
          .filter((f) => f.relevance > 0)
          .sort((a, b) => b.relevance - a.relevance)
          .slice(0, 8);

        if (related.length > 0) {
          const section = `Files related to ${file}:\n${related.map((f) => `  - ${f.path} (relevance: ${(f.relevance * 100).toFixed(0)}%)`).join('\n')}`;
          sections.push(section);
          totalChars += section.length;
        }
      }

      if (totalChars < MAX_GRAPH_CONTEXT_CHARS) {
        const blast = query.getBlastRadius(file);
        if (blast.direct.length > 0) {
          const section = `Blast radius for ${file}: ${blast.direct.map((f) => f.path).slice(0, 5).join(', ')}${blast.direct.length > 5 ? ` (+${blast.direct.length - 5} more)` : ''}`;
          sections.push(section);
          totalChars += section.length;
        }
      }
    } catch {
      // Skip files not in the graph
    }
  }

  if (sections.length === 0) return null;
  const result = `## Codebase Context (PhantomOS AI Engine)\n${sections.join('\n\n')}`;
  return result.slice(0, MAX_GRAPH_CONTEXT_CHARS);
}

chatRoutes.post('/chat', async (c) => {
  const body = await c.req.json<ChatRequest>();
  const { message, model, context, cwd, projectContext } = body;

  if (!message?.trim()) {
    return c.json({ error: 'message is required' }, 400);
  }

  // Resolve projectId and inject graph context if available
  const projectId = body.projectId ?? (cwd ? resolveProjectIdFromCwd(cwd) : null);
  let enrichedContext = projectContext ?? '';

  if (projectId) {
    const graphCtx = buildGraphContext(projectId, message);
    if (graphCtx) {
      enrichedContext = enrichedContext
        ? `${enrichedContext}\n\n${graphCtx}`
        : graphCtx;
    }
  }

  const prompt = buildPrompt(message, context, enrichedContext || undefined);
  const modelFlag = model ?? 'sonnet';

  // Use stream-json output for real-time streaming
  // Do NOT use --bare (disables enterprise OAuth/keychain auth)
  // --dangerously-skip-permissions lets Claude read files/run commands when asked
  const args = [
    '-p', prompt,
    '--output-format', 'stream-json',
    '--verbose',
    '--model', modelFlag,
    '--no-session-persistence',
    '--dangerously-skip-permissions',
  ];

  const proc = spawn('claude', args, {
    cwd: cwd || process.env.HOME,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    start(controller) {
      let buffer = '';
      let fullText = '';
      let doneSent = false;

      const sendChunk = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
      };

      proc.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);

            // Extract text from assistant messages
            if (data.type === 'assistant' && data.message?.content) {
              for (const block of data.message.content) {
                if (block.type === 'text' && block.text) {
                  fullText += block.text;
                  sendChunk({ type: 'delta', content: block.text });
                }
              }
            }

            // Final result
            if (data.type === 'result') {
              const resultText = typeof data.result === 'string' ? data.result : '';
              if (resultText && !fullText) {
                sendChunk({ type: 'delta', content: resultText });
              }
              sendChunk({ type: 'done', content: resultText || fullText });
              doneSent = true;
            }
          } catch {
            // Skip non-JSON lines
          }
        }
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        logger.debug('Chat', `stderr: ${chunk.toString().trim()}`);
      });

      proc.on('close', (_code) => {
        // Process remaining buffer
        if (buffer.trim()) {
          try {
            const data = JSON.parse(buffer);
            if (data.type === 'result') {
              const resultText = typeof data.result === 'string' ? data.result : '';
              sendChunk({ type: 'done', content: resultText || fullText });
              doneSent = true;
            }
          } catch { /* skip */ }
        }
        // Ensure a done event is always sent
        if (!doneSent) {
          sendChunk({ type: 'done', content: fullText });
        }
        controller.close();
      });

      proc.on('error', (err) => {
        sendChunk({ type: 'error', message: err.message });
        controller.close();
      });
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Transfer-Encoding': 'chunked',
      'Cache-Control': 'no-cache',
    },
  });
});
