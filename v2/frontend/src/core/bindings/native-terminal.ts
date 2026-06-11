// Author: Subash Karki

import { App } from './_app';
import { setNativeTerminalFlagCached, getNativeTerminalFlagCached } from '@/core/panes/signals';

export async function nativeTerminalIsEnabled(): Promise<boolean> {
  try {
    return Boolean(await App()?.NativeTerminalIsEnabled());
  } catch {
    return false;
  }
}

// Race-safe source of truth for the native-terminal flag at boot. The cached
// flag in panes/signals.ts is set asynchronously, so early restore paths must
// await this instead of trusting the (possibly unsynced) cache. After the
// first sync the live cache wins — toggles update it via
// setNativeTerminalFlagCached.
let flagSynced = false;
let flagSyncPromise: Promise<boolean> | null = null;

export function ensureNativeTerminalFlagSynced(): Promise<boolean> {
  if (flagSynced) return Promise.resolve(getNativeTerminalFlagCached());
  if (!flagSyncPromise) {
    flagSyncPromise = nativeTerminalIsEnabled().then((on) => {
      setNativeTerminalFlagCached(on);
      flagSynced = true;
      return on;
    });
  }
  return flagSyncPromise;
}

export async function setNativeTerminalEnabled(on: boolean): Promise<void> {
  try {
    await App()?.SetNativeTerminalEnabled(on);
  } catch (error) {
    console.error('[native-terminal] setEnabled failed', error);
  }
}

// Unlike the other wrappers this RETHROWS so the caller can distinguish the
// transient `window not ready` error (retryable, see contract at
// FindHostWindow in internal/terminal/ghostty/wails_host.go) from permanent failures.
export async function nativeTerminalCreate(
  paneId: string,
  worktreeId: string,
  cwd: string,
): Promise<string | null> {
  try {
    const id = await App()?.NativeTerminalCreate(paneId, worktreeId, cwd);
    return typeof id === 'string' ? id : null;
  } catch (error) {
    console.error('[native-terminal] create failed', { paneId, error });
    throw error;
  }
}

export async function nativeTerminalSetPlacement(
  paneId: string,
  x: number,
  y: number,
  width: number,
  height: number,
): Promise<void> {
  try {
    await App()?.NativeTerminalSetPlacement(paneId, x, y, width, height);
  } catch (error) {
    console.error('[native-terminal] setPlacement failed', { paneId, error });
  }
}

export async function nativeTerminalDestroy(paneId: string): Promise<void> {
  try {
    await App()?.NativeTerminalDestroy(paneId);
  } catch (error) {
    console.error('[native-terminal] destroy failed', { paneId, error });
  }
}

export async function nativeTerminalFocus(paneId: string): Promise<void> {
  try {
    await App()?.NativeTerminalFocus(paneId);
  } catch (error) {
    console.error('[native-terminal] focus failed', { paneId, error });
  }
}

export async function nativeTerminalSetOcclusion(
  paneId: string,
  hidden: boolean,
): Promise<void> {
  try {
    await App()?.NativeTerminalSetOcclusion(paneId, hidden);
  } catch (error) {
    console.error('[native-terminal] setOcclusion failed', { paneId, error });
  }
}
