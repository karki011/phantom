/**
 * PhantomOS Chat Routes — Talk to Claude via CLI pipe
 * Uses `claude -p` with JSON output for reliable responses.
 * Includes chat history persistence, worktree context, and conversation management.
 * @author Subash Karki
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { desc, eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { db, chatMessages, chatConversations } from '@phantom-os/db';
import { logger } from '../logger.js';

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
  projectContext?: string;  // e.g. "Project: feature-web-apps, Branch: test, Path: /Users/.../repo"
}

/**
 * Build the prompt for multi-turn by including previous context
 * and optional project context.
 */
const buildPrompt = (message: string, context?: ChatMessage[], projectContext?: string): string => {
  let prompt = '';

  if (projectContext) {
    prompt += `Context: You are helping with a project. ${projectContext}\n\n`;
  }

  if (context && context.length > 0) {
    const transcript = context
      .map((msg) => `${msg.role === 'user' ? 'Human' : 'Assistant'}: ${msg.content}`)
      .join('\n\n');
    prompt += `${transcript}\n\nHuman: ${message}`;
  } else {
    prompt += message;
  }

  return prompt;
};

// ---------------------------------------------------------------------------
// Conversation CRUD
// ---------------------------------------------------------------------------

/** GET /chat/conversations — List conversations for a worktree */
chatRoutes.get('/chat/conversations', (c) => {
  const workspaceId = c.req.query('workspaceId') ?? null;
  const limit = Number(c.req.query('limit')) || 20;

  const rows = workspaceId
    ? db.select().from(chatConversations).where(eq(chatConversations.workspaceId, workspaceId)).orderBy(desc(chatConversations.updatedAt)).limit(limit).all()
    : db.select().from(chatConversations).where(sql`${chatConversations.workspaceId} IS NULL`).orderBy(desc(chatConversations.updatedAt)).limit(limit).all();

  return c.json(rows);
});

/** POST /chat/conversations — Create a new conversation */
chatRoutes.post('/chat/conversations', async (c) => {
  const body = await c.req.json<{ workspaceId?: string; title?: string; model?: string }>();
  const id = randomUUID();
  const now = Date.now();

  db.insert(chatConversations).values({
    id,
    workspaceId: body.workspaceId ?? null,
    title: body.title ?? 'New Chat',
    model: body.model ?? 'sonnet',
    createdAt: now,
    updatedAt: now,
  }).run();

  return c.json({ id, workspaceId: body.workspaceId ?? null, title: body.title ?? 'New Chat', model: body.model ?? 'sonnet', createdAt: now, updatedAt: now }, 201);
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
  const workspaceId = c.req.query('workspaceId') ?? null;
  const limit = Number(c.req.query('limit')) || 50;

  let rows;
  if (conversationId) {
    rows = db.select().from(chatMessages).where(eq(chatMessages.conversationId, conversationId)).orderBy(desc(chatMessages.createdAt)).limit(limit).all();
  } else if (workspaceId) {
    rows = db.select().from(chatMessages).where(eq(chatMessages.workspaceId, workspaceId)).orderBy(desc(chatMessages.createdAt)).limit(limit).all();
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
      workspaceId: msg.workspaceId ?? null,
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
  const workspaceId = c.req.query('workspaceId') ?? null;

  if (conversationId) {
    db.delete(chatMessages).where(eq(chatMessages.conversationId, conversationId)).run();
    db.delete(chatConversations).where(eq(chatConversations.id, conversationId)).run();
  } else if (workspaceId) {
    // Delete all conversations + messages for worktree
    const convs = db.select({ id: chatConversations.id }).from(chatConversations).where(eq(chatConversations.workspaceId, workspaceId)).all();
    for (const conv of convs) {
      db.delete(chatMessages).where(eq(chatMessages.conversationId, conv.id)).run();
    }
    db.delete(chatConversations).where(eq(chatConversations.workspaceId, workspaceId)).run();
    db.delete(chatMessages).where(eq(chatMessages.workspaceId, workspaceId)).run();
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

chatRoutes.post('/chat', async (c) => {
  const body = await c.req.json<ChatRequest>();
  const { message, model, context, cwd, projectContext } = body;

  if (!message?.trim()) {
    return c.json({ error: 'message is required' }, 400);
  }

  const prompt = buildPrompt(message, context, projectContext);
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
