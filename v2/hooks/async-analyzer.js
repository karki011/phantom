#!/usr/bin/env node
/**
 * PhantomOS v2 -- Stop hook (async + asyncRewake)
 * Background analysis after turn completion
 * Checks for high blast radius and prior failures
 * Exits with code 2 to wake Claude if important findings
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

    // Parse stdin (may be empty or invalid)
    try {
      JSON.parse(input);
    } catch {
      process.exit(0);
    }

    const findings = [];

    // Check graph coverage across all indexed projects
    try {
      const stats = await fetch(`${API}/api/graph/stats/all`).then((r) => r.json());
      if (stats && Object.keys(stats).length > 0) {
        const totalFiles = Object.values(stats).reduce(
          (sum, s) => sum + (s.fileCount || 0),
          0,
        );
        findings.push(`Graph coverage: ${totalFiles} files indexed`);
      }
    } catch {
      /* skip if unavailable */
    }

    // Check knowledge for recent strategy failures
    try {
      const history = await fetch(`${API}/api/orchestrator/auto/history?limit=3`).then((r) =>
        r.json(),
      );
      if (history?.decisions?.length > 0) {
        const recentFailures = history.decisions.filter((d) => d.outcome?.success === false);
        if (recentFailures.length > 0) {
          findings.push(
            `WARNING: ${recentFailures.length} recent strategy failures detected. Consider using phantom_orchestrator_history to review.`,
          );
        }
      }
    } catch {
      /* skip if unavailable */
    }

    // Only wake Claude if there are important findings (marked with WARNING)
    const hasImportantFindings = findings.some((f) => f.includes('WARNING'));
    if (findings.length > 0 && hasImportantFindings) {
      fetch(`${API}/api/hook-health/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hook: 'async-analyzer', status: 'success' }),
      }).catch(() => {});

      // Exit 2 with stderr = wakes Claude with this message
      process.stderr.write(`<phantom-analysis>\n${findings.join('\n')}\n</phantom-analysis>`);
      process.exit(2);
    }

    fetch(`${API}/api/hook-health/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hook: 'async-analyzer', status: 'success' }),
    }).catch(() => {});

    process.exit(0);
  } catch {
    // Fail-safe -- never crash, never wake Claude on internal errors
    process.exit(0);
  }
});
