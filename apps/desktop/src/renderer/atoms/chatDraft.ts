/**
 * Per-worktree draft text for the floating Claude composer.
 * Persists across reloads so unsent prompts aren't lost.
 * @author Subash Karki
 */
import { atom } from 'jotai';
import { atomFamily, atomWithStorage } from 'jotai/utils';

export const chatDraftFamily = atomFamily((worktreeId: string) =>
  atomWithStorage<string>(`phantom-chat-draft-${worktreeId}`, ''),
);

/** Open/closed state for the floating composer — in-memory only. */
export const composerOpenAtom = atom<boolean>(false);

/**
 * The most-recently-focused terminal pane id. Updated whenever the active
 * pane is a terminal — gives the composer a stable "send target" even if
 * the user moves focus to an editor before pressing ⌘I.
 */
export const lastTerminalPaneIdAtom = atom<string | null>(null);

