// Phantom — Agents overlay visibility signal
// Author: Subash Karki

import { createSignal } from 'solid-js';

const [agentsOverlayVisible, setAgentsOverlayVisible] = createSignal(false);

export function toggleAgentsOverlay(): void {
  setAgentsOverlayVisible((v) => !v);
}

export function closeAgentsOverlay(): void {
  setAgentsOverlayVisible(false);
}

export { agentsOverlayVisible };
