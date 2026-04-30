// Phantom — Wails event subscriptions with Solid.js auto-cleanup
// Author: Subash Karki

import { onCleanup } from 'solid-js';

/**
 * Subscribe to a Wails runtime event. Automatically unsubscribes when the
 * calling Solid component or root is disposed (via onCleanup).
 */
export function onWailsEvent<T>(name: string, handler: (data: T) => void): void {
  if (!window.runtime?.EventsOn) return;
  const unsub = window.runtime.EventsOn(name, (...args: unknown[]) => handler(args[0] as T));
  onCleanup(() => unsub?.());
}
