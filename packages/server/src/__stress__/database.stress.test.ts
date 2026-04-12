/**
 * PhantomOS Database Stress Tests
 *
 * Validates SQLite (better-sqlite3 + Drizzle ORM + WAL mode) concurrency,
 * integrity, and edge-case handling against the running PhantomOS server.
 *
 * Prerequisites:
 *   - Server running on localhost:3849
 *   - WAL mode enabled on the SQLite database
 *
 * Run:
 *   npx vitest run src/__stress__/database.stress.test.ts --timeout 120000
 *
 * @author Subash Karki
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE = 'http://localhost:3849/api';

/** Fire N concurrent requests, return settled results with timing */
async function concurrent<T>(
  n: number,
  factory: (index: number) => Promise<T>,
): Promise<{ results: PromiseSettledResult<T>[]; durationMs: number }> {
  const start = performance.now();
  const results = await Promise.allSettled(
    Array.from({ length: n }, (_, i) => factory(i)),
  );
  const durationMs = Math.round(performance.now() - start);
  return { results, durationMs };
}

/** Count fulfilled / rejected from settled results */
function tally<T>(results: PromiseSettledResult<T>[]) {
  let fulfilled = 0;
  let rejected = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') fulfilled++;
    else rejected++;
  }
  return { fulfilled, rejected, total: results.length };
}

/** Fetch helper that throws on non-2xx */
async function safeFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${url} — ${body.slice(0, 200)}`);
  }
  return res;
}

// ---------------------------------------------------------------------------
// Helpers — create / delete conversations for test isolation
// ---------------------------------------------------------------------------

const createdConversationIds: string[] = [];
const createdPrefKeys: string[] = [];
const createdPaneWorktreeIds: string[] = [];

async function createConversation(title?: string): Promise<string> {
  const res = await safeFetch(`${BASE}/chat/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title ?? `stress-${randomUUID().slice(0, 8)}` }),
  });
  const data = (await res.json()) as { id: string };
  createdConversationIds.push(data.id);
  return data.id;
}

async function deleteConversation(id: string): Promise<void> {
  await fetch(`${BASE}/chat/conversations/${id}`, { method: 'DELETE' });
}

async function cleanupPrefs(): Promise<void> {
  for (const key of createdPrefKeys) {
    // No dedicated DELETE route — just leave them; they're harmless test keys
  }
}

async function cleanupPanes(): Promise<void> {
  for (const id of createdPaneWorktreeIds) {
    await fetch(`${BASE}/pane-states/${id}`, { method: 'DELETE' }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Global setup / teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // Verify server is reachable
  try {
    const res = await fetch(`${BASE}/stats`);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
  } catch (err) {
    throw new Error(
      `PhantomOS server not reachable at ${BASE}. Start it first.\n${String(err)}`,
    );
  }
});

afterAll(async () => {
  // Best-effort cleanup
  for (const id of createdConversationIds) {
    await deleteConversation(id).catch(() => {});
  }
  await cleanupPrefs();
  await cleanupPanes();
});

// ===========================================================================
// 1. Concurrent Reads
// ===========================================================================

describe('1. Concurrent reads', () => {
  it('should handle 200 simultaneous GET requests without BUSY errors', async () => {
    const endpoints = [
      `${BASE}/sessions`,
      `${BASE}/stats`,
      `${BASE}/achievements`,
      `${BASE}/hunter`,
    ];

    const { results, durationMs } = await concurrent(200, async (i) => {
      const url = endpoints[i % endpoints.length];
      const res = await safeFetch(url);
      const json = await res.json();
      return { url, json };
    });

    const { fulfilled, rejected } = tally(results);

    console.log(`[1] Concurrent reads: ${fulfilled}/${results.length} ok in ${durationMs}ms`);

    // Every single request must succeed
    expect(rejected).toBe(0);
    expect(fulfilled).toBe(200);

    // Verify all returned valid JSON (not an error object with "BUSY")
    for (const r of results) {
      if (r.status === 'fulfilled') {
        const body = JSON.stringify(r.value.json);
        expect(body).not.toContain('SQLITE_BUSY');
        expect(body).not.toContain('database is locked');
      }
    }
  }, 30_000);
});

// ===========================================================================
// 2. Concurrent Writes
// ===========================================================================

describe('2. Concurrent writes', () => {
  it('should handle 50 concurrent preference upserts', async () => {
    const keys = Array.from({ length: 50 }, (_, i) => `stress-pref-${randomUUID().slice(0, 8)}-${i}`);
    createdPrefKeys.push(...keys);

    const { results, durationMs } = await concurrent(50, async (i) => {
      const res = await safeFetch(`${BASE}/preferences/${keys[i]}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: `val-${i}` }),
      });
      return res.json();
    });

    const { fulfilled, rejected } = tally(results);
    console.log(`[2] Concurrent writes: ${fulfilled}/${results.length} ok in ${durationMs}ms`);

    expect(rejected).toBe(0);
    expect(fulfilled).toBe(50);

    // Verify all values persisted
    const prefsRes = await safeFetch(`${BASE}/preferences`);
    const prefs = (await prefsRes.json()) as Record<string, string>;

    for (let i = 0; i < 50; i++) {
      expect(prefs[keys[i]]).toBe(`val-${i}`);
    }
  }, 30_000);
});

// ===========================================================================
// 3. Read-Write Interleave
// ===========================================================================

describe('3. Read-write interleave', () => {
  it('should handle 100 readers + 50 writers simultaneously', async () => {
    const testKey = `stress-rw-${randomUUID().slice(0, 8)}`;
    createdPrefKeys.push(testKey);

    const readers = Array.from({ length: 100 }, () => async () => {
      const res = await safeFetch(`${BASE}/stats`);
      return res.json();
    });

    const writers = Array.from({ length: 50 }, (_, i) => async () => {
      const res = await safeFetch(`${BASE}/preferences/${testKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: `rw-${i}` }),
      });
      return res.json();
    });

    const allOps = [...readers, ...writers].map((fn) => fn());
    const start = performance.now();
    const results = await Promise.allSettled(allOps);
    const durationMs = Math.round(performance.now() - start);

    const { fulfilled, rejected } = tally(results);
    console.log(`[3] Read-write interleave: ${fulfilled}/${results.length} ok in ${durationMs}ms`);

    expect(rejected).toBe(0);
    expect(fulfilled).toBe(150);
  }, 30_000);
});

// ===========================================================================
// 4. Rapid Pane State Thrash
// ===========================================================================

describe('4. Rapid pane state thrash', () => {
  it('should handle 100 concurrent PUT+GET cycles on the same worktreeId', async () => {
    const worktreeId = `stress-pane-${randomUUID().slice(0, 8)}`;
    createdPaneWorktreeIds.push(worktreeId);

    const { results, durationMs } = await concurrent(100, async (i) => {
      // Write
      await safeFetch(`${BASE}/pane-states/${worktreeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tabs: [{ id: i, name: `tab-${i}` }], active: i }),
      });

      // Read
      const res = await safeFetch(`${BASE}/pane-states/${worktreeId}`);
      const json = await res.json();
      return json;
    });

    const { fulfilled, rejected } = tally(results);
    console.log(`[4] Pane state thrash: ${fulfilled}/${results.length} ok in ${durationMs}ms`);

    expect(rejected).toBe(0);
    expect(fulfilled).toBe(100);

    // Final read should return valid JSON with "tabs" and "active" keys
    const finalRes = await safeFetch(`${BASE}/pane-states/${worktreeId}`);
    const finalState = (await finalRes.json()) as { tabs: unknown[]; active: number };
    expect(finalState).toHaveProperty('tabs');
    expect(finalState).toHaveProperty('active');
    expect(Array.isArray(finalState.tabs)).toBe(true);
  }, 30_000);
});

// ===========================================================================
// 5. Chat Message Write Burst
// ===========================================================================

describe('5. Chat message write burst', () => {
  it('should persist 100 concurrent chat messages with onConflictDoNothing', async () => {
    const convId = await createConversation('stress-burst');

    const messageIds = Array.from({ length: 100 }, () => randomUUID());

    const { results, durationMs } = await concurrent(100, async (i) => {
      const res = await safeFetch(`${BASE}/chat/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              id: messageIds[i],
              conversationId: convId,
              role: i % 2 === 0 ? 'user' : 'assistant',
              content: `Stress message #${i}: ${randomUUID()}`,
              createdAt: Date.now() + i,
            },
          ],
        }),
      });
      return res.json();
    });

    const { fulfilled, rejected } = tally(results);
    console.log(`[5] Chat write burst: ${fulfilled}/${results.length} ok in ${durationMs}ms`);

    expect(rejected).toBe(0);
    expect(fulfilled).toBe(100);

    // Verify all messages persisted
    const histRes = await safeFetch(
      `${BASE}/chat/history?conversationId=${convId}&limit=200`,
    );
    const history = (await histRes.json()) as { id: string }[];

    const persistedIds = new Set(history.map((m) => m.id));
    let missing = 0;
    for (const id of messageIds) {
      if (!persistedIds.has(id)) missing++;
    }

    console.log(`[5] Persisted: ${persistedIds.size}/${messageIds.length}, missing: ${missing}`);
    expect(missing).toBe(0);
  }, 30_000);
});

// ===========================================================================
// 6. Stats Consistency
// ===========================================================================

describe('6. Stats consistency', () => {
  it('should return valid stats while conversations are being created', async () => {
    const statsReads = Array.from({ length: 50 }, () => async () => {
      const res = await safeFetch(`${BASE}/stats`);
      return (await res.json()) as Record<string, number>;
    });

    const convCreates = Array.from({ length: 20 }, () => async () => {
      return createConversation('stress-stats');
    });

    const allOps = [...statsReads.map((fn) => fn()), ...convCreates.map((fn) => fn())];
    const start = performance.now();
    const results = await Promise.allSettled(allOps);
    const durationMs = Math.round(performance.now() - start);

    const { fulfilled, rejected } = tally(results);
    console.log(`[6] Stats consistency: ${fulfilled}/${results.length} ok in ${durationMs}ms`);

    expect(rejected).toBe(0);

    // Validate stats shape — no field should be undefined, NaN, or negative
    for (let i = 0; i < 50; i++) {
      const r = results[i];
      if (r.status === 'fulfilled') {
        const stats = r.value as Record<string, number>;
        for (const [key, val] of Object.entries(stats)) {
          expect(typeof val).toBe('number');
          expect(Number.isNaN(val)).toBe(false);
          expect(val).toBeGreaterThanOrEqual(0);
        }
      }
    }
  }, 30_000);
});

// ===========================================================================
// 7. Large Batch Insert
// ===========================================================================

describe('7. Large batch insert', () => {
  it('should insert 200 messages in a single POST and query all back', async () => {
    const convId = await createConversation('stress-batch');
    const messageIds = Array.from({ length: 200 }, () => randomUUID());

    const messages = messageIds.map((id, i) => ({
      id,
      conversationId: convId,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Batch message #${i}: ${randomUUID()} ${'x'.repeat(100)}`,
      createdAt: Date.now() + i,
    }));

    const start = performance.now();
    const res = await safeFetch(`${BASE}/chat/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });
    const saveResult = await res.json();
    const writeDuration = Math.round(performance.now() - start);

    expect(saveResult).toHaveProperty('ok', true);

    // Query history
    const readStart = performance.now();
    const histRes = await safeFetch(
      `${BASE}/chat/history?conversationId=${convId}&limit=500`,
    );
    const history = (await histRes.json()) as { id: string }[];
    const readDuration = Math.round(performance.now() - readStart);

    console.log(`[7] Batch insert: wrote 200 in ${writeDuration}ms, read ${history.length} in ${readDuration}ms`);

    const persistedIds = new Set(history.map((m) => m.id));
    let missing = 0;
    for (const id of messageIds) {
      if (!persistedIds.has(id)) missing++;
    }

    expect(missing).toBe(0);
    expect(history.length).toBe(200);
  }, 30_000);
});

// ===========================================================================
// 8. Delete During Read
// ===========================================================================

describe('8. Delete during read', () => {
  it('should not error when deleting conversations during reads', async () => {
    // Create conversations to delete
    const ids = await Promise.all(
      Array.from({ length: 10 }, () => createConversation('stress-delete-read')),
    );

    // Save some messages to each
    await Promise.all(
      ids.map((convId, i) =>
        safeFetch(`${BASE}/chat/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: Array.from({ length: 5 }, (_, j) => ({
              id: randomUUID(),
              conversationId: convId,
              role: j % 2 === 0 ? 'user' : 'assistant',
              content: `Delete-read test msg ${i}-${j}`,
              createdAt: Date.now() + j,
            })),
          }),
        }),
      ),
    );

    // Simultaneously read sessions and delete conversations
    const readers = Array.from({ length: 20 }, () => async () => {
      const res = await fetch(`${BASE}/sessions?limit=100`);
      return res.status;
    });

    const deleters = ids.map((id) => async () => {
      const res = await fetch(`${BASE}/chat/conversations/${id}`, {
        method: 'DELETE',
      });
      return res.status;
    });

    const allOps = [...readers.map((fn) => fn()), ...deleters.map((fn) => fn())];
    const start = performance.now();
    const results = await Promise.allSettled(allOps);
    const durationMs = Math.round(performance.now() - start);

    const { fulfilled, rejected } = tally(results);
    console.log(`[8] Delete during read: ${fulfilled}/${results.length} ok in ${durationMs}ms`);

    // None should throw — both reads and deletes should succeed or return gracefully
    expect(rejected).toBe(0);

    // Remove from cleanup list since we already deleted
    for (const id of ids) {
      const idx = createdConversationIds.indexOf(id);
      if (idx !== -1) createdConversationIds.splice(idx, 1);
    }
  }, 30_000);
});

// ===========================================================================
// 9. WAL Stress
// ===========================================================================

describe('9. WAL stress', () => {
  it('should handle 500 rapid writes then verify integrity', async () => {
    const testPrefix = `wal-stress-${randomUUID().slice(0, 6)}`;
    const convId = await createConversation(`${testPrefix}-conv`);

    // 250 preference writes + 250 chat message writes = 500 total
    const prefKeys: string[] = [];
    const msgIds: string[] = [];

    const { results, durationMs } = await concurrent(500, async (i) => {
      if (i < 250) {
        // Preference write
        const key = `${testPrefix}-pref-${i}`;
        prefKeys.push(key);
        createdPrefKeys.push(key);
        await safeFetch(`${BASE}/preferences/${key}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: `wal-${i}` }),
        });
        return { type: 'pref', key };
      } else {
        // Chat write
        const msgId = randomUUID();
        msgIds.push(msgId);
        await safeFetch(`${BASE}/chat/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              {
                id: msgId,
                conversationId: convId,
                role: i % 2 === 0 ? 'user' : 'assistant',
                content: `WAL stress #${i}`,
                createdAt: Date.now() + i,
              },
            ],
          }),
        });
        return { type: 'chat', id: msgId };
      }
    });

    const { fulfilled, rejected } = tally(results);
    console.log(`[9] WAL stress: ${fulfilled}/${results.length} ok in ${durationMs}ms`);

    expect(rejected).toBe(0);
    expect(fulfilled).toBe(500);

    // Verify preferences
    const prefsRes = await safeFetch(`${BASE}/preferences`);
    const prefs = (await prefsRes.json()) as Record<string, string>;

    let prefMissing = 0;
    for (let i = 0; i < 250; i++) {
      if (prefs[`${testPrefix}-pref-${i}`] !== `wal-${i}`) prefMissing++;
    }

    // Verify chat messages
    const histRes = await safeFetch(
      `${BASE}/chat/history?conversationId=${convId}&limit=500`,
    );
    const history = (await histRes.json()) as { id: string }[];
    const persistedMsgIds = new Set(history.map((m) => m.id));

    let chatMissing = 0;
    for (const id of msgIds) {
      if (!persistedMsgIds.has(id)) chatMissing++;
    }

    console.log(
      `[9] Integrity: prefs missing=${prefMissing}/250, chat missing=${chatMissing}/${msgIds.length}`,
    );

    expect(prefMissing).toBe(0);
    expect(chatMissing).toBe(0);
  }, 60_000);
});

// ===========================================================================
// 10. Query Parameter Edge Cases
// ===========================================================================

describe('10. Query parameter edge cases', () => {
  it('GET /sessions?limit=0 should not error', async () => {
    const res = await fetch(`${BASE}/sessions?limit=0`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it('GET /sessions?limit=-1 should not error', async () => {
    const res = await fetch(`${BASE}/sessions?limit=-1`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it('GET /sessions?limit=99999999 should not error', async () => {
    const res = await fetch(`${BASE}/sessions?limit=99999999`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it('GET /sessions?search= (empty) should not error', async () => {
    const res = await fetch(`${BASE}/sessions?search=`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it('GET /sessions?search=%00%00 (null bytes) should not error', async () => {
    const res = await fetch(`${BASE}/sessions?search=%00%00`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it('GET /chat/history?limit=0 should not error', async () => {
    const res = await fetch(`${BASE}/chat/history?limit=0`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it('GET /sessions with all edge-case params concurrently', async () => {
    const urls = [
      `${BASE}/sessions?limit=0`,
      `${BASE}/sessions?limit=-1`,
      `${BASE}/sessions?limit=99999999`,
      `${BASE}/sessions?search=`,
      `${BASE}/sessions?search=%00%00`,
      `${BASE}/sessions?search=${encodeURIComponent("'; DROP TABLE sessions; --")}`,
      `${BASE}/sessions?limit=NaN`,
      `${BASE}/sessions?limit=undefined`,
      `${BASE}/chat/history?limit=0`,
      `${BASE}/chat/history?limit=-1`,
    ];

    const { results, durationMs } = await concurrent(urls.length, async (i) => {
      const res = await fetch(urls[i]);
      return { status: res.status, ok: res.ok };
    });

    const { fulfilled, rejected } = tally(results);
    console.log(`[10] Edge cases: ${fulfilled}/${results.length} ok in ${durationMs}ms`);

    // None should cause a server crash
    expect(rejected).toBe(0);

    // All should return 2xx (server should handle gracefully)
    for (const r of results) {
      if (r.status === 'fulfilled') {
        expect(r.value.ok).toBe(true);
      }
    }
  });
});

// ===========================================================================
// 11. ID Collision Handling
// ===========================================================================

describe('11. ID collision handling', () => {
  it('should handle duplicate message IDs with onConflictDoNothing', async () => {
    const convId = await createConversation('stress-collision');
    const duplicateId = randomUUID();

    // First insert
    const res1 = await safeFetch(`${BASE}/chat/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          {
            id: duplicateId,
            conversationId: convId,
            role: 'user',
            content: 'First message with this ID',
            createdAt: Date.now(),
          },
        ],
      }),
    });
    expect(res1.ok).toBe(true);

    // Second insert with same ID — should not error (onConflictDoNothing)
    const res2 = await safeFetch(`${BASE}/chat/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          {
            id: duplicateId,
            conversationId: convId,
            role: 'user',
            content: 'DIFFERENT content, same ID',
            createdAt: Date.now() + 1000,
          },
        ],
      }),
    });
    expect(res2.ok).toBe(true);

    // Original content should be preserved (DoNothing = keep first)
    const histRes = await safeFetch(
      `${BASE}/chat/history?conversationId=${convId}&limit=100`,
    );
    const history = (await histRes.json()) as { id: string; content: string }[];

    const dupeMsg = history.find((m) => m.id === duplicateId);
    expect(dupeMsg).toBeDefined();
    expect(dupeMsg!.content).toBe('First message with this ID');
  });

  it('should handle 50 concurrent inserts with the same message ID', async () => {
    const convId = await createConversation('stress-collision-concurrent');
    const sameId = randomUUID();

    const { results, durationMs } = await concurrent(50, async (i) => {
      const res = await fetch(`${BASE}/chat/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            {
              id: sameId,
              conversationId: convId,
              role: 'user',
              content: `Collision attempt #${i}`,
              createdAt: Date.now() + i,
            },
          ],
        }),
      });
      return { status: res.status, ok: res.ok };
    });

    const { fulfilled, rejected } = tally(results);
    console.log(`[11] ID collision (concurrent): ${fulfilled}/${results.length} ok in ${durationMs}ms`);

    expect(rejected).toBe(0);

    // All requests should return 2xx
    for (const r of results) {
      if (r.status === 'fulfilled') {
        expect(r.value.ok).toBe(true);
      }
    }

    // Only one message with that ID should exist
    const histRes = await safeFetch(
      `${BASE}/chat/history?conversationId=${convId}&limit=100`,
    );
    const history = (await histRes.json()) as { id: string }[];
    const matches = history.filter((m) => m.id === sameId);
    expect(matches.length).toBe(1);
  });
});

// ===========================================================================
// 12. Concurrent Conversation Cleanup
// ===========================================================================

describe('12. Concurrent conversation cleanup', () => {
  it('should delete 50 conversations simultaneously without errors', async () => {
    // Create 50 conversations
    const ids = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        createConversation(`stress-cleanup-${i}`),
      ),
    );

    // Add messages to each (to test cascading delete)
    await Promise.all(
      ids.map((convId, i) =>
        safeFetch(`${BASE}/chat/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [
              {
                id: randomUUID(),
                conversationId: convId,
                role: 'user',
                content: `Cleanup test ${i}`,
                createdAt: Date.now(),
              },
            ],
          }),
        }),
      ),
    );

    // Delete all 50 simultaneously
    const { results, durationMs } = await concurrent(50, async (i) => {
      const res = await fetch(`${BASE}/chat/conversations/${ids[i]}`, {
        method: 'DELETE',
      });
      return { status: res.status, ok: res.ok };
    });

    const { fulfilled, rejected } = tally(results);
    console.log(`[12] Concurrent cleanup: ${fulfilled}/${results.length} ok in ${durationMs}ms`);

    expect(rejected).toBe(0);

    // All should return 2xx
    for (const r of results) {
      if (r.status === 'fulfilled') {
        expect(r.value.ok).toBe(true);
      }
    }

    // Verify all conversations are actually gone
    const convsRes = await safeFetch(`${BASE}/chat/conversations?limit=1000`);
    const convs = (await convsRes.json()) as { id: string }[];
    const remainingIds = new Set(convs.map((c) => c.id));

    let stillPresent = 0;
    for (const id of ids) {
      if (remainingIds.has(id)) stillPresent++;
    }

    console.log(`[12] Remaining after cleanup: ${stillPresent}/${ids.length}`);
    expect(stillPresent).toBe(0);

    // Remove from global cleanup list
    for (const id of ids) {
      const idx = createdConversationIds.indexOf(id);
      if (idx !== -1) createdConversationIds.splice(idx, 1);
    }
  }, 30_000);
});
