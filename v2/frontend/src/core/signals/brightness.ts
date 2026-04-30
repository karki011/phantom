// Phantom — Brightness control signals
// Author: Subash Karki

import { createSignal } from 'solid-js';
import { setPref, loadPref } from './preferences';

const MIN_BRIGHTNESS = 50;
const MAX_BRIGHTNESS = 150;
const DEFAULT_BRIGHTNESS = 100;

const [activeBrightness, setActiveBrightness] = createSignal(DEFAULT_BRIGHTNESS);

export function applyBrightness(value: number): void {
  const clamped = Math.max(MIN_BRIGHTNESS, Math.min(MAX_BRIGHTNESS, value));
  setActiveBrightness(clamped);

  document.documentElement.style.filter =
    clamped === 100 ? '' : `brightness(${clamped}%)`;

  void setPref('brightness_level', String(clamped));
}

export async function initBrightness(): Promise<void> {
  const saved = await loadPref('brightness_level');
  if (saved) {
    const parsed = Number(saved);
    if (!Number.isNaN(parsed) && parsed >= MIN_BRIGHTNESS && parsed <= MAX_BRIGHTNESS) {
      applyBrightness(parsed);
    }
  }
}

export { activeBrightness, MIN_BRIGHTNESS, MAX_BRIGHTNESS, DEFAULT_BRIGHTNESS };
