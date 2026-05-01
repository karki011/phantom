#!/usr/bin/env node
/**
 * PhantomOS v2 -- PreToolUse Edit Gate
 * Blocks Edit/Write/MultiEdit unless phantom_before_edit was called (when enabled)
 * Only gates SOURCE CODE files inside a linked Phantom workspace — docs, plans,
 * configs, and edits outside any linked workspace pass through freely.
 * Falls open if PhantomOS API is unavailable (Claude can't call tools that don't exist)
 * @author Subash Karki
 */

const API = `http://localhost:${process.env.PHANTOM_API_PORT || '3849'}`;

async function fetchJSON(url, ms = 1500, init) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: c.signal });
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function isInsideAny(filePath, workspaces) {
  if (!filePath || !Array.isArray(workspaces) || workspaces.length === 0) return false;
  return workspaces.some((w) => {
    const root = (w?.path || '').replace(/\/+$/, '');
    if (!root) return false;
    return filePath === root || filePath.startsWith(`${root}/`);
  });
}

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', async () => {
  try {
    if (process.env.PHANTOM_GATE_DISABLE === '1') process.exit(0);

    const data = JSON.parse(input);
    const filePath = data?.tool_input?.file_path || data?.tool_input?.path || '';

    // Skip non-source files — gate only blocks actual code edits
    const skipPatterns = [
      /node_modules/,
      /\.claude\//,
      /\.phantom-os/,
      /\/memory\//,
      /\.git\//,
      /\.md$/i,
      /\.txt$/i,
      /\.json$/i,
      /\.yaml$/i,
      /\.yml$/i,
      /\.toml$/i,
      /\.xml$/i,
      /\.csv$/i,
      /\.env/,
      /\.lock$/,
      /\.log$/,
      /\.js$/i,
      /\.sh$/i,
      /\.ai\//,
      /\.planning\//,
      /plans?\//i,
      /docs?\//i,
      /hooks?\//i,
      /scripts?\//i,
      /tools\//i,
      /README/i,
      /CHANGELOG/i,
      /LICENSE/i,
    ];
    if (!filePath || skipPatterns.some((p) => p.test(filePath))) {
      process.exit(0);
    }

    // Scope to linked Phantom workspaces. Edits outside any linked workspace
    // are someone else's problem — Phantom shouldn't gate them.
    try {
      const workspaces = await fetchJSON(`${API}/api/workspaces`, 1500);
      if (!isInsideAny(filePath, workspaces)) {
        process.exit(0);
      }
    } catch {
      // API down — fail open below the prefs check.
    }

    // Check if edit gate is enabled AND API is reachable
    // If API is down, fail open — Claude can't call phantom_before_edit anyway
    let gateEnabled = false;
    try {
      const prefs = await fetchJSON(`${API}/api/preferences/ai`, 1500);
      gateEnabled = prefs?.['ai.editGate'] === true;
    } catch {
      // API unreachable — fail open, just advise
      process.stdout.write(
        '<phantom-ai-reminder>PhantomOS AI Engine: consider reviewing dependencies before editing this file.</phantom-ai-reminder>',
      );
      process.exit(0);
    }

    if (gateEnabled) {
      // Honour the touch cache: if phantom_before_edit was called for this
      // path within the TTL, allow the edit through.
      let allowed = false;
      try {
        const data = await fetchJSON(
          `${API}/api/edit-gate/check?path=${encodeURIComponent(filePath)}`,
          1500,
        );
        allowed = data?.allowed === true;
      } catch {
        // Check endpoint unreachable — fall through to blocking behaviour
      }

      if (allowed) {
        process.stdout.write(
          '<phantom-ai-reminder>Edit gate allowed — phantom_before_edit was recently called for this path.</phantom-ai-reminder>',
        );
        fetch(`${API}/api/hook-health/report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hook: 'edit-gate', status: 'success', action: 'allowed' }),
        }).catch(() => {});
        process.exit(0);
      }

      process.stderr.write(
        [
          'BLOCKED: Call `phantom_before_edit` (from the phantom-ai MCP server)',
          'with this file path before editing.',
          '',
          "If the tool isn't available, the phantom-ai MCP server may not be",
          'registered. Run `/mcp` in Claude Code to check, or set',
          'PHANTOM_GATE_DISABLE=1 to bypass for this session.',
        ].join('\n'),
      );

      fetch(`${API}/api/hook-health/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hook: 'edit-gate', status: 'success', action: 'blocked' }),
      }).catch(() => {});

      process.exit(2);
    }

    // Advisory mode
    process.stdout.write(
      '<phantom-ai-reminder>Consider calling phantom_before_edit for dependency context before editing.</phantom-ai-reminder>',
    );

    fetch(`${API}/api/hook-health/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hook: 'edit-gate', status: 'success', action: 'advisory' }),
    }).catch(() => {});

    process.exit(0);
  } catch {
    process.exit(0);
  }
});
