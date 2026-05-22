import { globalStyle, style } from '@vanilla-extract/css';
import { vars } from './theme.css';

globalStyle('*, *::before, *::after', {
  boxSizing: 'border-box',
  margin: 0,
  padding: 0,
});

globalStyle('html, body, #root', {
  height: '100%',
  overflow: 'hidden',
});

globalStyle('::selection', {
  backgroundColor: vars.color.accentMuted,
  color: vars.color.textPrimary,
});

globalStyle('::-webkit-scrollbar', {
  width: '6px',
  height: '6px',
});

globalStyle('::-webkit-scrollbar-track', {
  background: 'transparent',
});

globalStyle('::-webkit-scrollbar-thumb', {
  background: vars.color.accentMuted,
  borderRadius: '3px',
});

globalStyle('::-webkit-scrollbar-thumb:hover', {
  background: `color-mix(in srgb, ${vars.color.accent} 50%, transparent)`,
});

// Respect prefers-reduced-motion — disable animations/transitions for a11y.
// Applied to html element so it cascades to all children.
export const reducedMotion = style({
  '@media': {
    '(prefers-reduced-motion: reduce)': {
      animationDuration: '0.001ms !important',
      animationIterationCount: '1 !important',
      transitionDuration: '0.001ms !important',
    },
  },
});

