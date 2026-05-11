// Phantom — Search Panel signal (Cmd+Shift+F content search)
// Author: Subash Karki

import { createSignal } from 'solid-js';

const [searchPanelVisible, setSearchPanelVisible] = createSignal(false);

export function openSearchPanel(): void {
  setSearchPanelVisible(true);
}

export function closeSearchPanel(): void {
  setSearchPanelVisible(false);
}

export function toggleSearchPanel(): void {
  setSearchPanelVisible((prev) => !prev);
}

export { searchPanelVisible };
