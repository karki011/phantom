#!/usr/bin/env node
/**
 * PhantomOS v2 -- UserPromptSubmit hook
 * Injects graph context when user mentions file paths
 * @author Subash Karki
 */

const API = `http://localhost:${process.env.PHANTOM_API_PORT || '3849'}`;

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', async () => {
  try {
    if (process.env.PHANTOM_HOOK_DISABLE === '1') process.exit(0);

    const data = JSON.parse(input);
    const message = data?.tool_input?.prompt || data?.tool_input?.message || '';
    if (!message || message.length < 10) process.exit(0);

    // Check per-feature toggle (fail-open)
    try {
      const prefs = await fetch(`${API}/api/preferences/ai`).then((r) => r.json());
      if (prefs?.['ai.autoContext'] === false) process.exit(0);
    } catch {
      /* proceed if API unavailable */
    }

    // Extract file paths from message
    const paths = [];
    const patterns = [
      /(?:^|\s|['"`])([a-zA-Z0-9_./-]+\.[a-zA-Z]{1,10})(?:['"`\s:,]|$)/gm,
      /(?:^|\s)((?:src|lib|packages|apps|internal|cmd)\/[a-zA-Z0-9_./-]+)/gm,
    ];
    for (const re of patterns) {
      let m;
      while ((m = re.exec(message)) && paths.length < 5) {
        const p = m[1].trim();
        if (p.length > 3 && !p.startsWith('http') && !p.includes('node_modules')) {
          paths.push(p);
        }
      }
    }
    if (paths.length === 0) process.exit(0);

    // Query graph for each file
    const results = [];
    for (const file of paths.slice(0, 3)) {
      try {
        const res = await fetch(`${API}/api/graph/auto/context?file=${encodeURIComponent(file)}`);
        if (res.ok) {
          const d = await res.json();
          const deps = d.scores ? Object.keys(d.scores).slice(0, 10) : [];
          if (deps.length > 0) results.push({ file, deps });
        }
      } catch {
        /* skip individual file failures */
      }
    }

    if (results.length > 0) {
      const ctx = results
        .map((r) => `  File: ${r.file}\n  Dependencies: ${r.deps.join(', ')}`)
        .join('\n');
      process.stdout.write(
        `<phantom-context>\nFiles mentioned in your message have these dependencies:\n${ctx}\nConsider calling phantom_before_edit for full blast radius analysis before making changes.\n</phantom-context>`,
      );
    }

    // Report health (fire-and-forget)
    fetch(`${API}/api/hook-health/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hook: 'prompt-enricher', status: 'success' }),
    }).catch(() => {});

    process.exit(0);
  } catch {
    process.exit(0);
  }
});
