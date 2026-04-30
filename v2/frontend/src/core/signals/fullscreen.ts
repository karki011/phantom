// Phantom — Fullscreen detection signal for macOS traffic light inset
// Author: Subash Karki

import { createSignal } from 'solid-js';

/**
 * Detects whether the app is running in macOS native fullscreen.
 * When NOT fullscreen, TitleBarHiddenInset puts the traffic light buttons
 * inside the WebView, so we need ~78px left padding on the header and tab bar.
 * In fullscreen the traffic lights disappear and the padding is removed.
 *
 * Detection strategy: compare window dimensions to screen dimensions.
 * macOS native fullscreen makes the window fill the entire screen (including
 * the menu bar area), so innerHeight === screen.height is a reliable signal.
 */

const [isFullscreen, setIsFullscreen] = createSignal(false);

function checkFullscreen(): void {
  // macOS native fullscreen fills the entire screen including menu bar area.
  // Allow a small tolerance (2px) for sub-pixel differences.
  const full =
    Math.abs(window.innerWidth - screen.width) <= 2 &&
    Math.abs(window.innerHeight - screen.height) <= 2;
  setIsFullscreen(full);
}

/** Start listening for fullscreen changes. Call once at app startup. */
export function initFullscreenDetection(): void {
  checkFullscreen();
  window.addEventListener('resize', checkFullscreen);
}

/** Stop listening (cleanup). */
export function stopFullscreenDetection(): void {
  window.removeEventListener('resize', checkFullscreen);
}

export { isFullscreen };
