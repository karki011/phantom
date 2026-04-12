/**
 * PhantomOS Chat API — Stress Tests
 *
 * Exercises every chat route under concurrent / high-volume conditions.
 * Expects the Hono server to be running on localhost:3849.
 *
 * Run with:
 *   npx vitest run src/__stress__/chat.stress.test.ts --timeout 120000
 *
 * @author Subash Karki
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE = 'http://localhost:3849/api';

/** Helper: JSON POST */
async function post<T = unknown>(path: string, body: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as T;
  return { status: res.status, data };
}

/** Helper: JSON GET */
async function get<T = unknown>(path: string): Promise<{ status: number; data: T }> {
  const res = await fetch(`${BASE}${path}`);
  const data = (await res.json()) as T;
  return { status: res.status, data };
}

/** Helper: DELETE */
async function del<T = unknown>(path: string): Promise<{ status: number; data: T }> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' });
  const data = (await res.json()) as T;
  return { status: res.status, data };
}

/** Helper: create a conversation, return its id */
async function createConversation(overrides: Record<string, unknown> = {}): Promise<string> {
  const { data } = await post<{ id: string }>('/chat/conversations', {
    title: `stress-${randomUUID().slice(0, 8)}`,
    ...overrides,
  });
  return data.id;
}

/** Helper: build a message payload */
function makeMessage(conversationId: string, role: 'user' | 'assistant' = 'user', content?: string) {
  return {
    id: randomUUID(),
    conversationId,
    role,
    content: content ?? `msg-${randomUUID()}`,
    createdAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Bookkeeping — clean up conversations created during tests
// ---------------------------------------------------------------------------

const createdConversationIds: string[] = [];

afterEach(async () => {
  // Best-effort cleanup so failed tests don't leave junk
  const ids = createdConversationIds.splice(0);
  await Promise.allSettled(ids.map((id) => del(`/chat/conversations/${id}`)));
});

// ---------------------------------------------------------------------------
// Connectivity pre-check
// ---------------------------------------------------------------------------

beforeAll(async () => {
  try {
    await fetch(`${BASE}/chat/conversations`);
  } catch {
    throw new Error(
      `Server is not reachable at ${BASE}. Start the PhantomOS server first (port 3849).`,
    );
  }
});

// ============================================================================
// 1. Conversation CRUD flood
// ============================================================================

describe('1. Conversation CRUD flood', () => {
  it('should create 100 conversations simultaneously, all with unique IDs, then delete all', async () => {
    const COUNT = 100;

    // Create 100 in parallel
    const results = await Promise.all(
      Array.from({ length: COUNT }, () =>
        post<{ id: string }>('/chat/conversations', { title: `flood-${randomUUID().slice(0, 8)}` }),
      ),
    );

    const ids = results.map((r) => r.data.id);
    createdConversationIds.push(...ids);

    // All should succeed
    expect(results.every((r) => r.status === 201)).toBe(true);

    // All IDs unique
    const unique = new Set(ids);
    expect(unique.size).toBe(COUNT);

    // Delete all in parallel
    const delResults = await Promise.all(ids.map((id) => del(`/chat/conversations/${id}`)));
    expect(delResults.every((r) => r.status === 200)).toBe(true);

    // Clear bookkeeping since we already deleted
    createdConversationIds.length = 0;
  });
});

// ============================================================================
// 2. Message save bombardment
// ============================================================================

describe('2. Message save bombardment', () => {
  it('should save 500+ messages across 10 conversations concurrently', async () => {
    const CONV_COUNT = 10;
    const MSGS_PER_CONV = 50; // 10 * 50 = 500

    // Create conversations
    const convIds = await Promise.all(
      Array.from({ length: CONV_COUNT }, () => createConversation()),
    );
    createdConversationIds.push(...convIds);

    // Build batches — one POST /chat/save per conversation
    const saves = convIds.map((cid) => {
      const messages = Array.from({ length: MSGS_PER_CONV }, (_, i) =>
        makeMessage(cid, i % 2 === 0 ? 'user' : 'assistant'),
      );
      return post('/chat/save', { messages });
    });

    const results = await Promise.all(saves);
    expect(results.every((r) => r.status === 200)).toBe(true);

    // Verify counts via history
    const histories = await Promise.all(
      convIds.map((cid) =>
        get<unknown[]>(`/chat/history?conversationId=${cid}&limit=100`),
      ),
    );

    for (const h of histories) {
      expect(h.data.length).toBe(MSGS_PER_CONV);
    }
  });
});

// ============================================================================
// 3. History query under load
// ============================================================================

describe('3. History query under load', () => {
  it('should handle rapid polling (every 10ms for 5 seconds) across multiple conversations', { timeout: 15_000 }, async () => {
    const CONV_COUNT = 3;
    const DURATION_MS = 5_000;
    const INTERVAL_MS = 10;

    const convIds = await Promise.all(
      Array.from({ length: CONV_COUNT }, () => createConversation()),
    );
    createdConversationIds.push(...convIds);

    // Seed some messages
    await Promise.all(
      convIds.map((cid) =>
        post('/chat/save', {
          messages: Array.from({ length: 5 }, () => makeMessage(cid)),
        }),
      ),
    );

    // Rapid polling
    let successCount = 0;
    let errorCount = 0;
    const start = Date.now();

    const poller = async () => {
      while (Date.now() - start < DURATION_MS) {
        const cid = convIds[Math.floor(Math.random() * convIds.length)];
        try {
          const res = await fetch(`${BASE}/chat/history?conversationId=${cid}`);
          if (res.ok) successCount++;
          else errorCount++;
        } catch {
          errorCount++;
        }
        await new Promise((r) => setTimeout(r, INTERVAL_MS));
      }
    };

    // Run 3 pollers in parallel
    await Promise.all([poller(), poller(), poller()]);

    // Expect vast majority to succeed
    const total = successCount + errorCount;
    expect(total).toBeGreaterThan(0);
    expect(successCount / total).toBeGreaterThan(0.95);
  });
});

// ============================================================================
// 4. Concurrent read/write
// ============================================================================

describe('4. Concurrent read/write', () => {
  it('should handle creating conversations while simultaneously querying them', async () => {
    const worktreeId = `wt-stress-${randomUUID().slice(0, 8)}`;
    const ROUNDS = 30;

    const tasks: Promise<unknown>[] = [];

    for (let i = 0; i < ROUNDS; i++) {
      // Write
      tasks.push(
        post<{ id: string }>('/chat/conversations', { worktreeId, title: `rw-${i}` }).then((r) => {
          createdConversationIds.push(r.data.id);
          return r;
        }),
      );

      // Read
      tasks.push(get(`/chat/conversations?worktreeId=${worktreeId}`));
    }

    const results = await Promise.allSettled(tasks);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBe(results.length);
  });
});

// ============================================================================
// 5. Large message payloads
// ============================================================================

describe('5. Large message payloads', () => {
  it('should save messages with 100KB+ content without failure', async () => {
    const cid = await createConversation();
    createdConversationIds.push(cid);

    const largeContent = 'X'.repeat(150_000); // ~150 KB
    const msg = makeMessage(cid, 'user', largeContent);

    const { status } = await post('/chat/save', { messages: [msg] });
    expect(status).toBe(200);

    // Retrieve and verify
    const { data } = await get<Array<{ content: string }>>(
      `/chat/history?conversationId=${cid}`,
    );
    expect(data.length).toBe(1);
    expect(data[0].content.length).toBe(150_000);
  });

  it('should handle multiple large messages in a single save', async () => {
    const cid = await createConversation();
    createdConversationIds.push(cid);

    const messages = Array.from({ length: 10 }, () =>
      makeMessage(cid, 'user', 'Y'.repeat(100_000)),
    );

    const { status } = await post('/chat/save', { messages });
    expect(status).toBe(200);

    const { data } = await get<unknown[]>(`/chat/history?conversationId=${cid}&limit=100`);
    expect(data.length).toBe(10);
  });
});

// ============================================================================
// 6. Conversation cascade delete
// ============================================================================

describe('6. Conversation cascade delete', () => {
  it('should delete conversation and all 100 associated messages', async () => {
    const cid = await createConversation();
    // Don't push to createdConversationIds — we delete manually

    // Save 100 messages
    const messages = Array.from({ length: 100 }, (_, i) =>
      makeMessage(cid, i % 2 === 0 ? 'user' : 'assistant'),
    );
    await post('/chat/save', { messages });

    // Verify messages exist
    const before = await get<unknown[]>(`/chat/history?conversationId=${cid}&limit=200`);
    expect(before.data.length).toBe(100);

    // Delete conversation
    const { status } = await del(`/chat/conversations/${cid}`);
    expect(status).toBe(200);

    // Verify messages are gone
    const after = await get<unknown[]>(`/chat/history?conversationId=${cid}`);
    expect(after.data.length).toBe(0);
  });
});

// ============================================================================
// 7. Upload stress
// ============================================================================

describe('7. Upload stress', () => {
  it('should handle 20 concurrent file uploads with varying sizes (1KB to 5MB)', async () => {
    const sizes = Array.from({ length: 20 }, (_, i) => {
      // Spread from 1KB to 5MB
      const minBytes = 1024;
      const maxBytes = 5 * 1024 * 1024;
      return Math.floor(minBytes + (maxBytes - minBytes) * (i / 19));
    });

    const uploads = sizes.map(async (size, idx) => {
      const content = Buffer.alloc(size, 0x41 + (idx % 26)); // Fill with letters
      const blob = new Blob([content], { type: 'application/octet-stream' });
      const form = new FormData();
      form.append('file', blob, `stress-upload-${idx}.bin`);

      const res = await fetch(`${BASE}/chat/upload`, {
        method: 'POST',
        body: form,
      });

      return { status: res.status, data: await res.json(), expectedSize: size };
    });

    const results = await Promise.all(uploads);

    for (const r of results) {
      expect(r.status).toBe(200);
      expect((r.data as { size: number }).size).toBe(r.expectedSize);
    }
  });
});

// ============================================================================
// 8. Chat stream cancellation
// ============================================================================

describe('8. Chat stream cancellation', () => {
  it('should start 10 concurrent /chat streams and abort them mid-response without crashing server', async () => {
    const STREAM_COUNT = 10;

    const controllers = Array.from({ length: STREAM_COUNT }, () => new AbortController());

    const streams = controllers.map((ctrl, idx) =>
      fetch(`${BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `stress test prompt ${idx}: explain recursion` }),
        signal: ctrl.signal,
      }).catch((err) => {
        // AbortError is expected
        if (err.name === 'AbortError') return null;
        throw err;
      }),
    );

    // Abort all after 500ms
    setTimeout(() => {
      for (const ctrl of controllers) ctrl.abort();
    }, 500);

    const results = await Promise.allSettled(streams);

    // All should settle (fulfilled with null or actual response — no unhandled rejections)
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);

    // Server should still be healthy after aborts
    const health = await fetch(`${BASE}/chat/conversations`);
    expect(health.ok).toBe(true);
  });
});

// ============================================================================
// 9. Auto-title generation
// ============================================================================

describe('9. Auto-title generation', () => {
  it('should auto-update conversation title from first user message', async () => {
    const cid = await createConversation();
    createdConversationIds.push(cid);

    const userContent = 'How do I implement a binary search tree in TypeScript?';
    const messages = [
      makeMessage(cid, 'user', userContent),
      makeMessage(cid, 'assistant', 'Here is how you do it...'),
    ];

    await post('/chat/save', { messages });

    // Fetch the conversation to check the title
    const { data: convos } = await get<Array<{ id: string; title: string }>>(
      `/chat/conversations`,
    );
    const conv = convos.find((c) => c.id === cid);

    expect(conv).toBeDefined();
    // Title should have been updated from "New Chat" to something derived from the user message
    expect(conv!.title).not.toBe('New Chat');
    expect(conv!.title.length).toBeGreaterThan(0);
    expect(conv!.title.length).toBeLessThanOrEqual(63); // 60 chars + "..."
  });

  it('should NOT overwrite a custom title', async () => {
    const customTitle = 'My Important Chat';
    const { data } = await post<{ id: string }>('/chat/conversations', { title: customTitle });
    const cid = data.id;
    createdConversationIds.push(cid);

    await post('/chat/save', {
      messages: [makeMessage(cid, 'user', 'This should not become the title')],
    });

    const { data: convos } = await get<Array<{ id: string; title: string }>>(
      `/chat/conversations`,
    );
    const conv = convos.find((c) => c.id === cid);
    expect(conv!.title).toBe(customTitle);
  });
});

// ============================================================================
// 10. Orphan message handling
// ============================================================================

describe('10. Orphan message handling', () => {
  it('should save messages with non-existent conversationId without crashing', async () => {
    const fakeConvId = randomUUID();
    const messages = Array.from({ length: 20 }, () => makeMessage(fakeConvId));

    const { status } = await post('/chat/save', { messages });
    expect(status).toBe(200);

    // Clean up — messages exist in DB with orphaned conversationId
    // (No cascade delete since conversation doesn't exist — just verify no crash)
    const { data } = await get<unknown[]>(
      `/chat/history?conversationId=${fakeConvId}`,
    );
    expect(data.length).toBe(20);

    // Clean up orphan messages via history delete
    await del(`/chat/history?conversationId=${fakeConvId}`);
  });

  it('should handle rapid orphan message saves without accumulating errors', async () => {
    const orphanIds = Array.from({ length: 50 }, () => randomUUID());

    const results = await Promise.all(
      orphanIds.map((fakeId) =>
        post('/chat/save', { messages: [makeMessage(fakeId)] }),
      ),
    );

    expect(results.every((r) => r.status === 200)).toBe(true);

    // Clean up
    await Promise.all(
      orphanIds.map((fakeId) => del(`/chat/history?conversationId=${fakeId}`)),
    );
  });
});

// ============================================================================
// 11. Race condition: simultaneous deletes
// ============================================================================

describe('11. Race condition: simultaneous deletes', () => {
  it('should handle 10 concurrent deletes of the same conversation gracefully', async () => {
    const cid = await createConversation();

    // Save some messages so delete has work to do
    await post('/chat/save', {
      messages: Array.from({ length: 10 }, () => makeMessage(cid)),
    });

    // Fire 10 deletes simultaneously
    const results = await Promise.all(
      Array.from({ length: 10 }, () => del(`/chat/conversations/${cid}`)),
    );

    // All should return 200 (idempotent delete, no crash)
    expect(results.every((r) => r.status === 200)).toBe(true);

    // Conversation should be gone
    const { data } = await get<unknown[]>(`/chat/history?conversationId=${cid}`);
    expect(data.length).toBe(0);
  });

  it('should handle deleting a non-existent conversation without error', async () => {
    const fakeId = randomUUID();
    const { status } = await del(`/chat/conversations/${fakeId}`);
    expect(status).toBe(200);
  });
});

// ============================================================================
// 12. Empty/null field handling
// ============================================================================

describe('12. Empty/null field handling', () => {
  it('should reject POST /chat with empty message', async () => {
    const { status } = await post<{ error?: string }>('/chat', { message: '' });
    expect(status).toBe(400);
  });

  it('should reject POST /chat with whitespace-only message', async () => {
    const { status } = await post<{ error?: string }>('/chat', { message: '   ' });
    expect(status).toBe(400);
  });

  it('should create conversation with null/missing optional fields', async () => {
    const { status, data } = await post<{ id: string; title: string; model: string }>(
      '/chat/conversations',
      {},
    );
    createdConversationIds.push(data.id);

    expect(status).toBe(201);
    expect(data.id).toBeDefined();
    expect(data.title).toBe('New Chat');
    expect(data.model).toBe('sonnet');
  });

  it('should handle save with empty messages array', async () => {
    const { status } = await post('/chat/save', { messages: [] });
    expect(status).toBe(200);
  });

  it('should handle POST /chat/conversations with explicit null values', async () => {
    const { status, data } = await post<{ id: string }>(
      '/chat/conversations',
      { worktreeId: null, title: null, model: null },
    );
    createdConversationIds.push(data.id);
    expect(status).toBe(201);
    expect(data.id).toBeDefined();
  });
});

// ============================================================================
// 13. Worktree isolation
// ============================================================================

describe('13. Worktree isolation', () => {
  it('should isolate conversations by worktreeId', async () => {
    const wt1 = `wt-iso-${randomUUID().slice(0, 8)}`;
    const wt2 = `wt-iso-${randomUUID().slice(0, 8)}`;

    // Create 5 conversations per worktree
    const ids1 = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        post<{ id: string }>('/chat/conversations', { worktreeId: wt1, title: `wt1-${i}` }).then((r) => r.data.id),
      ),
    );
    const ids2 = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        post<{ id: string }>('/chat/conversations', { worktreeId: wt2, title: `wt2-${i}` }).then((r) => r.data.id),
      ),
    );
    createdConversationIds.push(...ids1, ...ids2);

    // Query each worktree — should see exactly its own
    const { data: list1 } = await get<Array<{ id: string }>>(
      `/chat/conversations?worktreeId=${wt1}`,
    );
    const { data: list2 } = await get<Array<{ id: string }>>(
      `/chat/conversations?worktreeId=${wt2}`,
    );

    expect(list1.length).toBe(5);
    expect(list2.length).toBe(5);

    // No overlap
    const set1 = new Set(list1.map((c) => c.id));
    const set2 = new Set(list2.map((c) => c.id));
    for (const id of set1) {
      expect(set2.has(id)).toBe(false);
    }
  });

  it('should isolate message history by worktreeId', async () => {
    const wt1 = `wt-msg-${randomUUID().slice(0, 8)}`;
    const wt2 = `wt-msg-${randomUUID().slice(0, 8)}`;

    const cid1 = await createConversation({ worktreeId: wt1 });
    const cid2 = await createConversation({ worktreeId: wt2 });
    createdConversationIds.push(cid1, cid2);

    // Save messages to each
    await Promise.all([
      post('/chat/save', {
        messages: Array.from({ length: 3 }, () => ({
          ...makeMessage(cid1),
          worktreeId: wt1,
        })),
      }),
      post('/chat/save', {
        messages: Array.from({ length: 7 }, () => ({
          ...makeMessage(cid2),
          worktreeId: wt2,
        })),
      }),
    ]);

    // Query by worktreeId
    const { data: h1 } = await get<unknown[]>(`/chat/history?worktreeId=${wt1}`);
    const { data: h2 } = await get<unknown[]>(`/chat/history?worktreeId=${wt2}`);

    expect(h1.length).toBe(3);
    expect(h2.length).toBe(7);
  });

  it('should cascade-clear all conversations and messages for a worktree', async () => {
    const wt = `wt-clear-${randomUUID().slice(0, 8)}`;

    const ids = await Promise.all(
      Array.from({ length: 3 }, () => createConversation({ worktreeId: wt })),
    );

    // Save messages
    await Promise.all(
      ids.map((cid) =>
        post('/chat/save', {
          messages: Array.from({ length: 5 }, () => ({
            ...makeMessage(cid),
            worktreeId: wt,
          })),
        }),
      ),
    );

    // Clear entire worktree history
    const { status } = await del(`/chat/history?worktreeId=${wt}`);
    expect(status).toBe(200);

    // Verify everything is gone
    const { data: convos } = await get<unknown[]>(`/chat/conversations?worktreeId=${wt}`);
    const { data: msgs } = await get<unknown[]>(`/chat/history?worktreeId=${wt}`);
    expect(convos.length).toBe(0);
    expect(msgs.length).toBe(0);
  });
});

// ============================================================================
// Bonus: Stress combo — interleaved CRUD operations
// ============================================================================

describe('Bonus: Interleaved CRUD stress combo', () => {
  it('should survive 200 interleaved create/save/query/delete operations', async () => {
    const OPS = 200;
    const activeIds: string[] = [];
    let errors = 0;

    const ops = Array.from({ length: OPS }, async (_, i) => {
      try {
        const action = i % 4;
        switch (action) {
          case 0: {
            // Create
            const id = await createConversation();
            activeIds.push(id);
            break;
          }
          case 1: {
            // Save message to random conversation
            if (activeIds.length > 0) {
              const cid = activeIds[Math.floor(Math.random() * activeIds.length)];
              await post('/chat/save', { messages: [makeMessage(cid)] });
            }
            break;
          }
          case 2: {
            // Query
            if (activeIds.length > 0) {
              const cid = activeIds[Math.floor(Math.random() * activeIds.length)];
              await get(`/chat/history?conversationId=${cid}`);
            }
            break;
          }
          case 3: {
            // Delete oldest
            const id = activeIds.shift();
            if (id) await del(`/chat/conversations/${id}`);
            break;
          }
        }
      } catch {
        errors++;
      }
    });

    await Promise.all(ops);

    // Clean remaining
    createdConversationIds.push(...activeIds);

    // Allow up to 5% error rate under heavy contention
    expect(errors / OPS).toBeLessThan(0.05);
  });
});
