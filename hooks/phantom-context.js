#!/usr/bin/env node
/**
 * PhantomOS Context Hook
 * Captures live context_window data from Claude Code and writes to a shared file.
 * Registered as a Notification hook in Claude Code settings.
 *
 * @author Subash Karki
 */
const fs = require('fs');
const path = require('path');

const CONTEXT_DIR = path.join(require('os').homedir(), '.claude', 'phantom-os', 'context');

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);

    // Extract session ID from the data
    const sessionId = data.session_id ?? data.sessionId ?? null;
    if (!sessionId) return;

    // Extract context window info
    const ctxWindow = data.context_window ?? {};
    const contextData = {
      sessionId,
      usedPercentage: ctxWindow.used_percentage ?? null,
      totalInputTokens: ctxWindow.total_input_tokens ?? null,
      totalOutputTokens: ctxWindow.total_output_tokens ?? null,
      maxTokens: ctxWindow.max_tokens ?? null,
      model: data.model?.display_name ?? data.model ?? null,
      cost: data.cost?.total_cost_usd ?? null,
      updatedAt: Date.now(),
    };

    // Only write if we have actual context data
    if (contextData.usedPercentage === null && contextData.totalInputTokens === null) return;

    // Write to per-session file
    if (!fs.existsSync(CONTEXT_DIR)) fs.mkdirSync(CONTEXT_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(CONTEXT_DIR, `${sessionId}.json`),
      JSON.stringify(contextData) + '\n'
    );
  } catch {
    // Never break the workflow
  }
});
