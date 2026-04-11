#!/usr/bin/env node
/**
 * Standalone MCP stdio entry point — spawned by Claude as a child process.
 * Project-scoped via PHANTOM_PROJECT_ID env var so each Claude session
 * only sees its own project's graph.
 *
 * Internal to PhantomOS — not intended for external use.
 * Requires the PhantomOS server to be running (graph data in SQLite).
 *
 * @author Subash Karki
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { sqlite, runMigrations } from '@phantom-os/db';
import { graphEngine } from '../services/graph-engine.js';
import { createMcpServer } from './server.js';

const projectId = process.env.PHANTOM_PROJECT_ID;

// Bootstrap database (migrations only — no full server boot)
runMigrations(sqlite);

// Initialize graph engine with a no-op broadcast (no SSE clients in standalone mode)
graphEngine.init(() => {});

// Create and connect MCP server, scoped to project if specified
const server = createMcpServer(graphEngine, projectId);
const transport = new StdioServerTransport();

await server.connect(transport);

// Keep process alive until stdin closes
process.stdin.resume();

async function shutdown(): Promise<void> {
  await server.close();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
