#!/usr/bin/env node
/**
 * PhantomOS v2 -- FileChanged hook
 * Triggers incremental graph updates when files are modified
 * Fire-and-forget POST to /api/graph/auto/incremental
 * @author Subash Karki
 */

const API = `http://localhost:${process.env.PHANTOM_API_PORT || '3849'}`;

const EXCLUDED = /node_modules|\.git\/|dist\/|build\/|\.lock$|\.png$|\.jpg$|\.svg$/;

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', async () => {
  try {
    if (process.env.PHANTOM_HOOK_DISABLE === '1') process.exit(0);

    // Check per-feature toggle (fail-open)
    try {
      const prefs = await fetch(`${API}/api/preferences/ai`).then((r) => r.json());
      if (prefs?.['ai.fileSync'] === false) process.exit(0);
    } catch {
      /* proceed if API unavailable */
    }

    const data = JSON.parse(input);
    const filePath = data?.tool_input?.file_path || data?.file_path || '';

    if (!filePath || EXCLUDED.test(filePath)) process.exit(0);

    // Fire-and-forget incremental graph update
    await fetch(`${API}/api/graph/auto/incremental`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: [filePath] }),
    }).catch(() => {});

    fetch(`${API}/api/hook-health/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hook: 'file-changed', status: 'success' }),
    }).catch(() => {});

    process.exit(0);
  } catch {
    process.exit(0);
  }
});
