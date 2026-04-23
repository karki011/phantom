// PhantomOS v2 — Quick Open signal (Cmd+P file finder)
// Author: Subash Karki

import { createSignal } from 'solid-js';

const [quickOpenVisible, setQuickOpenVisible] = createSignal(false);

export function openQuickOpen(): void {
  setQuickOpenVisible(true);
}

export function closeQuickOpen(): void {
  setQuickOpenVisible(false);
}

export function toggleQuickOpen(): void {
  setQuickOpenVisible((prev) => !prev);
}

export { quickOpenVisible };
