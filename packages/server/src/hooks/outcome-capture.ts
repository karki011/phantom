#!/usr/bin/env node
/**
 * Stop hook — captures turn outcomes for knowledge learning
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
      logError('outcome-capture', 'fetch-prefs', err);
      /* proceed if API unavailable */
    }

    const input = JSON.parse(readFileSync('/dev/stdin', 'utf-8'));

    const sessionId = input?.session_id || '';
    if (!sessionId) process.exit(0);

    await fetch(`${PHANTOM_API}/api/orchestrator/record-outcome`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {});

    await reportHealth('success');
    process.exit(0);
  } catch (err) {
    logError('outcome-capture', 'main', err);
    await reportHealth('error', err instanceof Error ? err.message : 'unknown');
    process.exit(0);
  }
};

const reportHealth = async (status: 'success' | 'error', error?: string) => {
  await fetch(`${PHANTOM_API}/api/hook-health/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hook: 'outcome-capture', status, error }),
  }).catch(() => {});
};

main();
