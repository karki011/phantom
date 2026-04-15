/**
 * MCP Config Lifecycle — Global phantom-ai registration in ~/.mcp.json
 *
 * Instead of writing per-project .mcp.json files (which pollutes user repos),
 * phantom-ai is registered once globally.  The MCP stdio-entry auto-detects
 * which project to scope to via process.cwd().
 *
 * Also manages the `enabledMcpjsonServers` list in ~/.claude/settings.json
 * so Claude knows to activate the server.
 *
 * @author Subash Karki
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { db, worktrees, projects } from '@phantom-os/db';
import { eq } from 'drizzle-orm';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// Helpers — project ID resolution (used by stdio-entry and terminal-ws)
// ---------------------------------------------------------------------------

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
// Paths
// ---------------------------------------------------------------------------

const GLOBAL_MCP_JSON = join(homedir(), '.mcp.json');
const CLAUDE_SETTINGS = join(homedir(), '.claude', 'settings.json');

/** Resolve the path to the stdio entry point */
function getStdioEntryPath(): string {
  return resolve(import.meta.dirname, '..', 'mcp', 'stdio-entry.ts');
}

// ---------------------------------------------------------------------------
// Global registration
// ---------------------------------------------------------------------------

/**
 * Register phantom-ai in the global ~/.mcp.json so it's available in every
 * Claude session.  The stdio-entry auto-detects the project from cwd,
 * so no project-specific env vars are needed.
 *
 * Also ensures phantom-ai is in the `enabledMcpjsonServers` list in
 * ~/.claude/settings.json.
 *
 * Safe to call multiple times — idempotent.
 */
export function registerPhantomMcpGlobal(): void {
  const entryPath = getStdioEntryPath();
  const serverDef = {
    command: 'npx',
    args: ['tsx', entryPath],
    env: {
      PHANTOM_API_PORT: String(process.env.PORT || 3849),
    },
  };

  // ── ~/.mcp.json ────────────────────────────────────────────────────────
  try {
    let config: Record<string, unknown> = {};
    if (existsSync(GLOBAL_MCP_JSON)) {
      try {
        config = JSON.parse(readFileSync(GLOBAL_MCP_JSON, 'utf-8'));
      } catch {
        config = {};
      }
    }

    const servers = (config.mcpServers ?? {}) as Record<string, unknown>;

    // Check if already registered with the same entry path
    const existing = servers['phantom-ai'] as Record<string, unknown> | undefined;
    if (existing) {
      const existingArgs = existing.args as string[] | undefined;
      if (existingArgs && existingArgs[1] === entryPath) {
        // Already registered with the correct entry — skip write
        ensureEnabledInClaudeSettings();
        return;
      }
    }

    servers['phantom-ai'] = serverDef;
    config.mcpServers = servers;
    writeFileSync(GLOBAL_MCP_JSON, JSON.stringify(config, null, 2) + '\n');
    logger.info('McpConfig', `Registered phantom-ai in ${GLOBAL_MCP_JSON}`);
  } catch (err) {
    logger.error('McpConfig', `Failed to register phantom-ai globally:`, err);
  }

  ensureEnabledInClaudeSettings();
}

/**
 * Ensure phantom-ai is in the enabledMcpjsonServers list in ~/.claude/settings.json.
 * Claude only activates servers from .mcp.json that appear in this whitelist.
 */
function ensureEnabledInClaudeSettings(): void {
  try {
    const claudeDir = dirname(CLAUDE_SETTINGS);
    if (!existsSync(claudeDir)) {
      mkdirSync(claudeDir, { recursive: true });
    }

    let settings: Record<string, unknown> = {};
    if (existsSync(CLAUDE_SETTINGS)) {
      try {
        settings = JSON.parse(readFileSync(CLAUDE_SETTINGS, 'utf-8'));
      } catch {
        settings = {};
      }
    }

    const enabled = (settings.enabledMcpjsonServers ?? []) as string[];
    if (!enabled.includes('phantom-ai')) {
      enabled.push('phantom-ai');
      settings.enabledMcpjsonServers = enabled;
      writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2) + '\n');
      logger.info('McpConfig', 'Added phantom-ai to enabledMcpjsonServers');
    }
  } catch (err) {
    logger.warn('McpConfig', `Failed to update Claude settings: ${(err as Error).message}`);
  }
}

/**
 * Sanitize a filesystem path into Claude's project directory key.
 * Claude Code uses: replace '/' with '-', strip leading '-'.
 */
export function sanitizeProjectPath(projectPath: string): string {
  return projectPath.replace(/\//g, '-').replace(/^-/, '');
}

/**
 * Remove phantom-ai from global ~/.mcp.json and enabledMcpjsonServers.
 * Call on Phantom uninstall or when user explicitly disables the integration.
 */
export function unregisterPhantomMcpGlobal(): void {
  // ── ~/.mcp.json ────────────────────────────────────────────────────────
  try {
    if (existsSync(GLOBAL_MCP_JSON)) {
      const config = JSON.parse(readFileSync(GLOBAL_MCP_JSON, 'utf-8'));
      if (config.mcpServers?.['phantom-ai']) {
        delete config.mcpServers['phantom-ai'];
        if (Object.keys(config.mcpServers).length === 0) {
          delete config.mcpServers;
        }
        if (Object.keys(config).length === 0) {
          unlinkSync(GLOBAL_MCP_JSON);
        } else {
          writeFileSync(GLOBAL_MCP_JSON, JSON.stringify(config, null, 2) + '\n');
        }
        logger.info('McpConfig', 'Removed phantom-ai from ~/.mcp.json');
      }
    }
  } catch (err) {
    logger.warn('McpConfig', `Failed to remove from ~/.mcp.json: ${(err as Error).message}`);
  }

  // ── ~/.claude/settings.json ────────────────────────────────────────────
  try {
    if (existsSync(CLAUDE_SETTINGS)) {
      const settings = JSON.parse(readFileSync(CLAUDE_SETTINGS, 'utf-8'));
      const enabled = (settings.enabledMcpjsonServers ?? []) as string[];
      const idx = enabled.indexOf('phantom-ai');
      if (idx !== -1) {
        enabled.splice(idx, 1);
        settings.enabledMcpjsonServers = enabled;
        writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2) + '\n');
        logger.info('McpConfig', 'Removed phantom-ai from enabledMcpjsonServers');
      }
    }
  } catch (err) {
    logger.warn('McpConfig', `Failed to update Claude settings: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Legacy cleanup — remove per-project .mcp.json phantom-ai entries
// ---------------------------------------------------------------------------

/**
 * Clean up a per-project .mcp.json that was written by the old writeMcpConfig.
 * Removes the phantom-ai entry; deletes the file if no other servers remain.
 */
export function cleanupLegacyMcpConfig(cwd: string): void {
  const configPath = join(cwd, '.mcp.json');
  try {
    if (!existsSync(configPath)) return;

    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    if (config.mcpServers?.['phantom-ai']) {
      delete config.mcpServers['phantom-ai'];

      if (Object.keys(config.mcpServers).length === 0) {
        unlinkSync(configPath);
        logger.info('McpConfig', `Removed legacy .mcp.json from ${cwd}`);
      } else {
        writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
        logger.info('McpConfig', `Removed phantom-ai from legacy .mcp.json in ${cwd}`);
      }
    }
  } catch {
    // Ignore — best-effort cleanup
  }
}
