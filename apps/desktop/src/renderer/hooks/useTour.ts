/**
 * useTour — Guided tour for first-time users using driver.js
 * Spotlights key UI areas with PhantomOS-themed popovers.
 *
 * @author Subash Karki
 */
import { driver, type Config } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useCallback, useEffect, useRef } from 'react';
import { getDefaultStore } from 'jotai';

import { activeTopTabAtom } from '../atoms/system';
import { usePreferences } from './usePreferences';

/* ── Tab switching helper ───────────────────────────────── */

const store = getDefaultStore();

function switchToTab(tab: 'cockpit' | 'worktree') {
  store.set(activeTopTabAtom, tab);
  // Allow React to re-render so the target elements appear
  return new Promise<void>((resolve) => setTimeout(resolve, 100));
}

/* ── Tour step definitions ──────────────────────────────── */
// Each step has a `requiredTab` so the tour auto-switches before spotlighting.

interface TourStep {
  element?: string;
  requiredTab?: 'cockpit' | 'worktree';
  title: string;
  description: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
}

const TOUR_STEPS: TourStep[] = [
  {
    element: '[data-tour="header"]',
    title: '[SYSTEM] Command Center',
    description: 'Connection status, system metrics, theme, and quick actions. Everything at a glance.',
    side: 'bottom',
    align: 'center',
  },
  {
    element: '[data-tour="tab-cockpit"]',
    requiredTab: 'cockpit',
    title: '[SYSTEM] System View',
    description: 'Your session dashboard — live feed, project overview, token analytics, and hunter stats.',
    side: 'bottom',
    align: 'start',
  },
  {
    element: '[data-tour="tab-worktree"]',
    requiredTab: 'worktree',
    title: '[SYSTEM] Worktree View',
    description: 'Your coding workspace. Terminals, editors, file explorer — all in split panes.',
    side: 'bottom',
    align: 'start',
  },
  {
    element: '[data-tour="sidebar"]',
    requiredTab: 'worktree',
    title: '[SYSTEM] Projects & Worktrees',
    description: 'Your repositories and branches. Right-click to manage, click to open.',
    side: 'right',
    align: 'start',
  },
  {
    element: '[data-tour="add-project"]',
    requiredTab: 'worktree',
    title: '[SYSTEM] Add Projects',
    description: 'Add Project opens a folder picker. Scan searches a directory for all repos. Clone pulls a repo by URL. Get your codebase in here.',
    side: 'top',
    align: 'start',
  },
  {
    element: '[data-tour="right-sidebar"]',
    requiredTab: 'worktree',
    title: '[SYSTEM] Files, Changes & Activity',
    description: 'File explorer, git staging, and branch activity. Stage, commit, and push from here.',
    side: 'left',
    align: 'start',
  },
  {
    element: '[data-tour="footer"]',
    title: '[SYSTEM] Progress Tracker',
    description: 'Your achievements and coding streak. Keep the streak alive.',
    side: 'top',
    align: 'center',
  },
  {
    element: '[data-tour="settings"]',
    title: '[SYSTEM] Settings',
    description: 'Customize theme, sounds, font, zoom, and Claude AI integration.',
    side: 'bottom',
    align: 'end',
  },
  {
    title: '[SYSTEM] You\'re All Set',
    description: 'Press ⌘+P for quick file search. Press ⌘+T for a new terminal. Right-click anything for more options.\n\nWelcome to The System.',
  },
];

/* ── PhantomOS theme overrides ──────────────────────────── */

const THEME: Config = {
  showProgress: true,
  animate: true,
  smoothScroll: true,
  allowClose: true,
  overlayColor: '#000',
  overlayOpacity: 0.75,
  stagePadding: 8,
  stageRadius: 8,
  popoverClass: 'phantom-tour-popover',
  nextBtnText: '[ Next → ]',
  prevBtnText: '[ ← Back ]',
  doneBtnText: '[ Complete ]',
  progressText: '{{current}} of {{total}}',
};

/* ── CSS injection for driver.js theme ──────────────────── */

const TOUR_STYLE_ID = '__phantom-tour-theme';
function injectTourStyles() {
  if (typeof document === 'undefined' || document.getElementById(TOUR_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = TOUR_STYLE_ID;
  style.textContent = `
    .phantom-tour-popover {
      background: var(--phantom-surface-card, #1a1a2e) !important;
      border: 1px solid var(--phantom-accent-cyan, #00d4ff) !important;
      border-radius: 12px !important;
      color: var(--phantom-text-primary, #e0e0e0) !important;
      font-family: var(--phantom-font-mono, 'JetBrains Mono', monospace) !important;
      box-shadow: 0 0 30px rgba(0, 212, 255, 0.15) !important;
    }
    .phantom-tour-popover .driver-popover-title {
      font-size: 13px !important;
      font-weight: 600 !important;
      color: var(--phantom-accent-cyan, #00d4ff) !important;
      font-family: var(--phantom-font-mono, 'JetBrains Mono', monospace) !important;
      letter-spacing: 0.04em !important;
    }
    .phantom-tour-popover .driver-popover-description {
      font-size: 12px !important;
      color: var(--phantom-text-secondary, #94a3b8) !important;
      font-family: var(--phantom-font-mono, 'JetBrains Mono', monospace) !important;
      line-height: 1.6 !important;
    }
    .phantom-tour-popover .driver-popover-progress-text {
      font-size: 10px !important;
      color: var(--phantom-text-muted, rgba(255,255,255,0.35)) !important;
      font-family: var(--phantom-font-mono, 'JetBrains Mono', monospace) !important;
    }
    .phantom-tour-popover .driver-popover-navigation-btns button {
      font-family: var(--phantom-font-mono, 'JetBrains Mono', monospace) !important;
      font-size: 11px !important;
      letter-spacing: 0.04em !important;
      border-radius: 6px !important;
      padding: 6px 14px !important;
      text-shadow: none !important;
    }
    .phantom-tour-popover .driver-popover-next-btn,
    .phantom-tour-popover .driver-popover-close-btn {
      background: transparent !important;
      border: 1px solid var(--phantom-accent-cyan, #00d4ff) !important;
      color: var(--phantom-accent-cyan, #00d4ff) !important;
    }
    .phantom-tour-popover .driver-popover-next-btn:hover,
    .phantom-tour-popover .driver-popover-close-btn:hover {
      background: rgba(0, 212, 255, 0.1) !important;
    }
    .phantom-tour-popover .driver-popover-prev-btn {
      background: transparent !important;
      border: 1px solid var(--phantom-border-subtle, rgba(255,255,255,0.1)) !important;
      color: var(--phantom-text-muted, rgba(255,255,255,0.35)) !important;
    }
    .phantom-tour-popover .driver-popover-prev-btn:hover {
      background: rgba(255, 255, 255, 0.05) !important;
    }
    .phantom-tour-popover .driver-popover-arrow-side-bottom .driver-popover-arrow,
    .phantom-tour-popover .driver-popover-arrow-side-top .driver-popover-arrow,
    .phantom-tour-popover .driver-popover-arrow-side-left .driver-popover-arrow,
    .phantom-tour-popover .driver-popover-arrow-side-right .driver-popover-arrow {
      border-color: var(--phantom-surface-card, #1a1a2e) !important;
    }
  `;
  document.head.appendChild(style);
}

/* ── Hook ───────────────────────────────────────────────── */

export function useTour() {
  const { prefs, setPref } = usePreferences();
  const driverRef = useRef<ReturnType<typeof driver> | null>(null);

  useEffect(() => {
    injectTourStyles();
  }, []);

  const startTour = useCallback(() => {
    if (driverRef.current) {
      driverRef.current.destroy();
    }

    const steps = TOUR_STEPS.map((step, idx) => ({
      element: step.element,
      popover: {
        title: step.title,
        description: step.description,
        side: step.side,
        align: step.align,
        // Override next/prev to switch tabs before navigating
        onNextClick: () => {
          const nextStep = TOUR_STEPS[idx + 1];
          if (nextStep?.requiredTab) {
            switchToTab(nextStep.requiredTab).then(() => driverRef.current?.moveNext());
          } else {
            driverRef.current?.moveNext();
          }
        },
        onPrevClick: () => {
          const prevStep = TOUR_STEPS[idx - 1];
          if (prevStep?.requiredTab) {
            switchToTab(prevStep.requiredTab).then(() => driverRef.current?.movePrevious());
          } else {
            driverRef.current?.movePrevious();
          }
        },
      },
    }));

    const d = driver({
      ...THEME,
      steps,
      onDestroyed: () => {
        setPref('tour_completed', new Date().toISOString());
      },
    });

    driverRef.current = d;
    d.drive();
  }, [setPref]);

  const tourCompleted = !!prefs.tour_completed;

  return { startTour, tourCompleted };
}
