#!/usr/bin/env node
/**
 * PostToolUse hook -- detects implicit outcome signals
 *
 * Monitors tool usage for patterns that indicate whether a previous
 * AI decision succeeded or failed:
 *   - revert: git revert/checkout/restore commands
 *   - retry:  same file edited again within 60s window
 *
 * @author Subash Karki
 */
import { readFileSync } from 'fs';
import { logError } from '../services/error-logger.js';

const PHANTOM_API = `http://localhost:${process.env.PHANTOM_API_PORT || '3849'}`;

const main = async () => {
  try {
    if (process.env.PHANTOM_HOOK_DISABLE === '1') process.exit(0);

    const input = JSON.parse(readFileSync('/dev/stdin', 'utf-8'));
    const toolName = input?.tool_name || '';
    const toolInput = input?.tool_input || {};

    let signal: 'success' | 'retry' | 'revert' | null = null;

    // Detect revert signals from Bash commands
    if (toolName === 'Bash') {
      const cmd = toolInput.command || '';
      if (/git\s+(revert|checkout\s+--|restore)/.test(cmd)) {
        signal = 'revert';
      }
    }

    // Detect retry signals: same file edited again within short window
    if (toolName === 'Edit' || toolName === 'Write') {
      const filePath = toolInput.file_path || '';
      if (filePath) {
        const res = await fetch(`${PHANTOM_API}/api/orchestrator/check-retry`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath, timestamp: Date.now() }),
        }).catch(() => null);

        if (res?.ok) {
          const data = await res.json();
          if (data.isRetry) signal = 'retry';
        }
      }
    }

    if (signal) {
      await fetch(`${PHANTOM_API}/api/orchestrator/record-feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal, timestamp: new Date().toISOString() }),
      }).catch(() => {});
    }

    await reportHealth('success');
    process.exit(0);
  } catch (err) {
    logError('feedback-detector', 'main', err);
    await reportHealth('error', err instanceof Error ? err.message : 'unknown');
    process.exit(0);
  }
};

const reportHealth = async (status: 'success' | 'error', error?: string) => {
  await fetch(`${PHANTOM_API}/api/hook-health/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hook: 'feedback-detector', status, error }),
  }).catch(() => {});
};

main();
