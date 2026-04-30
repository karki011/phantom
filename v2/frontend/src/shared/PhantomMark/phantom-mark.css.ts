// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

const pulse = keyframes({
  '0%, 100%': {
    transform: 'scale(1)',
    filter: `drop-shadow(0 0 10px ${vars.color.accentGlow})`,
  },
  '50%': {
    transform: 'scale(1.04)',
    filter: `drop-shadow(0 0 22px ${vars.color.accent}) drop-shadow(0 0 36px ${vars.color.accentGlow})`,
  },
});

export const mark = style({
  display: 'inline-block',
  color: vars.color.accent,
  filter: `drop-shadow(0 0 8px ${vars.color.accentGlow})`,
  transition: `filter ${vars.animation.normal} ease`,
});

export const markPulse = style({
  animation: `${pulse} 3s ease-in-out infinite`,
});

export const markActive = style({
  filter: `drop-shadow(0 0 18px ${vars.color.accent}) drop-shadow(0 0 30px ${vars.color.accentGlow})`,
});

export const eye = style({
  fill: vars.color.bgPrimary,
});

const caretBlink = keyframes({
  '0%, 55%': { opacity: 1 },
  '60%, 95%': { opacity: 0 },
  '100%': { opacity: 1 },
});

export const cursor = style({
  fill: vars.color.bgPrimary,
  animation: `${caretBlink} 1.1s steps(1, end) infinite`,
});

export const cursorRight = style({
  fill: vars.color.bgPrimary,
  animation: `${caretBlink} 1.1s steps(1, end) infinite`,
  animationDelay: '60ms',
});

export const body = style({
  fill: 'currentColor',
});
