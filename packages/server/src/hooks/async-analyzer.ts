#!/usr/bin/env node
/**
 * asyncRewake hook — background analysis after each turn
 * If important findings, exits with code 2 to wake Claude
 *
 * This is a SECOND Stop hook (outcome-capture.ts is the first).
 * Claude Code supports multiple hooks per event. This one runs in
 * background (async: true) and only wakes Claude if it finds something
 * important (exit code 2 + stderr message).
 *
 * @author Subash Karki
 */
import { readFileSync } from 'fs';
import { logError } from '../services/error-logger.js';

const PHANTOM_API = `http://localhost:${process.env.PHANTOM_API_PORT || '3849'}`;

const main = async () => {
  try {
    if (process.env.PHANTOM_HOOK_DISABLE === '1') process.exit(0);

    // Check per-feature toggle (fail-open: proceed if API unavailable)
    try {
      const prefs = await fetch(`${PHANTOM_API}/api/preferences/ai`).then(r => r.json());
      if (prefs?.['ai.outcomeCapture'] === false) process.exit(0);
    } catch (err) {
      logError('async-analyzer', 'fetch-prefs', err);
      /* proceed if API unavailable */
    }

    // Read stdin (Claude passes session context)
    let _input: unknown;
    try {
      _input = JSON.parse(readFileSync('/dev/stdin', 'utf-8'));
    } catch (err) {
      logError('async-analyzer', 'read-stdin', err);
      // stdin may be empty or invalid — that's fine
      process.exit(0);
    }

    // Gather findings from available data sources
    const findings: string[] = [];

    // Check graph coverage across all indexed projects
    try {
      const stats = await fetch(`${PHANTOM_API}/api/graph/stats/all`).then(r => r.json());
      if (stats && Object.keys(stats).length > 0) {
        const totalFiles = Object.values(stats).reduce(
          (sum: number, s: unknown) => sum + ((s as { fileCount?: number }).fileCount || 0),
          0,
        );
        findings.push(`Graph coverage: ${totalFiles} files indexed`);
      }
    } catch (err) {
      logError('async-analyzer', 'graph-stats', err);
    }

    // Check knowledge for recent strategy failures
    try {
      const history = await fetch(
        `${PHANTOM_API}/api/orchestrator/auto/history?limit=3`,
      ).then(r => r.json());

      if (history?.decisions?.length > 0) {
        const recentFailures = history.decisions.filter(
          (d: { outcome?: { success?: boolean } }) => d.outcome?.success === false,
        );
        if (recentFailures.length > 0) {
          findings.push(
            `⚠ ${recentFailures.length} recent strategy failures detected. Consider using phantom_orchestrator_history to review.`,
          );
        }
      }
    } catch (err) {
      logError('async-analyzer', 'orchestrator-history', err);
    }

    // Only wake Claude if there are important findings (marked with warning sign)
    const hasImportantFindings = findings.some(f => f.includes('⚠'));
    if (findings.length > 0 && hasImportantFindings) {
      await reportHealth('success');
      // Exit 2 with stderr = wakes Claude with this message
      process.stderr.write(`<phantom-analysis>\n${findings.join('\n')}\n</phantom-analysis>`);
      process.exit(2);
    }

    await reportHealth('success');
    process.exit(0);
  } catch (err) {
    logError('async-analyzer', 'main', err);
    await reportHealth('error', err instanceof Error ? err.message : 'unknown');
    // Fail-safe — never crash, never wake Claude on internal errors
    process.exit(0);
  }
};

const reportHealth = async (status: 'success' | 'error', error?: string) => {
  await fetch(`${PHANTOM_API}/api/hook-health/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hook: 'async-analyzer', status, error }),
  }).catch(() => {});
};

main();
