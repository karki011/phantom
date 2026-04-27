// PhantomOS v2 — Ward Manager styles
// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

export const container = style({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
});

export const stickyTop = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.lg,
  padding: `${vars.space.xl} ${vars.space.xl} ${vars.space.lg}`,
  flexShrink: 0,
  borderBottom: `1px solid color-mix(in srgb, ${vars.color.accent} 10%, ${vars.color.border})`,
  background: vars.color.bgPrimary,
});

export const scrollArea = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.lg,
  padding: vars.space.xl,
  flex: 1,
  overflowY: 'auto',
  '::-webkit-scrollbar': { width: '4px' },
  '::-webkit-scrollbar-thumb': { background: vars.color.border, borderRadius: '2px' },
});

export const header = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
});

export const title = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.sm,
  color: vars.color.textPrimary,
  fontWeight: 600,
});

export const addButton = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: `${vars.space.xs} ${vars.space.md}`,
  borderRadius: vars.radius.sm,
  background: vars.color.accent,
  color: '#000',
  border: 'none',
  cursor: 'pointer',
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  fontWeight: 600,
  ':hover': { opacity: '0.9' },
});

export const presetsRow = style({
  display: 'flex',
  gap: vars.space.md,
  flexWrap: 'wrap',
});

export const presetCard = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.xs,
  padding: `${vars.space.md} ${vars.space.lg}`,
  borderRadius: vars.radius.md,
  background: vars.color.bgTertiary,
  border: `1px solid ${vars.color.border}`,
  cursor: 'pointer',
  transition: 'all 150ms ease',
  flex: '1 1 200px',
  minWidth: '200px',
  ':hover': {
    borderColor: vars.color.accent,
    background: `color-mix(in srgb, ${vars.color.accent} 6%, ${vars.color.bgTertiary})`,
  },
});

export const presetCardActive = style({
  borderColor: vars.color.accent,
  background: `color-mix(in srgb, ${vars.color.accent} 8%, ${vars.color.bgTertiary})`,
  boxShadow: `0 0 8px color-mix(in srgb, ${vars.color.accent} 15%, transparent)`,
});

export const presetName = style({
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  color: vars.color.textPrimary,
  fontWeight: 600,
});

export const presetDesc = style({
  fontSize: '0.6rem',
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
});

export const ruleList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.md,
});

export const ruleItem = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  padding: `${vars.space.sm} ${vars.space.md}`,
  borderRadius: vars.radius.md,
  background: vars.color.bgPrimary,
  border: `1px solid ${vars.color.border}`,
  cursor: 'default',
  transition: `all 150ms ease`,
  ':hover': {
    borderColor: `color-mix(in srgb, ${vars.color.accent} 40%, ${vars.color.border})`,
    boxShadow: `0 0 8px color-mix(in srgb, ${vars.color.accent} 12%, transparent)`,
  },
});

export const ruleRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
});

export const ruleInfo = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '1px',
  flex: 1,
  overflow: 'hidden',
});

export const ruleName = style({
  fontSize: '0.78rem',
  color: vars.color.textPrimary,
  fontWeight: 500,
  fontFamily: vars.font.body,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const ruleDesc = style({
  fontSize: '0.6rem',
  color: vars.color.textDisabled,
  fontFamily: vars.font.mono,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const ruleLevelBadge = style({
  padding: '1px 6px',
  borderRadius: '3px',
  fontSize: '0.6rem',
  fontWeight: 700,
  fontFamily: vars.font.mono,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  flexShrink: 0,
});

export const levelBlock = style({ background: `color-mix(in srgb, ${vars.color.danger} 15%, transparent)`, color: vars.color.danger });
export const levelConfirm = style({ background: `color-mix(in srgb, ${vars.color.accent} 15%, transparent)`, color: vars.color.accent });
export const levelWarn = style({ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' });
export const levelLog = style({ background: 'rgba(255,255,255,0.06)', color: vars.color.textDisabled });

export const sessionBadge = style({
  padding: '1px 6px',
  borderRadius: '3px',
  fontSize: '0.55rem',
  fontFamily: vars.font.mono,
  background: `color-mix(in srgb, ${vars.color.accent} 10%, transparent)`,
  color: vars.color.accent,
  flexShrink: 0,
});

export const toggleSwitch = style({
  flexShrink: 0,
});

export const checkboxRoot = style({
  display: 'flex',
  alignItems: 'center',
  gap: vars.space.xs,
  cursor: 'pointer',
});

export const checkboxControl = style({
  width: '16px',
  height: '16px',
  minWidth: '16px',
  borderRadius: vars.radius.sm,
  border: `1px solid ${vars.color.border}`,
  backgroundColor: vars.color.bgSecondary,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: `all ${vars.animation.fast} ease`,
  selectors: {
    '[data-checked] &': {
      backgroundColor: vars.color.accent,
      borderColor: vars.color.accent,
    },
  },
});

export const checkboxIndicator = style({
  color: vars.color.textInverse,
  fontSize: vars.fontSize.xs,
  lineHeight: 1,
  fontWeight: 700,
});

export const editButton = style({
  padding: '4px',
  borderRadius: vars.radius.sm,
  background: 'transparent',
  border: 'none',
  color: vars.color.textDisabled,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
  ':hover': { color: vars.color.accent },
});

export const deleteButton = style({
  padding: '4px',
  borderRadius: vars.radius.sm,
  background: 'transparent',
  border: 'none',
  color: vars.color.textDisabled,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
  ':hover': { color: vars.color.danger },
});

export const formField = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
});

export const formLabel = style({
  fontFamily: vars.font.mono,
  fontSize: '0.6rem',
  color: vars.color.textSecondary,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
});

export const formInput = style({
  padding: `${vars.space.sm} ${vars.space.md}`,
  height: '34px',
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  background: vars.color.bgTertiary,
  color: vars.color.textPrimary,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'all 150ms ease',
  ':focus': {
    borderColor: vars.color.accent,
    background: vars.color.bgPrimary,
    boxShadow: `0 0 0 2px color-mix(in srgb, ${vars.color.accent} 15%, transparent)`,
  },
  ':hover': {
    borderColor: `color-mix(in srgb, ${vars.color.accent} 40%, ${vars.color.border})`,
  },
  '::placeholder': {
    color: vars.color.textDisabled,
  },
});

export const formSelect = style({
  padding: `${vars.space.sm} ${vars.space.md}`,
  height: '34px',
  borderRadius: vars.radius.md,
  border: `1px solid ${vars.color.border}`,
  background: vars.color.bgTertiary,
  color: vars.color.textPrimary,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  outline: 'none',
  boxSizing: 'border-box',
  appearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
  paddingRight: vars.space.xxl,
  cursor: 'pointer',
  transition: 'all 150ms ease',
  ':focus': {
    borderColor: vars.color.accent,
    background: vars.color.bgPrimary,
    boxShadow: `0 0 0 2px color-mix(in srgb, ${vars.color.accent} 15%, transparent)`,
  },
  ':hover': {
    borderColor: `color-mix(in srgb, ${vars.color.accent} 40%, ${vars.color.border})`,
  },
});

export const formRow = style({
  display: 'flex',
  gap: vars.space.sm,
});

export const formActions = style({
  display: 'flex',
  gap: vars.space.sm,
  marginTop: vars.space.sm,
});

export const saveButton = style({
  flex: 1,
  padding: `${vars.space.sm} ${vars.space.md}`,
  height: '36px',
  borderRadius: vars.radius.md,
  background: vars.color.accent,
  color: '#000',
  border: 'none',
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 150ms ease',
  ':hover': {
    opacity: '0.9',
    boxShadow: `0 0 12px color-mix(in srgb, ${vars.color.accent} 30%, transparent)`,
  },
});

export const cancelButton = style({
  flex: 1,
  padding: `${vars.space.sm} ${vars.space.md}`,
  height: '36px',
  borderRadius: vars.radius.md,
  background: 'transparent',
  color: vars.color.textSecondary,
  border: `1px solid ${vars.color.border}`,
  fontFamily: vars.font.mono,
  fontSize: vars.fontSize.xs,
  cursor: 'pointer',
  transition: 'all 150ms ease',
  ':hover': {
    background: vars.color.bgHover,
    borderColor: `color-mix(in srgb, ${vars.color.accent} 30%, ${vars.color.border})`,
  },
});

export const emptyState = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: vars.space.sm,
  padding: vars.space.xl,
  color: vars.color.textDisabled,
  fontSize: vars.fontSize.xs,
  fontFamily: vars.font.mono,
});

export const inlineForm = style({
  display: 'flex',
  flexDirection: 'column',
  gap: vars.space.md,
  padding: vars.space.lg,
  margin: `${vars.space.md} ${vars.space.lg}`,
  borderRadius: vars.radius.lg,
  background: vars.color.bgSecondary,
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 25%, ${vars.color.border})`,
  flexShrink: 0,
  overflowY: 'auto',
  maxHeight: '50vh',
});

export const inlineFormTitle = style({
  fontFamily: vars.font.display,
  fontSize: vars.fontSize.sm,
  color: vars.color.accent,
  letterSpacing: '0.06em',
  fontWeight: 700,
});

export const sectionDivider = style({
  width: '100%',
  height: '1px',
  background: `linear-gradient(90deg, transparent, ${vars.color.accent}, transparent)`,
  opacity: 0.3,
});

export const formFieldFlex = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  flex: 1,
});

export const checkboxLabelReset = style({
  fontFamily: vars.font.mono,
  fontSize: '0.6rem',
  color: vars.color.textSecondary,
  margin: 0,
  textTransform: 'none',
  letterSpacing: 'normal',
});

export const shieldIcon = style({
  verticalAlign: 'middle',
  marginRight: '6px',
});

export const formRowCenter = style({
  display: 'flex',
  gap: vars.space.lg,
  alignItems: 'center',
});
