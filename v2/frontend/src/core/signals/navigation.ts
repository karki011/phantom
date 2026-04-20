// Author: Subash Karki

import { createSignal } from 'solid-js';

export type ScreenId =
  | 'onboarding'
  | 'command'
  | 'settings'
  | 'smart-view'
  | 'git-ops'
  | 'eagle-eye'
  | 'wards'
  | 'codeburn'
  | 'hunter'
  | 'editor'
  | 'playground';

const [activeScreen, setActiveScreen] = createSignal<ScreenId>('command');
const [paletteOpen, setPaletteOpen] = createSignal(false);

export { activeScreen, setActiveScreen, paletteOpen, setPaletteOpen };
