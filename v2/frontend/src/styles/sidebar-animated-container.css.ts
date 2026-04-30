// Phantom — Animated container for sidebar collapse/expand
// Author: Subash Karki

import { style } from '@vanilla-extract/css';

// Tasteful "swift snap" easing — under 280ms total per design constraint.
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const WIDTH_DURATION = '220ms';
const FADE_DURATION = '150ms';

// Animated wrapper: width transitions between rail (44px) and expanded width.
// First-render is gated by [data-mounted="true"]; resize-drag pauses via
// [data-resizing="true"]. Reduced-motion media query disables animation.
export const animatedContainer = style({
  position: 'relative',
  height: '100%',
  flexShrink: 0,
  // No transition on first render — `data-mounted` flips on after initial frame.
  transition: 'none',
  selectors: {
    '&[data-mounted="true"]': {
      transition: `width ${WIDTH_DURATION} ${EASE}`,
    },
    // Pause width animation while user drags the resize handle.
    '&[data-resizing="true"]': {
      transition: 'none',
    },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      selectors: {
        '&[data-mounted="true"]': {
          transition: 'none',
        },
      },
    },
  },
});

// Both rail and expanded content occupy the same absolute position so they
// overlap during the cross-fade — no layout shift, no flash of empty space.
export const fadeLayer = style({
  position: 'absolute',
  inset: 0,
  opacity: 0,
  pointerEvents: 'none',
  transition: 'none',
  selectors: {
    [`${animatedContainer}[data-mounted="true"] &`]: {
      transition: `opacity ${FADE_DURATION} ease`,
    },
    '&[data-active="true"]': {
      opacity: 1,
      pointerEvents: 'auto',
    },
  },
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      selectors: {
        [`${animatedContainer}[data-mounted="true"] &`]: {
          transition: 'none',
        },
      },
    },
  },
});
