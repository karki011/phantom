/**
 * GlobalShortcuts — binds selected keyboard shortcuts directly to commands
 * in the registry, bypassing the palette UI. Think of this as the "pinned"
 * subset of commands that power users reach for reflexively.
 *
 * Kept separate from CommandPalette so (a) the palette has no side-effects
 * beyond the Cmd+Shift+P toggle, and (b) this file is the single source of
 * truth for direct keybindings.
 *
 * @author Subash Karki
 */
import { useAtomValue } from 'jotai';
import { useEffect } from 'react';

import { usePaneStore } from '@phantom-os/panes';
import { activeWorktreeAtom } from '../atoms/worktrees';
import { COMMANDS } from '../commands/registry';

/** key combo → command id. Shortcuts here must match keybinding hints.
 *
 * We match on `e.code` (physical key, keyboard-layout independent) where
 * possible so Cmd+\ works on non-US keyboards, and fall back to `e.key`
 * where the code is unstable (e.g. Backquote).
 */
const BINDINGS: Array<{
  combo: (e: KeyboardEvent) => boolean;
  commandId: string;
}> = [
  // Cmd+\ — split terminal right
  {
    combo: (e) =>
      (e.metaKey || e.ctrlKey) &&
      !e.shiftKey &&
      (e.code === 'Backslash' || e.key === '\\'),
    commandId: 'terminal.split-right',
  },
  // Cmd+Shift+\ — split terminal down
  {
    combo: (e) =>
      (e.metaKey || e.ctrlKey) &&
      e.shiftKey &&
      (e.code === 'Backslash' || e.key === '|' || e.key === '\\'),
    commandId: 'terminal.split-down',
  },
  // Cmd+` — new terminal
  {
    combo: (e) =>
      (e.metaKey || e.ctrlKey) &&
      (e.code === 'Backquote' || e.key === '`'),
    commandId: 'terminal.new',
  },
  // Cmd+I — open floating Claude composer
  {
    combo: (e) =>
      (e.metaKey || e.ctrlKey) &&
      !e.shiftKey &&
      !e.altKey &&
      (e.code === 'KeyI' || e.key === 'i' || e.key === 'I'),
    commandId: 'ai.open-composer',
  },
];

/** Skip global handling when focus is inside an editable element. */
function shouldSkip(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  if (!target) return false;
  // xterm.js uses a hidden <textarea>; Monaco uses an <textarea.inputarea>
  // inside .monaco-editor. Both would be blocked by a naive tag check.
  // Explicitly allow shortcuts through when focus is inside these editor
  // surfaces — user expectation is that global shortcuts are truly global.
  if (
    target.closest?.('.xterm') ||
    target.closest?.('.xterm-helper-textarea') ||
    target.closest?.('.monaco-editor')
  ) {
    return false;
  }
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return false;
}

export const GlobalShortcuts = () => {
  const worktree = useAtomValue(activeWorktreeAtom);
  const store = usePaneStore();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (shouldSkip(e)) return;
      for (const binding of BINDINGS) {
        if (!binding.combo(e)) continue;
        const cmd = COMMANDS.find((c) => c.id === binding.commandId);
        if (!cmd) continue;
        const ctx = { worktree, store };
        if (cmd.when && !cmd.when(ctx)) continue;
        e.preventDefault();
        e.stopPropagation();
        try {
          void cmd.run(ctx);
        } catch (err) {
          console.error(`[GlobalShortcuts] ${cmd.id} failed`, err);
        }
        return;
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [worktree, store]);

  return null;
};
