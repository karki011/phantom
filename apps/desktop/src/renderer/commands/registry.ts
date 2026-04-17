/**
 * Command registry — central list of worktree-scoped commands exposed via
 * the Command Palette (Cmd+Shift+P). Each command is self-contained so the
 * palette UI stays dumb; adding a new command means appending to COMMANDS.
 *
 * @author Subash Karki
 */
import type { PaneStoreCompat } from '@phantom-os/panes';
import { jotaiStore } from '@phantom-os/panes';
import { composerOpenAtom } from '../atoms/chatDraft';
import { API_BASE, type WorktreeData } from '../lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CommandCategory =
  | 'File'
  | 'Worktree'
  | 'Terminal'
  | 'AI'
  | 'View'
  | 'Git';

export interface CommandContext {
  worktree: WorktreeData | null;
  store: PaneStoreCompat;
}

export interface Command {
  id: string;
  title: string;
  category: CommandCategory;
  /** Display-only keybinding hint (actual binding wired separately). */
  keybinding?: string;
  /** Return false to hide the command (e.g. worktree-required commands). */
  when?: (ctx: CommandContext) => boolean;
  run: (ctx: CommandContext) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const requireWorktree = (ctx: CommandContext): ctx is CommandContext & {
  worktree: WorktreeData;
} => ctx.worktree !== null;

const invoke = async (channel: string, ...args: unknown[]): Promise<unknown> => {
  const desktop = (window as unknown as { phantomOS?: { invoke?: (ch: string, ...a: unknown[]) => Promise<unknown> } }).phantomOS;
  if (!desktop?.invoke) return null;
  return desktop.invoke(channel, ...args);
};

/**
 * Split the active pane into a new terminal. If the active pane is itself a
 * terminal, inherit its `cwd` so "split right" opens a sibling shell in the
 * same directory (matches VSCode/iTerm2 behavior). Otherwise fall back to
 * the worktree root.
 */
const splitTerminalFromActive = (
  ctx: CommandContext,
  direction: 'horizontal' | 'vertical',
): void => {
  if (!requireWorktree(ctx)) return;
  const active = ctx.store.getActivePane();
  if (!active) {
    ctx.store.addPaneAsTab(
      'terminal',
      { cwd: ctx.worktree.worktreePath } as Record<string, unknown>,
      'Terminal',
    );
    return;
  }
  const inheritedCwd =
    active.kind === 'terminal' && typeof active.data?.cwd === 'string'
      ? (active.data.cwd as string)
      : ctx.worktree.worktreePath;
  ctx.store.splitPane(
    active.id,
    direction,
    'terminal',
    { cwd: inheritedCwd } as Record<string, unknown>,
    'Terminal',
  );
};

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

export const COMMANDS: Command[] = [
  // ── AI / Claude ─────────────────────────────────────────────────────────
  {
    id: 'ai.open-composer',
    title: 'Send to Claude (Floating Composer)',
    category: 'AI',
    keybinding: '⌘I',
    // Only meaningful when the focused pane is a terminal — the composer
    // injects text into it. Hiding in other contexts avoids an empty popover
    // appearing beside an editor / file tree.
    when: (ctx) => ctx.store.getActivePane()?.kind === 'terminal',
    run: (ctx) => {
      if (ctx.store.getActivePane()?.kind !== 'terminal') return;
      jotaiStore.set(composerOpenAtom, (prev) => !prev);
    },
  },
  {
    id: 'ai.new-claude',
    title: 'New Claude Session',
    category: 'AI',
    keybinding: '⌘K C',
    when: requireWorktree,
    run: (ctx) => {
      if (!requireWorktree(ctx)) return;
      ctx.store.addPaneAsTab(
        'terminal',
        {
          cwd: ctx.worktree.worktreePath,
          initialCommand: 'claude --dangerously-skip-permissions',
        } as Record<string, unknown>,
        'Claude',
      );
    },
  },
  {
    id: 'ai.open-chat',
    title: 'Open Chat',
    category: 'AI',
    keybinding: '⌘K H',
    run: (ctx) => {
      ctx.store.addPaneAsTab(
        'chat',
        { cwd: ctx.worktree?.worktreePath } as Record<string, unknown>,
        'Chat',
      );
    },
  },
  {
    id: 'ai.open-journal',
    title: 'Open Journal',
    category: 'AI',
    keybinding: '⌘K J',
    run: (ctx) => {
      ctx.store.addPaneAsTab(
        'journal',
        {} as Record<string, unknown>,
        'Journal',
      );
    },
  },

  // ── Terminal ────────────────────────────────────────────────────────────
  {
    id: 'terminal.new',
    title: 'New Terminal',
    category: 'Terminal',
    keybinding: '⌘`',
    when: requireWorktree,
    run: (ctx) => {
      if (!requireWorktree(ctx)) return;
      ctx.store.addPaneAsTab(
        'terminal',
        { cwd: ctx.worktree.worktreePath } as Record<string, unknown>,
        'Terminal',
      );
    },
  },
  {
    id: 'terminal.split-right',
    title: 'Split Terminal Right',
    category: 'Terminal',
    keybinding: '⌘\\',
    when: requireWorktree,
    run: (ctx) => splitTerminalFromActive(ctx, 'horizontal'),
  },
  {
    id: 'terminal.split-down',
    title: 'Split Terminal Down',
    category: 'Terminal',
    keybinding: '⌘⇧\\',
    when: requireWorktree,
    run: (ctx) => splitTerminalFromActive(ctx, 'vertical'),
  },

  // ── Worktree ────────────────────────────────────────────────────────────
  {
    id: 'worktree.reveal-in-finder',
    title: 'Reveal Worktree in Finder',
    category: 'Worktree',
    keybinding: '⌘K F',
    when: requireWorktree,
    run: async (ctx) => {
      if (!requireWorktree(ctx) || !ctx.worktree.worktreePath) return;
      await invoke('phantom:open-in-finder', ctx.worktree.worktreePath);
    },
  },
  {
    id: 'worktree.open-in-external-editor',
    title: 'Open Worktree in External Editor',
    category: 'Worktree',
    keybinding: '⌘K E',
    when: requireWorktree,
    run: async (ctx) => {
      if (!requireWorktree(ctx) || !ctx.worktree.worktreePath) return;
      await invoke('phantom:open-in-editor', ctx.worktree.worktreePath);
    },
  },
  {
    id: 'worktree.copy-path',
    title: 'Copy Worktree Path',
    category: 'Worktree',
    keybinding: '⌘K Y',
    when: requireWorktree,
    run: (ctx) => {
      if (!requireWorktree(ctx) || !ctx.worktree.worktreePath) return;
      void navigator.clipboard.writeText(ctx.worktree.worktreePath);
    },
  },
  {
    id: 'worktree.copy-branch',
    title: 'Copy Current Branch Name',
    category: 'Worktree',
    when: requireWorktree,
    run: (ctx) => {
      if (!requireWorktree(ctx) || !ctx.worktree.branch) return;
      void navigator.clipboard.writeText(ctx.worktree.branch);
    },
  },

  // ── Git ─────────────────────────────────────────────────────────────────
  {
    id: 'git.ai-commit',
    title: 'AI-Generate Commit & Commit',
    category: 'Git',
    keybinding: '⌘K G',
    when: requireWorktree,
    run: (ctx) => {
      if (!requireWorktree(ctx)) return;
      // Fire a window event consumed by ChangesView — it already holds the
      // aiCommitFamily atom and the POST /git action wiring.
      window.dispatchEvent(
        new CustomEvent('phantom:trigger-ai-commit', {
          detail: { worktreeId: ctx.worktree.id },
        }),
      );
    },
  },
  {
    id: 'git.create-pr',
    title: 'Create Pull Request',
    category: 'Git',
    keybinding: '⌘K P',
    when: requireWorktree,
    run: async (ctx) => {
      if (!requireWorktree(ctx)) return;
      try {
        await fetch(`${API_BASE}/api/worktrees/${ctx.worktree.id}/git`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create-pr' }),
        });
      } catch { /* non-fatal — UI will show result via SSE */ }
    },
  },

  // ── View / Panes ────────────────────────────────────────────────────────
  {
    id: 'view.close-active-pane',
    title: 'Close Active Pane',
    category: 'View',
    keybinding: '⌘⇧W',
    run: (ctx) => {
      const activePane = ctx.store.getActivePane();
      if (activePane) ctx.store.closePane(activePane.id);
    },
  },
];

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Very small fuzzy matcher — returns a score (higher is better) or -1.
 * Favors contiguous matches and earlier positions. Good enough for ~20
 * commands; can swap for fuse.js if the list grows.
 */
export function scoreCommand(cmd: Command, query: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const haystack = `${cmd.category} ${cmd.title} ${cmd.id}`.toLowerCase();

  if (haystack.includes(q)) {
    // Earlier match ranks higher; title matches rank above category/id.
    const titleIdx = cmd.title.toLowerCase().indexOf(q);
    if (titleIdx >= 0) return 1000 - titleIdx;
    return 500 - haystack.indexOf(q);
  }

  // Subsequence match — every query char must appear in order.
  let hi = 0;
  let score = 100;
  for (const char of q) {
    const found = haystack.indexOf(char, hi);
    if (found === -1) return -1;
    score -= (found - hi);
    hi = found + 1;
  }
  return score;
}
