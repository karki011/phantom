/**
 * MCP Config Lifecycle — Writes and cleans up .mcp.json for Claude sessions
 * Each Claude terminal session gets a project-scoped MCP config so Claude
 * auto-discovers the PhantomOS AI engine tools.
 *
 * Reference counting ensures concurrent sessions sharing a cwd don't
 * clobber or prematurely delete the config.
 *
 * @author Subash Karki
 */
import { writeFileSync, unlinkSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { db, worktrees, projects } from '@phantom-os/db';
import { eq } from 'drizzle-orm';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// Reference counting — tracks active Claude sessions per cwd
// ---------------------------------------------------------------------------

const refCounts = new Map<string, number>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve the path to the stdio entry point */
function getStdioEntryPath(): string {
  // In dev: resolve relative to this file's location
  // packages/server/src/services/mcp-config.ts → packages/server/src/mcp/stdio-entry.ts
  return resolve(import.meta.dirname, '..', 'mcp', 'stdio-entry.ts');
}

/** Look up projectId from a worktreeId */
export function resolveProjectId(worktreeId: string): string | null {
  const wt = db.select({ projectId: worktrees.projectId })
    .from(worktrees)
    .where(eq(worktrees.id, worktreeId))
    .get();
  return wt?.projectId ?? null;
}

/** Look up projectId from a cwd path (matches against project repoPath or worktree worktreePath) */
export function resolveProjectIdFromCwd(cwd: string): string | null {
  // Try matching worktree path first
  const wt = db.select({ projectId: worktrees.projectId })
    .from(worktrees)
    .where(eq(worktrees.worktreePath, cwd))
    .get();
  if (wt) return wt.projectId;

  // Try matching project repo path
  const proj = db.select({ id: projects.id })
    .from(projects)
    .where(eq(projects.repoPath, cwd))
    .get();
  return proj?.id ?? null;
}

// ---------------------------------------------------------------------------
// Config generation
// ---------------------------------------------------------------------------

/**
 * Build the .mcp.json content for a Claude session.
 * Uses stdio transport — Claude spawns the MCP server as a child process.
 */
interface McpConfig {
  mcpServers: Record<string, {
    command: string;
    args: string[];
    env: Record<string, string>;
  }>;
}

function buildMcpConfig(projectId: string): McpConfig {
  const entryPath = getStdioEntryPath();
  return {
    mcpServers: {
      'phantom-ai': {
        command: 'npx',
        args: ['tsx', entryPath],
        env: {
          PHANTOM_PROJECT_ID: projectId,
          PHANTOM_API_PORT: String(process.env.PORT || 3849),
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Write .mcp.json to the given cwd for a Claude session.
 * Safe for concurrent sessions — uses reference counting.
 * Returns true if config was written (or already exists).
 */
export function writeMcpConfig(cwd: string, projectId: string): boolean {
  const configPath = join(cwd, '.mcp.json');
  const count = refCounts.get(cwd) ?? 0;

  if (count > 0) {
    // Verify file still exists; re-write if deleted externally
    if (!existsSync(configPath)) {
      try {
        const configDir = dirname(configPath);
        mkdirSync(configDir, { recursive: true });
        const config = { mcpServers: buildMcpConfig(projectId).mcpServers };
        writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
        logger.info('McpConfig', `Re-injected .mcp.json to ${cwd} (file was deleted externally)`);
      } catch (err) {
        logger.error('McpConfig', `Failed to re-inject .mcp.json to ${cwd}:`, err);
      }
    }
    refCounts.set(cwd, count + 1);
    return true;
  }

  if (count === 0) {
    // First session for this cwd — write the config
    try {
      // If an existing .mcp.json exists, merge our server into it
      let config: Record<string, unknown> = {};
      if (existsSync(configPath)) {
        try {
          config = JSON.parse(readFileSync(configPath, 'utf-8'));
        } catch {
          config = {};
        }
      }

      const phantomConfig = buildMcpConfig(projectId);
      const existingServers = (config.mcpServers ?? {}) as Record<string, unknown>;
      config.mcpServers = { ...existingServers, ...phantomConfig.mcpServers };

      writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
      logger.info('McpConfig', `Wrote .mcp.json to ${cwd} for project ${projectId}`);
    } catch (err) {
      logger.error('McpConfig', `Failed to write .mcp.json to ${cwd}:`, err);
      return false;
    }
  }

  refCounts.set(cwd, count + 1); // Only increment after successful write or existing config
  return true;
}

/**
 * Clean up .mcp.json when a Claude session ends.
 * Only removes the file when the last session for that cwd closes.
 */
export function cleanupMcpConfig(cwd: string): void {
  const count = refCounts.get(cwd) ?? 0;
  if (count <= 1) {
    // Last session — remove phantom-ai from config
    refCounts.delete(cwd);
    const configPath = join(cwd, '.mcp.json');

    try {
      if (!existsSync(configPath)) return;

      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      if (config.mcpServers?.['phantom-ai']) {
        delete config.mcpServers['phantom-ai'];

        // If no servers left, delete the file entirely
        if (Object.keys(config.mcpServers).length === 0) {
          unlinkSync(configPath);
          logger.info('McpConfig', `Removed .mcp.json from ${cwd}`);
        } else {
          writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
          logger.info('McpConfig', `Removed phantom-ai from .mcp.json in ${cwd}`);
        }
      }
    } catch (err) {
      logger.error('McpConfig', `Failed to clean up .mcp.json in ${cwd}:`, err);
    }
  } else {
    refCounts.set(cwd, count - 1);
  }
}
