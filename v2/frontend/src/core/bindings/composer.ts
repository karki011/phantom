// Phantom — Composer bindings (agentic edit pane)
// Author: Subash Karki

import { normalize } from './_normalize';

const App = () => (window as any).go?.['app']?.App;

export interface ComposerMention {
  path: string;
}

export interface ComposerEditCard {
  id: string;
  turn_id: string;
  pane_id: string;
  path: string;
  old_content: string;
  new_content: string;
  lines_added: number;
  lines_removed: number;
  status: 'pending' | 'accepted' | 'discarded';
  created_at: number;
  decided_at: number;
}

export interface ComposerEvent {
  pane_id: string;
  turn_id?: string;
  type: 'delta' | 'thinking' | 'tool_use' | 'tool_result' | 'input_json' | 'result' | 'done' | 'error' | 'strategy' | 'session_started';
  content?: string;
  tool_name?: string;
  tool_input?: string;
  tool_use_id?: string;
  is_error?: boolean;
  // Session-specific fields, populated on type=="session_started".
  session_id?: string;
  session_name?: string;
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
  // Strategy-specific fields, populated on type=="strategy".
  strategy_name?: string;
  strategy_confidence?: number;
  task_complexity?: string;
  task_risk?: string;
  blast_radius?: number;
}

/**
 * Start a new Composer turn.
 *
 * @param noContext When true, the agent runs in a fresh temp directory with
 *   --setting-sources "" so it has zero awareness of the user's project
 *   (no CLAUDE.md, .claude/, hooks, settings, skills). Defaults to false —
 *   existing callers see no behaviour change.
 * @param effort Reasoning effort level ('low' | 'medium' | 'high' | 'max').
 *   Empty string means "don't pass the flag" (auto/default).
 */
export async function composerSend(
  paneId: string,
  prompt: string,
  cwd: string,
  model: string,
  mentions: ComposerMention[],
  noContext = false,
  effort = '',
): Promise<{ id: string; error?: string }> {
  try {
    const id = await App()?.ComposerSend(paneId, prompt, cwd, model, mentions, noContext, effort);
    return { id: typeof id === 'string' ? id : '' };
  } catch (e) {
    return { id: '', error: e instanceof Error ? e.message : String(e) };
  }
}

export async function composerCancel(paneId: string): Promise<void> {
  try {
    await App()?.ComposerCancel(paneId);
  } catch {
    /* ignore */
  }
}

/**
 * Check whether the backend has an in-flight run for this pane.
 * Used on pane mount/remount to restore the "running" indicator when the
 * backend is still streaming but the frontend lost its event subscriptions
 * (e.g. after a tab switch that caused a SolidJS reactive dispose/recreate).
 */
export async function composerIsRunning(paneId: string): Promise<boolean> {
  try {
    return !!(await App()?.ComposerIsRunning(paneId));
  } catch {
    return false;
  }
}

/** Drop the cached claude session for this pane — next send starts fresh. */
export async function composerNewConversation(paneId: string): Promise<void> {
  try {
    await App()?.ComposerNewConversation(paneId);
  } catch {
    /* ignore */
  }
}

export async function composerDecideEdit(editId: string, accept: boolean): Promise<boolean> {
  try {
    await App()?.ComposerDecideEdit(editId, accept);
    return true;
  } catch {
    return false;
  }
}

export async function composerListPending(paneId: string): Promise<ComposerEditCard[]> {
  try {
    const raw = (await App()?.ComposerListPending(paneId)) ?? [];
    return normalize<ComposerEditCard[]>(raw);
  } catch {
    return [];
  }
}

export interface ComposerEventRecord {
  id: number;
  turn_id: string;
  session_id: string;
  seq: number;
  type: string;
  subtype: string;
  tool_name: string;
  tool_use_id: string;
  content: string;
  created_at: number;
}

export interface ComposerHistoryTurn {
  turn: {
    id: string;
    pane_id: string;
    session_id: string;
    cwd: string;
    prompt: string;
    model: string;
    status: 'running' | 'done' | 'error' | string;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
    started_at: number;
    completed_at: number;
    /**
     * Assistant's persisted streamed text. Empty for turns recorded before
     * migration 010 (or for turns that errored before the first delta).
     * Tolerate "" — past turns can still be useful from prompt + edits.
     */
    response_text: string;
  };
  edits: ComposerEditCard[];
  events: ComposerEventRecord[];
}

export async function composerHistory(paneId: string): Promise<ComposerHistoryTurn[]> {
  try {
    const raw = (await App()?.ComposerHistory(paneId)) ?? [];
    return normalize<ComposerHistoryTurn[]>(raw);
  } catch {
    return [];
  }
}

export interface ComposerSessionSummary {
  session_id: string;
  name: string; // Pokémon-style memorable name
  first_pane_id: string;
  first_prompt: string;
  turn_count: number;
  last_activity: number; // unix seconds
  total_cost: number;
  cwd: string;
}

/**
 * List the 50 most recently active claude sessions known to Composer,
 * ordered by last activity (newest first). Drives the "Past Sessions"
 * sidebar inside the Composer pane.
 */
export async function composerListSessions(): Promise<ComposerSessionSummary[]> {
  try {
    const raw = (await App()?.ComposerListSessions()) ?? [];
    return normalize<ComposerSessionSummary[]>(raw);
  } catch {
    return [];
  }
}

/**
 * Fetch every turn (with edits) belonging to the given claude session_id —
 * used to rehydrate a pane that resumed a session it didn't originally own.
 */
export async function composerHistoryBySession(sessionId: string): Promise<ComposerHistoryTurn[]> {
  try {
    const raw = (await App()?.ComposerHistoryBySession(sessionId)) ?? [];
    return normalize<ComposerHistoryTurn[]>(raw);
  } catch {
    return [];
  }
}

/**
 * Bind a pane to an existing claude session so the pane's next Send
 * re-attaches via `--resume <sessionId>`. Call BEFORE the first send on
 * a pane that opened with a sessionId from the Past Sessions sidebar.
 */
export async function composerResumeSession(paneId: string, sessionId: string): Promise<void> {
  try {
    await App()?.ComposerResumeSession(paneId, sessionId);
  } catch {
    /* ignore */
  }
}

/**
 * Hard-delete a past session — removes its turns + edits from the database
 * and detaches any pane currently bound to it (cancelling in-flight runs).
 * Returns true on success, false if the binding threw.
 */
export async function composerDeleteSession(sessionId: string): Promise<boolean> {
  try {
    await App()?.ComposerDeleteSession(sessionId);
    return true;
  } catch {
    return false;
  }
}

// ── Memory context ────────────────────────────────────────────────────

export interface MemoryContextItem {
  level: 'global' | 'project' | 'rule';
  path: string;
  content: string;
  size: number;
}

/**
 * Read CLAUDE.md files and .claude/rules/ from the project (and global
 * ~/.claude/CLAUDE.md). Returns an empty array if the binding is missing
 * (e.g. running outside Wails).
 */
export async function composerGetMemoryContext(cwd: string): Promise<MemoryContextItem[]> {
  try {
    const raw = (await App()?.ComposerGetMemoryContext(cwd)) ?? [];
    return normalize<MemoryContextItem[]>(raw);
  } catch {
    return [];
  }
}

// ── Skill browser ─────────────────────────────────────────────────────

export interface ComposerSkill {
  id: string;
  name: string;
  description: string;
  path: string;
}

/**
 * List available skills from <cwd>/.claude/skills/. Each skill directory
 * must contain a SKILL.md with optional YAML frontmatter (name, description).
 */
export async function composerListSkills(cwd: string): Promise<ComposerSkill[]> {
  try {
    const raw = (await App()?.ComposerListSkills(cwd)) ?? [];
    return normalize<ComposerSkill[]>(raw);
  } catch {
    return [];
  }
}

// ── Slash command autocomplete ───────────────────────────────────────

export interface ComposerCommand {
  name: string;
  description: string;
  argument_hint: string;
  model: string;
  allowed_tools: string;
  source: string; // "project" | "global" | "plugin:<name>"
  file_path: string;
}

export async function composerListCommands(cwd: string): Promise<ComposerCommand[]> {
  try {
    const raw = (await App()?.ComposerListCommands(cwd)) ?? [];
    return normalize<ComposerCommand[]>(raw);
  } catch {
    return [];
  }
}
