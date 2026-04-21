// Author: Subash Karki

import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

const textGlow = keyframes({
  '0%, 100%': { textShadow: `0 0 10px ${vars.color.accentGlow}` },
  '50%': { textShadow: `0 0 25px ${vars.color.accent}, 0 0 50px ${vars.color.accentGlow}` },
});

const scanlineAnim = keyframes({
  '0%': { top: '-2px' },
  '100%': { top: '100%' },
});

export const overlay = style({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  background: vars.color.terminalBg,
  zIndex: 5,
  overflow: 'hidden',
});

export const text = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  color: vars.color.accent,
  letterSpacing: '0.15em',
  animation: `${textGlow} 3s ease-in-out infinite`,
});

export const scanline = style({
  position: 'absolute',
  left: 0,
  right: 0,
  height: '2px',
  background: `linear-gradient(90deg, transparent, ${vars.color.accent}, transparent)`,
  opacity: 0.4,
  animation: `${scanlineAnim} 2s linear infinite`,
});
