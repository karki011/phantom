// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

export const panel = style({
  position: 'absolute',
  top: '32px',
  right: '8px',
  zIndex: 50,
  background: vars.color.bgSecondary,
  border: `1px solid ${vars.color.border}`,
  borderRadius: vars.radius.md,
  boxShadow: vars.shadow.lg,
  padding: vars.space.md,
  minWidth: '220px',
  fontFamily: vars.font.body,
  fontSize: '11px',
  color: vars.color.textSecondary,
});

export const header = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  fontWeight: 600,
  color: vars.color.textPrimary,
  paddingBottom: vars.space.sm,
  borderBottom: `1px solid ${vars.color.border}`,
  marginBottom: vars.space.sm,
});

export const row = style({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '3px 0',
});

export const control = style({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
});

export const btn = style({
  background: vars.color.bgHover,
  border: `1px solid ${vars.color.borderHover}`,
  borderRadius: vars.radius.sm,
  color: vars.color.textDisabled,
  width: '22px',
  height: '22px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '13px',
  padding: 0,
  fontFamily: vars.font.body,
});

export const val = style({
  minWidth: '42px',
  textAlign: 'center',
  fontVariantNumeric: 'tabular-nums',
  fontFamily: vars.font.mono,
  fontSize: '10px',
  color: vars.color.textPrimary,
});

export const valWide = style({
  minWidth: '120px',
  textAlign: 'center',
  fontVariantNumeric: 'tabular-nums',
  fontFamily: vars.font.mono,
  fontSize: '10px',
  color: vars.color.textPrimary,
});

export const valMedium = style({
  minWidth: '110px',
  textAlign: 'center',
  fontVariantNumeric: 'tabular-nums',
  fontFamily: vars.font.mono,
  fontSize: '10px',
  color: vars.color.textPrimary,
});

export const reset = style({
  background: vars.color.bgHover,
  border: `1px solid ${vars.color.borderHover}`,
  borderRadius: vars.radius.sm,
  color: vars.color.textDisabled,
  fontSize: '10px',
  padding: '2px 8px',
  cursor: 'pointer',
  fontFamily: vars.font.body,
});
