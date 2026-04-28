#!/usr/bin/env node
/**
 * PostToolUse hook — triggers execution verification after file edits
 *
 * Only fires for Edit/Write/MultiEdit tools. Queues a verification request
 * on the server (debounced 5s after last edit, not on every single edit).
 *
 * The hook itself is fast — it just POSTs to queue, does not execute tests.
 *
 * @author Subash Karki
 */
import { readFileSync } from 'fs';

const PHANTOM_API = `http://localhost:${process.env.PHANTOM_API_PORT || '3849'}`;

const main = async () => {
  try {
    if (process.env.PHANTOM_HOOK_DISABLE === '1') process.exit(0);

    // Check per-feature toggle (fail-open: proceed if API unavailable)
    try {
      const prefs = await fetch(`${PHANTOM_API}/api/preferences/ai`).then((r) => r.json());
      if (prefs?.['ai.autoVerify'] === false) process.exit(0);
    } catch {
      /* proceed if API unavailable */
    }

    const input = JSON.parse(readFileSync('/dev/stdin', 'utf-8'));
    const toolName = input?.tool_name || '';

    if (!['Edit', 'Write', 'MultiEdit'].includes(toolName)) {
      process.exit(0);
    }

    const filePath = input?.tool_input?.file_path || '';
    if (!filePath) process.exit(0);

    // Queue verification (server debounces)
    await fetch(`${PHANTOM_API}/api/verify/queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath, timestamp: Date.now() }),
    }).catch(() => {});

    // Report hook health
    await reportHealth('success');
    process.exit(0);
  } catch (err) {
    await reportHealth('error', err instanceof Error ? err.message : 'unknown');
    process.exit(0);
  }
};

const reportHealth = async (status: 'success' | 'error', error?: string) => {
  await fetch(`${PHANTOM_API}/api/hook-health/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hook: 'post-edit-verifier', status, error }),
  }).catch(() => {});
};

main();
