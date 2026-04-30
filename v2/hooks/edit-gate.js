#!/usr/bin/env node
/**
 * PhantomOS v2 -- PreToolUse Edit Gate
 * Blocks Edit/Write/MultiEdit unless phantom_before_edit was called (when enabled)
 * Only gates SOURCE CODE files — docs, plans, configs pass through freely
 * Falls open if PhantomOS API is unavailable (Claude can't call tools that don't exist)
 * @author Subash Karki
 */

const API = `http://localhost:${process.env.PHANTOM_API_PORT || '3849'}`;

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

    // Check if edit gate is enabled AND API is reachable
    // If API is down, fail open — Claude can't call phantom_before_edit anyway
    let gateEnabled = false;
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 1500);
      const prefs = await fetch(`${API}/api/preferences/ai`, { signal: controller.signal }).then((r) => r.json());
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
      // path within the TTL, allow the edit through. Means the gate now
      // does what its description promises ("require dependency analysis
      // before file modifications") instead of being a binary kill switch.
      let allowed = false;
      try {
        const c = new AbortController();
        setTimeout(() => c.abort(), 1500);
        const res = await fetch(
          `${API}/api/edit-gate/check?path=${encodeURIComponent(filePath)}`,
          { signal: c.signal },
        );
        const data = await res.json();
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
        'BLOCKED: Call phantom_before_edit with the target file paths before editing. This provides dependency context and blast radius analysis.',
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
