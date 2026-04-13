/**
 * System Jotai Atoms
 * Font scale, font family, theme, and notification queue
 *
 * @author Subash Karki
 */
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FontScale = 0.9 | 1.0 | 1.1 | 1.25 | 1.5;
export type FontFamily = 'jetbrains-mono' | 'fira-code' | 'inter' | 'space-grotesk' | 'ibm-plex-mono';
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
// Font family — persisted to localStorage
// ---------------------------------------------------------------------------

export const FONT_FAMILY_OPTIONS: { value: FontFamily; label: string; css: string }[] = [
  { value: 'jetbrains-mono', label: 'JetBrains Mono', css: "'JetBrains Mono', monospace" },
  { value: 'fira-code', label: 'Fira Code', css: "'Fira Code', monospace" },
  { value: 'inter', label: 'Inter', css: "'Inter', sans-serif" },
  { value: 'space-grotesk', label: 'Space Grotesk', css: "'Space Grotesk', sans-serif" },
  { value: 'ibm-plex-mono', label: 'IBM Plex Mono', css: "'IBM Plex Mono', monospace" },
];

export const fontFamilyAtom = atomWithStorage<FontFamily>(
  'phantom-font-family',
  'jetbrains-mono',
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
