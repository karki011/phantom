#!/usr/bin/env node
/**
 * UserPromptSubmit hook — auto-injects graph context on every user message
 * @author Subash Karki
 */

import { readFileSync } from 'fs';
import { logError } from '../services/error-logger.js';
import { sanitizeXMLTags } from '../utils/sanitize.js';

const PHANTOM_API = `http://localhost:${process.env.PHANTOM_API_PORT || '3849'}`;

const readStdin = (): string => {
  try {
    return readFileSync('/dev/stdin', 'utf-8');
  } catch {
    return '{}';
  }
};

const extractFilePaths = (text: string): string[] => {
  const patterns = [
    /(?:^|\s|['"`])([a-zA-Z0-9_./-]+\.[a-zA-Z]{1,10})(?:['"`\s:,]|$)/gm,
    /(?:^|\s)((?:src|lib|packages|apps|internal|cmd)\/[a-zA-Z0-9_./-]+)/gm,
  ];
  const paths = new Set<string>();
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const p = match[1].trim();
      if (p.length > 3 && !p.startsWith('http') && !p.includes('node_modules')) {
        paths.add(p);
      }
    }
  }
  return [...paths].slice(0, 5);
};

const main = async () => {
  try {
    if (process.env.PHANTOM_HOOK_DISABLE === '1') process.exit(0);

    // Check per-feature toggle (fail-open: proceed if API unavailable)
    try {
      const prefs = await fetch(`${PHANTOM_API}/api/preferences/ai`).then(r => r.json());
      if (prefs?.['ai.autoContext'] === false) process.exit(0);
    } catch (err) {
      logError('prompt-enricher', 'fetch-prefs', err);
      /* proceed if API unavailable */
    }

    const input = JSON.parse(readStdin());
    const message = input?.tool_input?.prompt || input?.tool_input?.message || '';
    if (!message || message.length < 10) process.exit(0);

    const filePaths = extractFilePaths(message);
    if (filePaths.length === 0) process.exit(0);

    const contextResults: { file: string; dependencies: string[] }[] = [];
    for (const file of filePaths.slice(0, 3)) {
      try {
        const res = await fetch(`${PHANTOM_API}/api/graph/auto/context?file=${encodeURIComponent(file)}`);
        if (res.ok) {
          const data = await res.json();
          contextResults.push({
            file,
            dependencies: data.scores ? Object.keys(data.scores).slice(0, 10) : [],
          });
        }
      } catch (err) {
        logError('prompt-enricher', 'graph-lookup', err, file);
      }
    }

    if (contextResults.length === 0) process.exit(0);

    const contextStr = sanitizeXMLTags(
      contextResults
        .map((r) => `  File: ${r.file}\n  Dependencies: ${r.dependencies.join(', ') || 'none found'}`)
        .join('\n'),
    );

    console.log(`<phantom-context>
Files mentioned in your message have these dependencies:
${contextStr}
Consider calling phantom_before_edit for full blast radius analysis before making changes.
</phantom-context>`);

    await reportHealth('success');
    process.exit(0);
  } catch (err) {
    logError('prompt-enricher', 'main', err);
    await reportHealth('error', err instanceof Error ? err.message : 'unknown');
    process.exit(0);
  }
};

const reportHealth = async (status: 'success' | 'error', error?: string) => {
  await fetch(`${PHANTOM_API}/api/hook-health/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hook: 'prompt-enricher', status, error }),
  }).catch(() => {});
};

main();
