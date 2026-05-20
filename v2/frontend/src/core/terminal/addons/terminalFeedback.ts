// Author: Subash Karki
//
// Subtle GSAP-powered visual feedback on command success/failure.
// - Failure (exit != 0): brief shake on the terminal container
// - Success after long-running command (>5s): subtle green glow

import { gsap } from '@/core/animation/gsap-setup';
import { type TerminalCommand, onCommandFinished } from './shellIntegration';

/** Minimum command duration (ms) to trigger success glow */
const LONG_RUNNING_THRESHOLD = 5000;

/**
 * Install terminal feedback animations for a session. Returns a cleanup
 * function that removes the listener.
 */
export function installTerminalFeedback(
  sessionId: string,
  host: HTMLElement,
): () => void {
  const handle = (cmd: TerminalCommand): void => {
    // Find the nearest .xterm container for the animation target
    const termEl = host.querySelector('.xterm') as HTMLElement | null;
    if (!termEl) return;

    if (cmd.exitCode !== undefined && cmd.exitCode !== 0) {
      // Failure shake — subtle, fast, low amplitude
      gsap.to(termEl, {
        x: -3,
        duration: 0.04,
        repeat: 5,
        yoyo: true,
        ease: 'power1.inOut',
      });
    } else if (
      cmd.exitCode === 0 &&
      cmd.timestamp &&
      Date.now() - cmd.timestamp > LONG_RUNNING_THRESHOLD
    ) {
      // Long-running success — brief green glow
      gsap.fromTo(
        termEl,
        { boxShadow: '0 0 15px rgba(34, 197, 94, 0.3)' },
        {
          boxShadow: '0 0 0px transparent',
          duration: 1.2,
          ease: 'power2.out',
        },
      );
    }
  };

  return onCommandFinished(sessionId, handle);
}
