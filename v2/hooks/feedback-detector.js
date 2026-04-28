#!/usr/bin/env node
/**
 * PhantomOS v2 -- PostToolUse hook
 * Detects implicit outcome signals:
 *   - revert: git revert/checkout/restore commands
 *   - retry:  same file edited again within 60s window
 * Posts to /api/orchestrator/record-feedback and /api/orchestrator/check-retry
 * @author Subash Karki
 */

const API = `http://localhost:${process.env.PHANTOM_API_PORT || '3849'}`;

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', async () => {
  try {
    if (process.env.PHANTOM_HOOK_DISABLE === '1') process.exit(0);

    const data = JSON.parse(input);
    const toolName = data?.tool_name || '';
    const toolInput = data?.tool_input || {};

    let signal = null;

    // Detect revert signals from Bash commands
    if (toolName === 'Bash') {
      const cmd = toolInput.command || '';
      if (/git\s+(revert|checkout\s+--|restore)/.test(cmd)) {
        signal = 'revert';
      }
    }

    // Detect retry signals: same file edited again within short window
    if (toolName === 'Edit' || toolName === 'Write' || toolName === 'MultiEdit') {
      const filePath = toolInput.file_path || '';
      if (filePath) {
        try {
          const res = await fetch(`${API}/api/orchestrator/check-retry`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath, timestamp: Date.now() }),
          });
          if (res.ok) {
            const d = await res.json();
            if (d.isRetry) signal = 'retry';
          }
        } catch {
          /* skip if API unavailable */
        }
      }
    }

    if (signal) {
      await fetch(`${API}/api/orchestrator/record-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal, timestamp: new Date().toISOString() }),
      }).catch(() => {});
    }

    fetch(`${API}/api/hook-health/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hook: 'feedback-detector', status: 'success' }),
    }).catch(() => {});

    process.exit(0);
  } catch {
    process.exit(0);
  }
});
