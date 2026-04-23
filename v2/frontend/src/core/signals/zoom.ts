// PhantomOS v2 — Zoom / font size signals
// Author: Subash Karki

import { createSignal } from 'solid-js';
import { setPref, loadPref } from './preferences';

export const ZOOM_LEVELS = [
  { id: 'tiny',        label: 'Tiny',        scale: 0.75, terminalFontSize: 10 },
  { id: 'small',       label: 'Small',       scale: 0.85, terminalFontSize: 11 },
  { id: 'default',     label: 'Default',     scale: 1.0,  terminalFontSize: 13 },
  { id: 'large',       label: 'Large',       scale: 1.15, terminalFontSize: 15 },
  { id: 'extra-large', label: 'Extra Large', scale: 1.3,  terminalFontSize: 17 },
  { id: 'huge',        label: 'Huge',        scale: 1.5,  terminalFontSize: 19 },
] as const;

export type ZoomLevelId = typeof ZOOM_LEVELS[number]['id'];

const [activeZoom, setActiveZoom] = createSignal<ZoomLevelId>('default');

export function getZoomConfig() {
  return ZOOM_LEVELS.find(z => z.id === activeZoom()) ?? ZOOM_LEVELS[2];
}

export function applyZoom(id: ZoomLevelId): void {
  const level = ZOOM_LEVELS.find(z => z.id === id);
  if (!level) return;

  setActiveZoom(id);

  document.documentElement.style.fontSize = `${16 * level.scale}px`;

  import('../terminal/registry').then(({ getAllSessions }) => {
    for (const session of getAllSessions()) {
      session.terminal.options.fontSize = level.terminalFontSize;
      session.fitAddon.fit();
    }
  });

  void setPref('zoom_level', id);
}

export function zoomIn(): void {
  const currentIdx = ZOOM_LEVELS.findIndex(z => z.id === activeZoom());
  if (currentIdx < ZOOM_LEVELS.length - 1) {
    applyZoom(ZOOM_LEVELS[currentIdx + 1].id);
  }
}

export function zoomOut(): void {
  const currentIdx = ZOOM_LEVELS.findIndex(z => z.id === activeZoom());
  if (currentIdx > 0) {
    applyZoom(ZOOM_LEVELS[currentIdx - 1].id);
  }
}

export function zoomReset(): void {
  applyZoom('default');
}

export async function initZoom(): Promise<void> {
  const saved = await loadPref('zoom_level');
  if (saved && ZOOM_LEVELS.some(z => z.id === saved)) {
    applyZoom(saved as ZoomLevelId);
  }
}

export { activeZoom };
