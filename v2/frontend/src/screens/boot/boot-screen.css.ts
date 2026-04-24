import { style, keyframes } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

const fadeOut = keyframes({
  from: { opacity: 1 },
  to: { opacity: 0 },
});

const pulse = keyframes({
  '0%, 100%': { opacity: 0.4 },
  '50%': { opacity: 1 },
});

const lineSlideIn = keyframes({
  from: { opacity: 0, transform: 'translateY(4px)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

export const overlay = style({
  position: 'fixed',
  inset: 0,
  zIndex: 9999,
  background: '#000',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
});

export const overlayDismiss = style([
  overlay,
  {
    animation: `${fadeOut} 500ms ease-out forwards`,
    pointerEvents: 'none',
  },
]);

export const canvas = style({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
});

export const confirmationPanel = style({
  position: 'relative',
  zIndex: 1,
  marginTop: vars.space.xl,
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  fontFamily: vars.font.mono,
  fontSize: `clamp(0.75rem, 1.2vw, 1rem)`,
  color: vars.color.textSecondary,
  minWidth: '280px',
  maxWidth: '520px',
  width: '90vw',
});

export const scanLine = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.sm,
  animation: `${lineSlideIn} 200ms ease-out both`,
  whiteSpace: 'nowrap',
});

export const statusDotSuccess = style({
  color: vars.color.success,
});

export const statusDotWarning = style({
  color: vars.color.warning,
});

export const statusDotOffline = style({
  color: vars.color.textDisabled,
});

export const scanLabel = style({
  color: vars.color.textPrimary,
});

export const scanDetail = style({
  color: vars.color.textSecondary,
  marginLeft: 'auto',
});

export const pulsing = style({
  animation: `${pulse} 2s ease-in-out infinite`,
});

export const nominalLine = style({
  position: 'relative',
  zIndex: 1,
  marginTop: vars.space.lg,
  fontFamily: vars.font.mono,
  fontSize: `clamp(0.75rem, 1.2vw, 1rem)`,
  color: vars.color.warning,
  textAlign: 'center',
  animation: `${lineSlideIn} 300ms ease-out both`,
});
