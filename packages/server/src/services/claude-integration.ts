/**
 * Claude Integration Service — consent-based Claude Code configuration
 *
 * Manages project-level CLAUDE.md instructions, PreToolUse gate hooks,
 * and lifecycle hooks (UserPromptSubmit, Stop, FileChanged) for
 * Phantom AI integration with Claude Code sessions.
 *
 * @author Subash Karki
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { registerPhantomMcpGlobal, unregisterPhantomMcpGlobal, sanitizeProjectPath } from './mcp-config.js';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CLAUDE_DIR = join(homedir(), '.claude');

/** Absolute path to the hooks directory (sibling of services/) */
const __dirname = dirname(fileURLToPath(import.meta.url));
const HOOKS_DIR = resolve(__dirname, '..', 'hooks');

const PHANTOM_CLAUDE_MD = `## Phantom AI Integration
- BEFORE editing any project file, call \`mcp__phantom-ai__phantom_graph_context\` to understand dependencies and related files
- BEFORE refactoring, call \`mcp__phantom-ai__phantom_graph_blast_radius\` to check what will break
- These tools are available via the phantom-ai MCP server — use them for all codebase work
`;

/** Marker used to identify all phantom-managed hooks during cleanup */
const PHANTOM_HOOK_MARKER = 'phantom-ai';

/**
 * PreToolUse hook for Edit/Write/MultiEdit — advisory by default (exit 0).
 * Only blocks (exit 2) when the user explicitly enables the gate via
 * the `ai.editGate` preference.
 * Escape hatch: set PHANTOM_GATE_DISABLE=1 to bypass entirely.
 */
const EDIT_GATE_COMMAND = [
  'if [ "$PHANTOM_GATE_DISABLE" = "1" ]; then exit 0; fi',
  'GATE_ENABLED=$(curl -s http://localhost:${PHANTOM_API_PORT:-3849}/api/preferences/ai 2>/dev/null | grep -o \'"ai.editGate":[^,}]*\' | grep -o \'true\\|false\' || echo "false")',
  'if [ "$GATE_ENABLED" = "true" ]; then echo "BLOCKED: Call phantom_before_edit with the target file paths before editing. This gives you dependency context and blast radius analysis." >&2; exit 2; fi',
  'echo "<phantom-ai-reminder>Consider calling phantom_before_edit for dependency context and blast radius analysis.</phantom-ai-reminder>"',
  'exit 0',
].join('; ');

/**
 * PreToolUse ADVISORY for Grep/Glob — exit 0, just a helpful nudge
 */
const SEARCH_ADVISORY_COMMAND = [
  '[ -n "$PHANTOM_HOOK_DISABLE" ] && exit 0',
  'echo "<phantom-ai-reminder>For project-scoped searches prefer mcp__phantom-ai__phantom_graph_related or phantom_graph_context — dependency-graph aware and more accurate than pattern matching.</phantom-ai-reminder>"',
  'exit 0',
].join('; ');

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
  async?: boolean;
  asyncRewake?: boolean;
  rewakeMessage?: string;
}

interface PreToolUseHookDef {
  matcher: string;
  hooks: HookEntry[];
}

type HookEventName = 'PreToolUse' | 'PostToolUse' | 'UserPromptSubmit' | 'Stop' | 'FileChanged';

interface ClaudeSettings {
  hooks?: {
    PreToolUse?: PreToolUseHookDef[];
    PostToolUse?: PreToolUseHookDef[];
    UserPromptSubmit?: HookEntry[];
    Stop?: HookEntry[];
    FileChanged?: HookEntry[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/** All hook event types managed by Phantom AI */
const PHANTOM_HOOK_EVENTS: HookEventName[] = [
  'PreToolUse',
  'PostToolUse',
  'UserPromptSubmit',
  'Stop',
  'FileChanged',
];

/**
 * Build a bun command to run a hook script with PHANTOM_API_PORT set.
 */
const hookCommand = (scriptName: string): string => {
  const port = process.env.PORT || '3849';
  const scriptPath = join(HOOKS_DIR, scriptName);
  return `PHANTOM_API_PORT=${port} bun run ${scriptPath}`;
};

/**
 * Write all Phantom AI hooks to project settings.json.
 *
 * Includes:
 * - PreToolUse gate (exit 2) for Edit/Write/MultiEdit
 * - PreToolUse advisory (exit 0) for Grep/Glob
 * - UserPromptSubmit → prompt-enricher.ts
 * - Stop → outcome-capture.ts
 * - FileChanged → file-changed.ts
 *
 * Idempotent — skips if hooks are already installed.
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

    // Check if already installed (any phantom-ai marker present)
    const raw = JSON.stringify(settings);
    if (raw.includes(PHANTOM_HOOK_MARKER)) {
      logger.info('ClaudeIntegration', 'Phantom AI hooks already installed — skipping');
      return;
    }

    if (!settings.hooks) {
      settings.hooks = {};
    }

    // ---- PreToolUse: Edit/Write gate (exit 2) ----
    if (!settings.hooks.PreToolUse) {
      settings.hooks.PreToolUse = [];
    }

    settings.hooks.PreToolUse.push({
      matcher: 'Edit|Write|MultiEdit',
      hooks: [{
        type: 'command',
        command: EDIT_GATE_COMMAND,
        timeout: 3,
      }],
    });

    // ---- PreToolUse: Grep/Glob advisory (exit 0) ----
    settings.hooks.PreToolUse.push({
      matcher: 'Grep|Glob',
      hooks: [{
        type: 'command',
        command: SEARCH_ADVISORY_COMMAND,
        timeout: 3,
      }],
    });

    // ---- PostToolUse: implicit feedback detector ----
    if (!settings.hooks.PostToolUse) {
      settings.hooks.PostToolUse = [];
    }
    settings.hooks.PostToolUse.push({
      matcher: 'Bash|Edit|Write',
      hooks: [{
        type: 'command',
        command: hookCommand('feedback-detector.ts'),
        timeout: 3000,
      }],
    });

    // ---- PostToolUse: execution verifier (auto-verify after edits) ----
    settings.hooks.PostToolUse.push({
      matcher: 'Edit|Write|MultiEdit',
      hooks: [{
        type: 'command',
        command: hookCommand('post-edit-verifier.ts'),
        timeout: 3000,
      }],
    });

    // ---- UserPromptSubmit: prompt enricher ----
    if (!settings.hooks.UserPromptSubmit) {
      settings.hooks.UserPromptSubmit = [];
    }
    settings.hooks.UserPromptSubmit.push({
      type: 'command',
      command: hookCommand('prompt-enricher.ts'),
      timeout: 3000,
    });

    // ---- Stop: outcome capture ----
    if (!settings.hooks.Stop) {
      settings.hooks.Stop = [];
    }
    settings.hooks.Stop.push({
      type: 'command',
      command: hookCommand('outcome-capture.ts'),
      timeout: 3000,
    });

    // ---- Stop: asyncRewake background analysis (Task 14) ----
    // Second Stop hook — runs in background after turn completion.
    // Only wakes Claude (exit 2) if important findings are discovered.
    settings.hooks.Stop.push({
      type: 'command',
      command: hookCommand('async-analyzer.ts'),
      timeout: 10000,
      async: true,
      asyncRewake: true,
      rewakeMessage: 'PhantomOS AI Engine has completed background analysis of your recent changes.',
    });

    // ---- FileChanged: incremental graph update ----
    if (!settings.hooks.FileChanged) {
      settings.hooks.FileChanged = [];
    }
    settings.hooks.FileChanged.push({
      type: 'command',
      command: hookCommand('file-changed.ts'),
      timeout: 3000,
    });

    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    logger.info('ClaudeIntegration', `Installed Phantom AI hooks in ${settingsPath}`);
  } catch (err) {
    logger.error('ClaudeIntegration', `Failed to write hooks:`, err);
  }
}

/**
 * Update AI engine toggles without re-running full onboarding.
 * Persists toggles to the preferences DB via the preferences API pattern.
 */
export const updateClaudeIntegration = async (
  _projectPath: string,
  toggles: Record<string, boolean>,
): Promise<void> => {
  const port = process.env.PORT || '3849';
  try {
    await fetch(`http://localhost:${port}/api/preferences/ai`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toggles),
    });
    logger.info('ClaudeIntegration', `Updated AI toggles: ${JSON.stringify(toggles)}`);
  } catch (err) {
    logger.error('ClaudeIntegration', `Failed to update AI toggles:`, err);
  }
};

/**
 * Remove all Phantom AI hooks from project settings.json.
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

    if (!settings.hooks) return;

    let changed = false;

    // Remove PreToolUse / PostToolUse entries containing phantom-ai markers
    for (const toolEvent of ['PreToolUse', 'PostToolUse'] as const) {
      const arr = settings.hooks[toolEvent];
      if (arr) {
        const before = arr.length;
        settings.hooks[toolEvent] = arr.filter(
          (def) => !JSON.stringify(def).includes(PHANTOM_HOOK_MARKER),
        );
        if (settings.hooks[toolEvent]!.length !== before) changed = true;
        if (settings.hooks[toolEvent]!.length === 0) delete settings.hooks[toolEvent];
      }
    }

    // Remove lifecycle hooks containing phantom-ai markers
    for (const event of ['UserPromptSubmit', 'Stop', 'FileChanged'] as const) {
      const arr = settings.hooks[event] as HookEntry[] | undefined;
      if (!arr) continue;

      const before = arr.length;
      const filtered = arr.filter(
        (entry) => !JSON.stringify(entry).includes(PHANTOM_HOOK_MARKER),
      );
      if (filtered.length !== before) changed = true;

      if (filtered.length === 0) {
        delete settings.hooks[event];
      } else {
        (settings.hooks as Record<string, unknown>)[event] = filtered;
      }
    }

    if (!changed) return;

    // Clean up empty hooks object
    if (Object.keys(settings.hooks).length === 0) {
      delete settings.hooks;
    }

    // If settings is now empty, delete the file
    if (Object.keys(settings).length === 0) {
      unlinkSync(settingsPath);
      logger.info('ClaudeIntegration', `Deleted empty settings.json at ${settingsPath}`);
    } else {
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
      logger.info('ClaudeIntegration', `Removed Phantom AI hooks from ${settingsPath}`);
    }
  } catch (err) {
    logger.error('ClaudeIntegration', `Failed to remove hooks:`, err);
  }
}
