// Author: Subash Karki

import { createSignal } from 'solid-js';

const [shutdownRequested, setShutdownRequested] = createSignal(false);

let shutdownHandler: (() => void) | null = null;

export function registerShutdownHandler(handler: () => void): void {
  shutdownHandler = handler;
}

export function requestShutdown(): void {
  if (shutdownRequested()) return;
  setShutdownRequested(true);
  shutdownHandler?.();
}

export { shutdownRequested };
