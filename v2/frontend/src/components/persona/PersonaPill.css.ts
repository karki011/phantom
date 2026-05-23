// Author: Subash Karki

import { keyframes, style } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

const pulse = keyframes({
  '0%, 100%': { opacity: 1, transform: 'scale(1)' },
  '50%': { opacity: 0.5, transform: 'scale(1.3)' },
});

export const pill = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  height: '22px',
  padding: '0 10px',
  borderRadius: '100px',
  border: `1px solid ${vars.color.border}`,
  background: 'transparent',
  cursor: 'pointer',
  userSelect: 'none',
  transition: `background ${vars.animation.fast}, border-color ${vars.animation.fast}`,
  flexShrink: 0,
  ':hover': {
    background: vars.color.bgHover,
    borderColor: vars.color.borderHover,
  },
  ':focus-visible': {
    outline: `2px solid ${vars.color.accent}`,
    outlineOffset: '2px',
  },
});

const dotBase = style({
  width: '6px',
  height: '6px',
  borderRadius: '50%',
  flexShrink: 0,
  transition: `background ${vars.animation.normal}`,
});

export const dotIdle = style([dotBase, {
  background: vars.color.textDisabled,
}]);

export const dotObserving = style([dotBase, {
  background: vars.color.accent,
}]);

export const dotAttention = style([dotBase, {
  background: vars.color.warning,
  animation: `${pulse} 1.4s ease-in-out infinite`,
}]);

export const dotListening = style([dotBase, {
  background: vars.color.success,
}]);

export const dotSpeaking = style([dotBase, {
  background: vars.color.accent,
  animation: `${pulse} 0.8s ease-in-out infinite`,
}]);

export const statusLabel = style({
  fontFamily: vars.font.body,
  fontSize: vars.fontSize.xs,
  color: vars.color.textSecondary,
  lineHeight: 1,
  maxWidth: '120px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const shortcutHint = style({
  fontFamily: vars.font.mono,
  fontSize: '10px',
  color: vars.color.textDisabled,
  lineHeight: 1,
  letterSpacing: '0.02em',
});
