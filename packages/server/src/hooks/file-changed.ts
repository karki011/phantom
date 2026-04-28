#!/usr/bin/env node
/**
 * FileChanged hook — triggers incremental graph updates
 * @author Subash Karki
 */
import { readFileSync } from 'fs';
import { logError } from '../services/error-logger.js';

const PHANTOM_API = `http://localhost:${process.env.PHANTOM_API_PORT || '3849'}`;

const EXCLUDED = /node_modules|\.git\/|dist\/|build\/|\.lock$|\.png$|\.jpg$|\.svg$/;

const main = async () => {
  try {
    if (process.env.PHANTOM_HOOK_DISABLE === '1') process.exit(0);

    // Check per-feature toggle (fail-open: proceed if API unavailable)
    try {
      const prefs = await fetch(`${PHANTOM_API}/api/preferences/ai`).then(r => r.json());
      if (prefs?.['ai.fileSync'] === false) process.exit(0);
    } catch (err) {
      logError('file-changed', 'fetch-prefs', err);
      /* proceed if API unavailable */
    }

    const input = JSON.parse(readFileSync('/dev/stdin', 'utf-8'));
    const filePath = input?.tool_input?.file_path || input?.file_path || '';

    if (!filePath || EXCLUDED.test(filePath)) process.exit(0);

    await fetch(`${PHANTOM_API}/api/graph/auto/incremental`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: [filePath] }),
    }).catch(() => {});

    await reportHealth('success');
    process.exit(0);
  } catch (err) {
    logError('file-changed', 'main', err);
    await reportHealth('error', err instanceof Error ? err.message : 'unknown');
    process.exit(0);
  }
};

const reportHealth = async (status: 'success' | 'error', error?: string) => {
  await fetch(`${PHANTOM_API}/api/hook-health/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hook: 'file-changed', status, error }),
  }).catch(() => {});
};

main();
