#!/usr/bin/env node
/**
 * PhantomOS v2 -- Stop hook
 * Records turn outcomes for knowledge learning
 * Fire-and-forget POST to /api/orchestrator/record-outcome
 * @author Subash Karki
 */

const API = `http://localhost:${process.env.PHANTOM_API_PORT || '3849'}`;

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', async () => {
  try {
    if (process.env.PHANTOM_HOOK_DISABLE === '1') process.exit(0);

    // Check per-feature toggle (fail-open)
    try {
      const prefs = await fetch(`${API}/api/preferences/ai`).then((r) => r.json());
      if (prefs?.['ai.outcomeCapture'] === false) process.exit(0);
    } catch {
      /* proceed if API unavailable */
    }

    const data = JSON.parse(input);
    const sessionId = data?.session_id || '';
    if (!sessionId) process.exit(0);

    // Fire-and-forget outcome recording
    await fetch(`${API}/api/orchestrator/record-outcome`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {});

    fetch(`${API}/api/hook-health/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hook: 'outcome-capture', status: 'success' }),
    }).catch(() => {});

    process.exit(0);
  } catch {
    process.exit(0);
  }
});
