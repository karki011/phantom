// Author: Subash Karki
import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

const blink = keyframes({
  '0%, 100%': { opacity: 1 },
  '50%': { opacity: 0.3 },
});

export const statusDotRunning = style({
  display: 'inline-block',
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: vars.color.accent,
  animation: `${blink} 1s ease-in-out infinite`,
  marginRight: vars.space.xs,
  verticalAlign: 'middle',
});

export const statusDotSuccess = style({
  display: 'inline-block',
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: vars.color.success,
  marginRight: vars.space.xs,
  verticalAlign: 'middle',
});

export const statusDotError = style({
  display: 'inline-block',
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: vars.color.danger,
  marginRight: vars.space.xs,
  verticalAlign: 'middle',
});

export const thinkingCollapsed = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  fontStyle: 'italic',
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  borderLeft: `2px solid ${vars.color.accent}`,
  cursor: 'pointer',
  ':hover': {
    color: vars.color.textSecondary,
  },
});

export const thinkingExpanded = style({
  fontStyle: 'italic',
  fontSize: vars.fontSize.xs,
  color: vars.color.textDisabled,
  padding: `${vars.space.xs} ${vars.space.sm}`,
  borderLeft: `2px solid ${vars.color.accent}`,
  whiteSpace: 'pre-wrap',
  cursor: 'pointer',
});

export const thinkingContent = style({
  marginTop: vars.space.xs,
  maxHeight: '200px',
  overflowY: 'auto',
});
