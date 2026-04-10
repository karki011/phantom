/**
 * System Jotai Atoms
 * Font scale, theme, and notification queue
 *
 * @author Subash Karki
 */
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FontScale = 0.9 | 1.0 | 1.1 | 1.25 | 1.5;
export type ThemeMode = 'dark' | 'light';
export type TopLevelTab = 'cockpit' | 'worktree';

export interface SystemNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

// ---------------------------------------------------------------------------
// SSE connection state
// ---------------------------------------------------------------------------

export type SseConnectionState = 'connecting' | 'connected' | 'disconnected';
export const sseConnectionAtom = atom<SseConnectionState>('connecting');

// ---------------------------------------------------------------------------
// Font scale — persisted to localStorage
// ---------------------------------------------------------------------------

export const fontScaleAtom = atomWithStorage<FontScale>(
  'phantom-font-scale',
  1.0,
);

// ---------------------------------------------------------------------------
// Theme — persisted to localStorage
// ---------------------------------------------------------------------------

export const themeAtom = atomWithStorage<ThemeMode>(
  'phantom-theme',
  'dark',
);

// ---------------------------------------------------------------------------
// Theme name — which token set is active (persisted to localStorage)
// ---------------------------------------------------------------------------

export const themeNameAtom = atomWithStorage<string>(
  'phantom-theme-name',
  'cz-dark',
);

// ---------------------------------------------------------------------------
// Notification queue — writable atom
// ---------------------------------------------------------------------------

const notificationsBaseAtom = atom<SystemNotification[]>([]);

export const systemNotificationsAtom = atom(
  (get) => get(notificationsBaseAtom),
  (get, set, action: { type: 'add'; notification: SystemNotification } | { type: 'remove'; id: string } | { type: 'clear' }) => {
    const current = get(notificationsBaseAtom);
    switch (action.type) {
      case 'add':
        set(notificationsBaseAtom, [...current, action.notification]);
        break;
      case 'remove':
        set(notificationsBaseAtom, current.filter((n) => n.id !== action.id));
        break;
      case 'clear':
        set(notificationsBaseAtom, []);
        break;
    }
  },
);

// ---------------------------------------------------------------------------
// Top-level tab — cockpit vs workspace (persisted to localStorage)
// ---------------------------------------------------------------------------

export const activeTopTabAtom = atomWithStorage<TopLevelTab>(
  'phantom-top-tab',
  'cockpit',
);
