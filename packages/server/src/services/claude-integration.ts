/**
 * Claude Integration Service — consent-based Claude Code configuration
 *
 * Manages project-level CLAUDE.md instructions and PreToolUse hooks
 * for Phantom AI integration with Claude Code sessions.
 *
 * @author Subash Karki
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { registerPhantomMcpGlobal, unregisterPhantomMcpGlobal, sanitizeProjectPath } from './mcp-config.js';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CLAUDE_DIR = join(homedir(), '.claude');

const PHANTOM_CLAUDE_MD = `## Phantom AI Integration
- BEFORE editing any project file, call \`mcp__phantom-ai__phantom_graph_context\` to understand dependencies and related files
- BEFORE refactoring, call \`mcp__phantom-ai__phantom_graph_blast_radius\` to check what will break
- These tools are available via the phantom-ai MCP server — use them for all codebase work
`;

const PHANTOM_HOOK_COMMAND = `jq -r 'if (.tool_name == "Edit" or .tool_name == "Write" or .tool_name == "MultiEdit") then "<phantom-ai-reminder>Call mcp__phantom-ai__phantom_graph_context before editing to understand dependencies and related files.</phantom-ai-reminder>" elif (.tool_name == "Grep" or .tool_name == "Glob") then "<phantom-ai-reminder>For project-scoped searches prefer mcp__phantom-ai__phantom_graph_related or phantom_graph_context — dependency-graph aware and more accurate than pattern matching.</phantom-ai-reminder>" elif .tool_name == "Read" then ((.tool_input.file_path // "") as $fp | if ($fp | test("node_modules|[.]git/|/(dist|build|out|coverage|[.]next|[.]cache|[.]turbo)/|(package-lock[.]json|bun[.]lock|yarn[.]lock|pnpm-lock[.]yaml)$|[.](md|txt|lock|log|png|jpg|jpeg|svg|ico|webp|gif)$")) then empty else "<phantom-ai-reminder>Reading project source — consider mcp__phantom-ai__phantom_graph_context for dependency-aware understanding of this file.</phantom-ai-reminder>" end) else empty end' 2>/dev/null || true`;

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

interface ApplyOpts {
  mcp: boolean;
  instructions: boolean;
  hooks: boolean;
  projectPath: string;
}

/**
 * Apply Claude integration based on user consent choices.
 * Called from POST /api/claude-integration during onboarding Phase 4.
 */
export async function applyClaudeIntegration(opts: ApplyOpts): Promise<void> {
  const { mcp, instructions, hooks, projectPath } = opts;

  // MCP registration
  if (mcp) {
    registerPhantomMcpGlobal();
    logger.info('ClaudeIntegration', 'MCP registration enabled');
  } else {
    unregisterPhantomMcpGlobal();
    logger.info('ClaudeIntegration', 'MCP registration disabled');
  }

  // Project CLAUDE.md instructions
  if (instructions) {
    writeProjectClaudeMd(projectPath);
  } else {
    removeProjectClaudeMd(projectPath);
  }

  // PreToolUse hooks
  if (hooks) {
    writeProjectHooks(projectPath);
  } else {
    removeProjectHooks(projectPath);
  }
}

// ---------------------------------------------------------------------------
// CLAUDE.md Management
// ---------------------------------------------------------------------------

function getProjectClaudeMdPath(projectPath: string): string {
  const sanitized = sanitizeProjectPath(projectPath);
  return join(CLAUDE_DIR, 'projects', sanitized, 'CLAUDE.md');
}

/**
 * Write Phantom AI instructions to the project-level CLAUDE.md.
 * - If file exists and already has the section, skip.
 * - If file exists without the section, append.
 * - If file doesn't exist, create with the section.
 */
export function writeProjectClaudeMd(projectPath: string): void {
  const mdPath = getProjectClaudeMdPath(projectPath);
  try {
    const dir = dirname(mdPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    if (existsSync(mdPath)) {
      const content = readFileSync(mdPath, 'utf-8');
      if (content.includes('## Phantom AI Integration')) {
        logger.info('ClaudeIntegration', 'CLAUDE.md already has Phantom AI section — skipping');
        return;
      }
      // Append to existing file
      const separator = content.endsWith('\n') ? '\n' : '\n\n';
      writeFileSync(mdPath, content + separator + PHANTOM_CLAUDE_MD);
      logger.info('ClaudeIntegration', `Appended Phantom AI section to ${mdPath}`);
    } else {
      writeFileSync(mdPath, PHANTOM_CLAUDE_MD);
      logger.info('ClaudeIntegration', `Created ${mdPath} with Phantom AI section`);
    }
  } catch (err) {
    logger.error('ClaudeIntegration', `Failed to write CLAUDE.md:`, err);
  }
}

/**
 * Remove the Phantom AI section from project-level CLAUDE.md.
 * Deletes the file if it's empty after removal.
 */
export function removeProjectClaudeMd(projectPath: string): void {
  const mdPath = getProjectClaudeMdPath(projectPath);
  try {
    if (!existsSync(mdPath)) return;

    const content = readFileSync(mdPath, 'utf-8');
    if (!content.includes('## Phantom AI Integration')) return;

    // Remove the Phantom AI section (heading through end of that section)
    const cleaned = content
      .replace(/\n?## Phantom AI Integration\n[\s\S]*?(?=\n## |\s*$)/, '')
      .trim();

    if (cleaned.length === 0) {
      unlinkSync(mdPath);
      logger.info('ClaudeIntegration', `Deleted empty CLAUDE.md at ${mdPath}`);
    } else {
      writeFileSync(mdPath, cleaned + '\n');
      logger.info('ClaudeIntegration', `Removed Phantom AI section from ${mdPath}`);
    }
  } catch (err) {
    logger.error('ClaudeIntegration', `Failed to remove CLAUDE.md section:`, err);
  }
}

// ---------------------------------------------------------------------------
// Hooks Management
// ---------------------------------------------------------------------------

function getProjectSettingsPath(projectPath: string): string {
  const sanitized = sanitizeProjectPath(projectPath);
  return join(CLAUDE_DIR, 'projects', sanitized, 'settings.json');
}

interface HookEntry {
  type: string;
  command: string;
  timeout: number;
}

interface HookDef {
  matcher: string;
  hooks: HookEntry[];
}

interface ClaudeSettings {
  hooks?: {
    PreToolUse?: HookDef[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Write a PreToolUse hook for phantom-ai reminders to project settings.json.
 * Idempotent — skips if the hook is already installed.
 */
export function writeProjectHooks(projectPath: string): void {
  const settingsPath = getProjectSettingsPath(projectPath);
  try {
    const dir = dirname(settingsPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    let settings: ClaudeSettings = {};
    if (existsSync(settingsPath)) {
      try {
        settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
      } catch {
        settings = {};
      }
    }

    // Check if already installed
    const raw = JSON.stringify(settings);
    if (raw.includes('phantom-ai-reminder')) {
      logger.info('ClaudeIntegration', 'PreToolUse hook already installed — skipping');
      return;
    }

    if (!settings.hooks) {
      settings.hooks = {};
    }
    if (!settings.hooks.PreToolUse) {
      settings.hooks.PreToolUse = [];
    }

    const hookDef: HookDef = {
      matcher: 'Edit|Write|MultiEdit|Grep|Glob|Read',
      hooks: [{
        type: 'command',
        command: PHANTOM_HOOK_COMMAND,
        timeout: 3,
      }],
    };

    settings.hooks.PreToolUse.push(hookDef);
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    logger.info('ClaudeIntegration', `Installed PreToolUse hook in ${settingsPath}`);
  } catch (err) {
    logger.error('ClaudeIntegration', `Failed to write hooks:`, err);
  }
}

/**
 * Remove phantom-ai hooks from project settings.json.
 * Cleans up empty structures after removal.
 */
export function removeProjectHooks(projectPath: string): void {
  const settingsPath = getProjectSettingsPath(projectPath);
  try {
    if (!existsSync(settingsPath)) return;

    let settings: ClaudeSettings;
    try {
      settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    } catch {
      return;
    }

    const preToolUse = settings.hooks?.PreToolUse;
    if (!preToolUse) return;

    // Filter out hooks containing phantom-ai-reminder
    const filtered = preToolUse.filter(
      (def) => !JSON.stringify(def).includes('phantom-ai-reminder'),
    );

    if (filtered.length === preToolUse.length) return; // Nothing to remove

    if (filtered.length === 0) {
      delete settings.hooks!.PreToolUse;
      // Clean up empty hooks object
      if (settings.hooks && Object.keys(settings.hooks).length === 0) {
        delete settings.hooks;
      }
    } else {
      settings.hooks!.PreToolUse = filtered;
    }

    // If settings is now empty, delete the file
    if (Object.keys(settings).length === 0) {
      unlinkSync(settingsPath);
      logger.info('ClaudeIntegration', `Deleted empty settings.json at ${settingsPath}`);
    } else {
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
      logger.info('ClaudeIntegration', `Removed phantom-ai hooks from ${settingsPath}`);
    }
  } catch (err) {
    logger.error('ClaudeIntegration', `Failed to remove hooks:`, err);
  }
}
