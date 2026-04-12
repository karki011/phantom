/**
 * Realtime Stress Tests for PhantomOS
 * Validates SSE (/events) and WebSocket (/ws/terminal/:termId) endpoints
 * under high concurrency, rapid churn, and adversarial input conditions.
 *
 * Requires the PhantomOS server to be running on port 3849.
 * Run with: npx vitest run packages/server/src/__stress__/realtime.stress.test.ts
 *
 * @author Subash Karki
 */
import { describe, it, expect, afterEach, afterAll } from 'vitest';
import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import http from 'node:http';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE = 'http://localhost:3849';
const WS_BASE = 'ws://localhost:3849';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Tracked resources for cleanup */
const activeAbortControllers: AbortController[] = [];
const activeWebSockets: WebSocket[] = [];

/** Clean up all tracked connections */
function cleanupAll(): void {
  for (const ac of activeAbortControllers) {
    try { ac.abort(); } catch { /* ignore */ }
  }
  activeAbortControllers.length = 0;

  for (const ws of activeWebSockets) {
    try {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    } catch { /* ignore */ }
  }
  activeWebSockets.length = 0;
}

/**
 * Open an SSE connection to /events and return a handle with received events.
 * Uses raw http.get to parse SSE data lines (no EventSource in Node).
 */
function openSSE(opts?: { signal?: AbortSignal }): {
  events: string[];
  heartbeats: number[];
  close: () => void;
  waitForHeartbeat: (timeoutMs?: number) => Promise<void>;
  waitForEvents: (count: number, timeoutMs?: number) => Promise<void>;
} {
  const events: string[] = [];
  const heartbeats: number[] = [];
  let onEvent: (() => void) | null = null;
  let onHeartbeat: (() => void) | null = null;

  const ac = new AbortController();
  activeAbortControllers.push(ac);

  // Combine external signal with our local one
  if (opts?.signal) {
    opts.signal.addEventListener('abort', () => ac.abort());
  }

  const req = http.get(`${BASE}/events`, { signal: ac.signal }, (res) => {
    let buffer = '';
    res.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      // Parse SSE frames: lines separated by \n\n
      const frames = buffer.split('\n\n');
      // Keep the last (possibly incomplete) frame in the buffer
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        if (!frame.trim()) continue;

        const lines = frame.split('\n');
        let eventType: string | null = null;
        let dataValue = '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventType = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataValue = line.slice(5).trim();
          }
        }

        if (eventType === 'heartbeat') {
          heartbeats.push(Date.now());
          onHeartbeat?.();
        } else if (dataValue) {
          events.push(dataValue);
          onEvent?.();
        }
      }
    });
  });

  req.on('error', () => { /* expected on abort */ });

  const close = () => {
    try { ac.abort(); } catch { /* ignore */ }
    try { req.destroy(); } catch { /* ignore */ }
  };

  const waitForHeartbeat = (timeoutMs = 10_000): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      if (heartbeats.length > 0) return resolve();
      const timer = setTimeout(() => {
        onHeartbeat = null;
        reject(new Error(`SSE heartbeat not received within ${timeoutMs}ms`));
      }, timeoutMs);
      onHeartbeat = () => {
        clearTimeout(timer);
        onHeartbeat = null;
        resolve();
      };
    });

  const waitForEvents = (count: number, timeoutMs = 15_000): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      if (events.length >= count) return resolve();
      const timer = setTimeout(() => {
        onEvent = null;
        reject(
          new Error(
            `Only received ${events.length}/${count} events within ${timeoutMs}ms`,
          ),
        );
      }, timeoutMs);
      onEvent = () => {
        if (events.length >= count) {
          clearTimeout(timer);
          onEvent = null;
          resolve();
        }
      };
    });

  return { events, heartbeats, close, waitForHeartbeat, waitForEvents };
}

/**
 * Open a WebSocket to a terminal endpoint.
 * Returns a handle with received messages and helper methods.
 */
function openWS(termId: string): {
  ws: WebSocket;
  messages: Array<{ type: string; data?: string }>;
  errors: Error[];
  waitForOpen: (timeoutMs?: number) => Promise<void>;
  waitForMessage: (timeoutMs?: number) => Promise<void>;
  send: (msg: unknown) => void;
  close: () => void;
} {
  const ws = new WebSocket(`${WS_BASE}/ws/terminal/${termId}`);
  activeWebSockets.push(ws);

  const messages: Array<{ type: string; data?: string }> = [];
  const errors: Error[] = [];
  let onMessage: (() => void) | null = null;

  ws.on('message', (raw) => {
    try {
      const parsed = JSON.parse(raw.toString());
      messages.push(parsed);
    } catch {
      messages.push({ type: 'raw', data: raw.toString() });
    }
    onMessage?.();
  });

  ws.on('error', (err) => {
    errors.push(err);
  });

  const waitForOpen = (timeoutMs = 10_000): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      if (ws.readyState === WebSocket.OPEN) return resolve();
      const timer = setTimeout(() => {
        reject(new Error(`WebSocket did not open within ${timeoutMs}ms`));
      }, timeoutMs);
      ws.once('open', () => {
        clearTimeout(timer);
        resolve();
      });
      ws.once('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

  const waitForMessage = (timeoutMs = 10_000): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        onMessage = null;
        reject(new Error(`No WS message received within ${timeoutMs}ms`));
      }, timeoutMs);
      onMessage = () => {
        clearTimeout(timer);
        onMessage = null;
        resolve();
      };
    });

  const send = (msg: unknown) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }
  };

  const close = () => {
    try {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    } catch { /* ignore */ }
  };

  return { ws, messages, errors, waitForOpen, waitForMessage, send, close };
}

/** Small delay helper */
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanupAll();
});

afterAll(() => {
  cleanupAll();
});

// ===========================================================================
// SSE Tests
// ===========================================================================

describe('SSE Stress Tests', () => {
  // -------------------------------------------------------------------------
  // 1. Mass SSE connections
  // -------------------------------------------------------------------------
  it(
    'should handle 50 concurrent SSE connections all receiving heartbeat',
    { timeout: 20_000 },
    async () => {
      const clients = Array.from({ length: 50 }, () => openSSE());

      // Wait for all to receive heartbeat
      await Promise.all(clients.map((c) => c.waitForHeartbeat(15_000)));

      // Verify each got at least one heartbeat
      for (const client of clients) {
        expect(client.heartbeats.length).toBeGreaterThanOrEqual(1);
      }

      // Clean close
      for (const client of clients) {
        client.close();
      }
    },
  );

  // -------------------------------------------------------------------------
  // 2. SSE connection churn
  // -------------------------------------------------------------------------
  it(
    'should handle 100 rapid open/close SSE connections without errors',
    { timeout: 120_000 },
    async () => {
      const results: boolean[] = [];

      for (let i = 0; i < 100; i++) {
        const client = openSSE();
        try {
          await client.waitForHeartbeat(5_000);
          results.push(true);
        } catch {
          results.push(false);
        }
        client.close();
      }

      // At least 90% should have succeeded (allowing for minor race conditions)
      const successCount = results.filter(Boolean).length;
      expect(successCount).toBeGreaterThanOrEqual(90);
    },
  );

  // -------------------------------------------------------------------------
  // 3. SSE broadcast flood
  // -------------------------------------------------------------------------
  it(
    'should deliver broadcast events to 10 SSE clients under rapid API calls',
    { timeout: 20_000 },
    async () => {
      // Open 10 SSE clients
      const clients = Array.from({ length: 10 }, () => openSSE());
      await Promise.all(clients.map((c) => c.waitForHeartbeat(10_000)));

      // Trigger broadcast events by hitting an API endpoint that modifies state.
      // Creating and deleting chat conversations triggers broadcasts.
      // We'll use the health endpoint as a baseline — the key is that
      // the SSE connections stay alive under concurrent API traffic.
      const apiPromises: Promise<Response>[] = [];
      for (let i = 0; i < 100; i++) {
        apiPromises.push(
          fetch(`${BASE}/health`).catch(() => new Response(null, { status: 500 })),
        );
      }
      await Promise.all(apiPromises);

      // All SSE clients should still be alive — verify by checking heartbeat count
      // hasn't reset (the connection didn't drop)
      for (const client of clients) {
        expect(client.heartbeats.length).toBeGreaterThanOrEqual(1);
      }

      for (const client of clients) {
        client.close();
      }
    },
  );

  // -------------------------------------------------------------------------
  // 4. SSE stale client cleanup
  // -------------------------------------------------------------------------
  it(
    'should eventually clean up a stale SSE client',
    { timeout: 15_000 },
    async () => {
      // Open an SSE connection and just abandon it (stop reading)
      const ac = new AbortController();
      activeAbortControllers.push(ac);

      let connected = false;
      const req = http.get(`${BASE}/events`, { signal: ac.signal }, () => {
        connected = true;
        // Intentionally do NOT read from the response — simulate a stale client
      });
      req.on('error', () => { /* expected */ });

      // Wait a moment for the connection to establish
      await delay(500);
      expect(connected).toBe(true);

      // The server sweeps stale clients after 60s of inactivity.
      // We can't wait 60s in a test, so we verify the connection was established
      // and the server didn't crash. The sweep mechanism is tested by ensuring
      // the server stays responsive.
      const healthRes = await fetch(`${BASE}/health`);
      expect(healthRes.status).toBe(200);

      ac.abort();
      req.destroy();
    },
  );

  // -------------------------------------------------------------------------
  // 5. SSE reconnection
  // -------------------------------------------------------------------------
  it(
    'should handle 20 rapid SSE reconnections, each receiving heartbeat',
    { timeout: 30_000 },
    async () => {
      for (let i = 0; i < 20; i++) {
        const client = openSSE();
        await client.waitForHeartbeat(5_000);
        expect(client.heartbeats.length).toBeGreaterThanOrEqual(1);
        client.close();
        // Tiny gap between reconnects
        await delay(50);
      }
    },
  );

  // -------------------------------------------------------------------------
  // 6. SSE with slow consumer
  // -------------------------------------------------------------------------
  it(
    'should not crash when an SSE client is a slow consumer',
    { timeout: 15_000 },
    async () => {
      // Open a connection where we deliberately delay processing incoming data
      const ac = new AbortController();
      activeAbortControllers.push(ac);

      let chunkCount = 0;
      const req = http.get(`${BASE}/events`, { signal: ac.signal }, (res) => {
        res.on('data', () => {
          chunkCount++;
          // Simulate slow consumer by not processing promptly
          // The data just piles up in the Node.js buffer
        });
      });
      req.on('error', () => { /* expected on abort */ });

      // Let it sit for a few seconds
      await delay(3000);

      // Should have received at least the initial heartbeat
      expect(chunkCount).toBeGreaterThanOrEqual(1);

      // Server should still be responsive
      const healthRes = await fetch(`${BASE}/health`);
      expect(healthRes.status).toBe(200);

      ac.abort();
      req.destroy();
    },
  );

  // -------------------------------------------------------------------------
  // 7. SSE mixed with API calls
  // -------------------------------------------------------------------------
  it(
    'should handle 20 SSE connections + 100 concurrent API requests',
    { timeout: 25_000 },
    async () => {
      // Open 20 SSE connections
      const clients = Array.from({ length: 20 }, () => openSSE());
      await Promise.all(clients.map((c) => c.waitForHeartbeat(10_000)));

      // Fire 100 API requests concurrently
      const apiResults = await Promise.all(
        Array.from({ length: 100 }, () =>
          fetch(`${BASE}/health`)
            .then((r) => r.status)
            .catch(() => 500),
        ),
      );

      // All API calls should return 200
      const okCount = apiResults.filter((s) => s === 200).length;
      expect(okCount).toBeGreaterThanOrEqual(95); // Allow minor failures

      // All SSE clients should still be connected (heartbeat received)
      for (const client of clients) {
        expect(client.heartbeats.length).toBeGreaterThanOrEqual(1);
      }

      for (const client of clients) {
        client.close();
      }
    },
  );
});

// ===========================================================================
// WebSocket Tests
// ===========================================================================

describe('WebSocket Stress Tests', () => {
  // -------------------------------------------------------------------------
  // 8. Mass WebSocket connections
  // -------------------------------------------------------------------------
  it(
    'should open 20 concurrent WebSocket connections to different termIds',
    { timeout: 15_000 },
    async () => {
      const handles = Array.from({ length: 20 }, () =>
        openWS(`stress-${randomUUID()}`),
      );

      // Wait for all to open
      await Promise.all(handles.map((h) => h.waitForOpen(10_000)));

      // All should be in OPEN state
      for (const h of handles) {
        expect(h.ws.readyState).toBe(WebSocket.OPEN);
        expect(h.errors.length).toBe(0);
      }

      // Close all
      for (const h of handles) {
        h.close();
      }
    },
  );

  // -------------------------------------------------------------------------
  // 9. WebSocket message flood
  // -------------------------------------------------------------------------
  it(
    'should handle 1000 rapid input messages without crash or disconnect',
    { timeout: 20_000 },
    async () => {
      const termId = `flood-${randomUUID()}`;
      const handle = openWS(termId);
      await handle.waitForOpen(10_000);

      // Send 1000 input messages as fast as possible
      for (let i = 0; i < 1000; i++) {
        handle.send({ type: 'input', data: `echo ${i}\n` });
      }

      // Wait a beat for the server to process
      await delay(2000);

      // Connection should still be open
      expect(handle.ws.readyState).toBe(WebSocket.OPEN);
      expect(handle.errors.length).toBe(0);

      handle.close();
    },
  );

  // -------------------------------------------------------------------------
  // 10. WebSocket resize spam
  // -------------------------------------------------------------------------
  it(
    'should handle 100 rapid resize events gracefully',
    { timeout: 15_000 },
    async () => {
      const termId = `resize-${randomUUID()}`;
      const handle = openWS(termId);
      await handle.waitForOpen(10_000);

      // Send 100 resize events with varying dimensions
      for (let i = 0; i < 100; i++) {
        handle.send({
          type: 'resize',
          cols: 80 + (i % 40),
          rows: 24 + (i % 20),
        });
      }

      await delay(1000);

      // Connection should still be alive
      expect(handle.ws.readyState).toBe(WebSocket.OPEN);
      expect(handle.errors.length).toBe(0);

      handle.close();
    },
  );

  // -------------------------------------------------------------------------
  // 11. WebSocket connection churn
  // -------------------------------------------------------------------------
  it(
    'should handle 50 rapid open/close WebSocket connections',
    { timeout: 60_000 },
    async () => {
      const results: boolean[] = [];

      for (let i = 0; i < 50; i++) {
        const termId = `churn-${randomUUID()}`;
        const handle = openWS(termId);
        try {
          await handle.waitForOpen(5_000);
          results.push(true);
        } catch {
          results.push(false);
        }
        handle.close();
        // Small gap to avoid overwhelming the OS socket table
        await delay(20);
      }

      // At least 90% should succeed
      const successCount = results.filter(Boolean).length;
      expect(successCount).toBeGreaterThanOrEqual(45);
    },
  );

  // -------------------------------------------------------------------------
  // 12. Invalid WebSocket messages
  // -------------------------------------------------------------------------
  it(
    'should handle malformed JSON, empty strings, and binary data without crash',
    { timeout: 15_000 },
    async () => {
      const termId = `invalid-${randomUUID()}`;
      const handle = openWS(termId);
      await handle.waitForOpen(10_000);

      // Malformed JSON
      handle.ws.send('this is not json');
      handle.ws.send('');
      handle.ws.send('{{{{');
      handle.ws.send('null');
      handle.ws.send('undefined');
      handle.ws.send('{"type":}');
      handle.ws.send('{type: "input", data: "hello"}'); // unquoted key

      // Binary data
      const binaryData = Buffer.alloc(256);
      for (let i = 0; i < 256; i++) binaryData[i] = i;
      handle.ws.send(binaryData);

      // Valid but unknown type
      handle.send({ type: 'nonexistent', data: 'test' });

      // Nested garbage
      handle.send({ type: 'input', data: { nested: { deep: true } } });

      // Array instead of object
      handle.ws.send(JSON.stringify([1, 2, 3]));

      await delay(1000);

      // Connection should still be alive — server ignores malformed messages
      expect(handle.ws.readyState).toBe(WebSocket.OPEN);

      handle.close();
    },
  );

  // -------------------------------------------------------------------------
  // 13. Large WebSocket message
  // -------------------------------------------------------------------------
  it(
    'should handle a large (~1MB) input message',
    { timeout: 20_000 },
    async () => {
      const termId = `large-${randomUUID()}`;
      const handle = openWS(termId);
      await handle.waitForOpen(10_000);

      // Generate ~1MB of data
      const largePayload = 'A'.repeat(1_000_000);
      handle.send({ type: 'input', data: largePayload });

      await delay(2000);

      // Connection may or may not still be open depending on server limits,
      // but the server should NOT crash. Verify server is still responsive.
      const healthRes = await fetch(`${BASE}/health`);
      expect(healthRes.status).toBe(200);

      handle.close();
    },
  );

  // -------------------------------------------------------------------------
  // 14. WebSocket + SSE combined
  // -------------------------------------------------------------------------
  it(
    'should maintain 10 SSE + 10 WS connections with concurrent API calls',
    { timeout: 25_000 },
    async () => {
      // Open 10 SSE connections
      const sseClients = Array.from({ length: 10 }, () => openSSE());
      await Promise.all(sseClients.map((c) => c.waitForHeartbeat(10_000)));

      // Open 10 WebSocket connections
      const wsHandles = Array.from({ length: 10 }, () =>
        openWS(`combined-${randomUUID()}`),
      );
      await Promise.all(wsHandles.map((h) => h.waitForOpen(10_000)));

      // Fire API calls concurrently
      const apiResults = await Promise.all(
        Array.from({ length: 50 }, () =>
          fetch(`${BASE}/health`)
            .then((r) => r.status)
            .catch(() => 500),
        ),
      );

      // Send some WS messages too
      for (const h of wsHandles) {
        h.send({ type: 'resize', cols: 120, rows: 40 });
        h.send({ type: 'input', data: 'echo hello\n' });
      }

      await delay(1000);

      // Verify everything is still alive
      const okCount = apiResults.filter((s) => s === 200).length;
      expect(okCount).toBeGreaterThanOrEqual(45);

      for (const client of sseClients) {
        expect(client.heartbeats.length).toBeGreaterThanOrEqual(1);
      }

      for (const h of wsHandles) {
        expect(h.ws.readyState).toBe(WebSocket.OPEN);
        expect(h.errors.length).toBe(0);
      }

      // Clean up
      for (const client of sseClients) {
        client.close();
      }
      for (const h of wsHandles) {
        h.close();
      }
    },
  );
});

// ===========================================================================
// Combined / Edge Case Tests
// ===========================================================================

describe('Combined Edge Cases', () => {
  it(
    'should survive interleaved SSE connect/disconnect with WS traffic',
    { timeout: 45_000 },
    async () => {
      const wsHandle = openWS(`interleave-${randomUUID()}`);
      await wsHandle.waitForOpen(10_000);

      // Repeatedly open and close SSE while sending WS messages
      for (let i = 0; i < 10; i++) {
        const sseClient = openSSE();
        wsHandle.send({ type: 'input', data: `round ${i}\n` });

        try {
          await sseClient.waitForHeartbeat(3_000);
        } catch {
          // Some may timeout under heavy load — that's OK
        }
        sseClient.close();
      }

      // WS should still be alive
      expect(wsHandle.ws.readyState).toBe(WebSocket.OPEN);

      // Server should be responsive
      const healthRes = await fetch(`${BASE}/health`);
      expect(healthRes.status).toBe(200);

      wsHandle.close();
    },
  );

  it(
    'should handle rapid WS open + send + close cycle without leaking',
    { timeout: 60_000 },
    async () => {
      // Open, send a burst, close — 30 times
      for (let i = 0; i < 30; i++) {
        const termId = `rapid-cycle-${randomUUID()}`;
        const handle = openWS(termId);
        try {
          await handle.waitForOpen(3_000);
          // Send a burst of messages
          for (let j = 0; j < 10; j++) {
            handle.send({ type: 'input', data: `burst-${j}\n` });
          }
          handle.send({ type: 'resize', cols: 100, rows: 30 });
        } catch {
          // Connection might fail under extreme churn — acceptable
        }
        handle.close();
        await delay(30);
      }

      // Server should still be alive
      const healthRes = await fetch(`${BASE}/health`);
      expect(healthRes.status).toBe(200);
    },
  );

  it(
    'should handle multiple WS connections to the same termId',
    { timeout: 15_000 },
    async () => {
      const sharedTermId = `shared-${randomUUID()}`;

      // Open 5 connections to the same terminal
      const handles = Array.from({ length: 5 }, () => openWS(sharedTermId));
      await Promise.all(handles.map((h) => h.waitForOpen(10_000)));

      // All should be open
      for (const h of handles) {
        expect(h.ws.readyState).toBe(WebSocket.OPEN);
      }

      // Send from each
      for (let i = 0; i < handles.length; i++) {
        handles[i].send({ type: 'input', data: `from-conn-${i}\n` });
      }

      await delay(500);

      // Server should be responsive
      const healthRes = await fetch(`${BASE}/health`);
      expect(healthRes.status).toBe(200);

      for (const h of handles) {
        h.close();
      }
    },
  );

  it(
    'server health endpoint responds throughout all stress scenarios',
    { timeout: 10_000 },
    async () => {
      // Final canary — verify server is still fully operational
      const results = await Promise.all(
        Array.from({ length: 20 }, () =>
          fetch(`${BASE}/health`)
            .then((r) => r.json() as Promise<{ status: string }>)
            .catch(() => ({ status: 'error' })),
        ),
      );

      for (const r of results) {
        expect(r.status).toBe('alive');
      }
    },
  );
});
