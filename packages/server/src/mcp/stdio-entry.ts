#!/usr/bin/env node
/**
 * Standalone MCP stdio entry point
 * Run this directly so external AI agents (Claude Code, Cursor, etc.) can connect
 * without starting the full Hono HTTP server.
 *
 * Usage in .claude/settings.json or MCP config:
 * {
 *   "mcpServers": {
 *     "phantom-os": {
 *       "command": "npx",
 *       "args": ["tsx", "packages/server/src/mcp/stdio-entry.ts"]
 *     }
 *   }
 * }
 *
 * @author Subash Karki
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { sqlite, runMigrations } from '@phantom-os/db';
import { graphEngine } from '../services/graph-engine.js';
import { createMcpServer } from './server.js';

// Bootstrap database (migrations only — no full server boot)
runMigrations(sqlite);

// Initialize graph engine with a no-op broadcast (no SSE clients in standalone mode)
graphEngine.init(() => {});

// Create and connect MCP server
const server = createMcpServer(graphEngine);
const transport = new StdioServerTransport();

await server.connect(transport);

// Keep process alive until stdin closes
process.stdin.resume();
process.on('SIGINT', async () => {
  await server.close();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await server.close();
  process.exit(0);
});
