// Author: Subash Karki

import { createSignal } from 'solid-js';

const [shutdownRequested, setShutdownRequested] = createSignal(false);
const [shutdownConfirmVisible, setShutdownConfirmVisible] = createSignal(false);

let shutdownHandler: (() => void) | null = null;

export function registerShutdownHandler(handler: () => void): void {
  shutdownHandler = handler;
}

/** Show the confirmation modal before starting the ceremony. */
export function requestShutdown(): void {
  if (shutdownRequested()) return;
  setShutdownConfirmVisible(true);
}

/** Called when the user confirms shutdown in the modal. */
export function confirmShutdown(): void {
  if (shutdownRequested()) return;
  setShutdownRequested(true);
  shutdownHandler?.();
}

export function hideConfirmModal(): void {
  setShutdownConfirmVisible(false);
}

/** Called when the user cancels shutdown in the modal. */
export function cancelShutdown(): void {
  setShutdownConfirmVisible(false);
}

export { shutdownRequested, shutdownConfirmVisible };
