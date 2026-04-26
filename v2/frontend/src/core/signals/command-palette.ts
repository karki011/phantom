// PhantomOS v2 — Command palette visibility signal
// Author: Subash Karki

import { createSignal } from 'solid-js';

const [commandPaletteVisible, setCommandPaletteVisible] = createSignal(false);

export const openCommandPalette = (): void => setCommandPaletteVisible(true);
export const closeCommandPalette = (): void => setCommandPaletteVisible(false);
export const toggleCommandPalette = (): void => setCommandPaletteVisible((prev) => !prev);

export { commandPaletteVisible };
