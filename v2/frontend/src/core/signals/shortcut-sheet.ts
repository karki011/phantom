// Phantom — Shortcut sheet signal (Cmd+/)
// Author: Subash Karki

import { createSignal } from 'solid-js';

const [shortcutSheetVisible, setShortcutSheetVisible] = createSignal(false);

export function openShortcutSheet(): void {
  setShortcutSheetVisible(true);
}

export function closeShortcutSheet(): void {
  setShortcutSheetVisible(false);
}

export function toggleShortcutSheet(): void {
  setShortcutSheetVisible((prev) => !prev);
}

export { shortcutSheetVisible };
