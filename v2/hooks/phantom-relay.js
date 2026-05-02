#!/usr/bin/env node
// Author: Subash Karki
/**
 * PhantomOS v2 -- PostToolUse + Stop hook
 * Relays ALL Claude Code tool events to Phantom in real-time for
 * live activity tracking and conflict detection.
 * Fire-and-forget POST to /api/hooks/relay
 * @author Subash Karki
 */

const http = require('http');

const port = parseInt(process.env.PHANTOM_API_PORT || '3849', 10);

/**
 * Fire-and-forget relay -- never blocks Claude, swallows all errors.
 * Uses raw http.request (not fetch) for minimal overhead (~1ms).
 */
function relay(event) {
  const data = JSON.stringify(event);
  const req = http.request(
    {
      hostname: '127.0.0.1',
      port: port,
      path: '/api/hooks/relay',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      timeout: 2000,
    },
    () => {},
  );
  req.on('error', () => {}); // fire-and-forget
  req.on('timeout', () => req.destroy());
  req.write(data);
  req.end();
}

/**
 * Extract rich details from tool_input/tool_response based on tool type.
 * Returns a structured object the frontend can display without re-parsing.
 */
function parseToolDetails(toolName, rawInput, rawResponse) {
  const parsed = {};
  try {
    const input = typeof rawInput === 'object' ? rawInput : JSON.parse(rawInput || '{}');
    const response = typeof rawResponse === 'string' ? (() => { try { return JSON.parse(rawResponse); } catch { return {}; } })() : (rawResponse || {});

    switch (toolName) {
      case 'Edit':
      case 'MultiEdit':
        parsed.file_path = input.file_path || '';
        parsed.old_string = (input.old_string || '').slice(0, 500);
        parsed.new_string = (input.new_string || '').slice(0, 500);
        if (input.old_string && input.new_string) {
          parsed.lines_removed = (input.old_string.match(/\n/g) || []).length + 1;
          parsed.lines_added = (input.new_string.match(/\n/g) || []).length + 1;
        }
        break;
      case 'Write':
        parsed.file_path = input.file_path || '';
        parsed.content_length = (input.content || '').length;
        parsed.preview = (input.content || '').slice(0, 200);
        break;
      case 'Bash':
        parsed.command = (input.command || '').slice(0, 1000);
        parsed.exit_code = response.exit_code;
        parsed.stdout = (response.stdout || '').slice(0, 500);
        parsed.stderr = (response.stderr || '').slice(0, 500);
        break;
      case 'Read':
        parsed.file_path = input.file_path || '';
        break;
      case 'Grep':
      case 'Glob':
        parsed.pattern = input.pattern || input.query || '';
        break;
    }
  } catch {
    // Best-effort parsing -- never fail
  }
  return parsed;
}

/**
 * Report hook health (fire-and-forget).
 */
function reportHealth() {
  const data = JSON.stringify({ hook: 'phantom-relay', status: 'success' });
  const req = http.request(
    {
      hostname: '127.0.0.1',
      port: port,
      path: '/api/hook-health/report',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      timeout: 2000,
    },
    () => {},
  );
  req.on('error', () => {});
  req.on('timeout', () => req.destroy());
  req.write(data);
  req.end();
}

let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  try {
    if (process.env.PHANTOM_HOOK_DISABLE === '1') process.exit(0);

    const data = JSON.parse(input);
    const toolName = data.tool_name || '';
    const parsed = parseToolDetails(toolName, data.tool_input, data.tool_response);

    relay({
      type: 'tool_event',
      hook_type: process.env.CLAUDE_HOOK_EVENT || 'unknown',
      session_id: data.session_id || '',
      tool_name: toolName,
      tool_input: data.tool_input || {},
      tool_response: data.tool_response || '',
      tool_use_id: data.tool_use_id || '',
      duration_ms: data.duration_ms || 0,
      cwd: data.cwd || process.cwd(),
      timestamp: Date.now(),
      parsed: parsed,
    });

    reportHealth();
    process.exit(0);
  } catch {
    // Never fail -- Claude must not be blocked by a broken hook
    process.exit(0);
  }
});
