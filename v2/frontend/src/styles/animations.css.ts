// Author: Subash Karki

import { keyframes } from '@vanilla-extract/css';

export const fadeIn = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

export const fadeOut = keyframes({
  from: { opacity: 1 },
  to: { opacity: 0 },
});

export const slideUp = keyframes({
  from: { transform: 'translateY(20px)', opacity: 0 },
  to: { transform: 'translateY(0)', opacity: 1 },
});

export const slideDown = keyframes({
  from: { transform: 'translateY(-20px)', opacity: 0 },
  to: { transform: 'translateY(0)', opacity: 1 },
});

export const dissolve = keyframes({
  from: { opacity: 1, transform: 'scale(1)' },
  to: { opacity: 0, transform: 'scale(1.02)' },
});

export const glowPulse = keyframes({
  '0%, 100%': { opacity: 0.4 },
  '50%': { opacity: 1 },
});

export const typewriterBlink = keyframes({
  '0%, 100%': { opacity: 1 },
  '50%': { opacity: 0 },
});

export const screenPowerOn = keyframes({
  '0%': { opacity: 1 },
  '4%': { opacity: 0.3 },
  '6%': { opacity: 0.9 },
  '8%': { opacity: 0.1 },
  '10%': { opacity: 1 },
  '14%': { opacity: 0.5 },
  '16%': { opacity: 1 },
  '20%': { opacity: 0 },
  '22%': { opacity: 0.8 },
  '28%': { opacity: 0 },
  '32%': { opacity: 0.4 },
  '36%': { opacity: 0 },
  '50%': { opacity: 0 },
  '100%': { opacity: 0 },
});
