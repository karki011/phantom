#!/usr/bin/env node
/**
 * Standalone MCP stdio entry point — spawned by Claude as a child process.
 *
 * Project detection order:
 *   1. PHANTOM_PROJECT_ID env var (explicit, backward-compatible)
 *   2. Auto-detect from process.cwd() — walks up the directory tree checking
 *      the DB for a matching worktree path or project repo path.
 *
 * This allows phantom-ai to be registered globally in ~/.mcp.json (no per-project
 * .mcp.json needed) because Claude spawns MCP servers with cwd = the project dir.
 *
 * Internal to PhantomOS — not intended for external use.
 *
 * @author Subash Karki
 */
import { dirname } from 'node:path';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { sqlite, runMigrations, db, worktrees, projects } from '@phantom-os/db';
import { eq } from 'drizzle-orm';
import { graphEngine } from '../services/graph-engine.js';
import { orchestratorEngine } from '../services/orchestrator-engine.js';
import { createMcpServer } from './server.js';

// Bootstrap database (migrations only — no full server boot)
runMigrations(sqlite);

/**
 * Auto-detect the PhantomOS project from process.cwd().
 * Walks up the directory tree, checking each directory against the DB for
 * a matching worktree path or project repo path.
 */
function autoDetectProjectId(): string | undefined {
  let dir = process.cwd();
  const root = dirname(dir) === dir ? dir : '/'; // filesystem root

  while (true) {
    // Check worktree paths
    const wt = db.select({ projectId: worktrees.projectId })
      .from(worktrees)
      .where(eq(worktrees.worktreePath, dir))
      .get();
    if (wt?.projectId) return wt.projectId;

    // Check project repo paths
    const proj = db.select({ id: projects.id })
      .from(projects)
      .where(eq(projects.repoPath, dir))
      .get();
    if (proj?.id) return proj.id;

    // Walk up
    const parent = dirname(dir);
    if (parent === dir || parent === root) break;
    dir = parent;
  }
  return undefined;
}

const projectId = process.env.PHANTOM_PROJECT_ID || autoDetectProjectId();

// Initialize graph engine with a no-op broadcast (no SSE clients in standalone mode)
graphEngine.init(() => {});
orchestratorEngine.init(() => {});

// Create and connect MCP server, scoped to project if specified
const server = createMcpServer(graphEngine, projectId, orchestratorEngine);
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
