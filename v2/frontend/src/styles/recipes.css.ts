import { recipe } from '@vanilla-extract/recipes';
import { vars } from './theme.css';

export const buttonRecipe = recipe({
  base: {
    fontFamily: vars.font.body,
    fontSize: vars.fontSize.sm,
    fontWeight: 500,
    borderRadius: vars.radius.md,
    border: 'none',
    cursor: 'pointer',
    padding: `${vars.space.sm} ${vars.space.md}`,
    transition: `all ${vars.animation.fast} ease`,
    outline: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: vars.space.xs,
    ':focus-visible': {
      boxShadow: `0 0 0 2px ${vars.color.borderFocus}`,
    },
    selectors: {
      '&:disabled': {
        opacity: '0.4',
        cursor: 'not-allowed',
        pointerEvents: 'none',
      },
    },
  },
  variants: {
    variant: {
      primary: {
        background: vars.color.accent,
        color: vars.color.textInverse,
        ':hover': { background: vars.color.accentHover },
      },
      ghost: {
        background: 'transparent',
        color: vars.color.textPrimary,
        ':hover': { background: vars.color.bgHover },
      },
      outline: {
        background: 'transparent',
        color: vars.color.textPrimary,
        border: `1px solid ${vars.color.border}`,
        ':hover': { background: vars.color.bgHover, borderColor: vars.color.borderFocus },
      },
      danger: {
        background: vars.color.danger,
        color: vars.color.textInverse,
        ':hover': { opacity: '0.9' },
      },
    },
    size: {
      sm: { padding: `${vars.space.xs} ${vars.space.sm}`, fontSize: vars.fontSize.xs },
      md: { padding: `${vars.space.sm} ${vars.space.md}`, fontSize: vars.fontSize.sm },
      lg: { padding: `${vars.space.md} ${vars.space.lg}`, fontSize: vars.fontSize.md },
    },
  },
  defaultVariants: {
    variant: 'primary',
    size: 'md',
  },
});

export const cardRecipe = recipe({
  base: {
    background: vars.color.bgSecondary,
    border: `1px solid ${vars.color.border}`,
    borderRadius: vars.radius.lg,
    padding: vars.space.lg,
    transition: `all ${vars.animation.fast} ease`,
  },
  variants: {
    glow: {
      true: { boxShadow: vars.shadow.glow },
      false: {},
    },
    hoverable: {
      true: {
        ':hover': {
          borderColor: vars.color.borderHover,
          background: vars.color.bgHover,
        },
      },
      false: {},
    },
  },
  defaultVariants: {
    glow: false,
    hoverable: false,
  },
});

export const textRecipe = recipe({
  base: {
    fontFamily: vars.font.body,
  },
  variants: {
    variant: {
      heading: {
        fontSize: vars.fontSize.xl,
        fontWeight: 700,
        color: vars.color.textPrimary,
        letterSpacing: '0.05em',
      },
      body: {
        fontSize: vars.fontSize.md,
        color: vars.color.textPrimary,
      },
      caption: {
        fontSize: vars.fontSize.xs,
        color: vars.color.textSecondary,
      },
      code: {
        fontFamily: vars.font.mono,
        fontSize: vars.fontSize.sm,
        color: vars.color.accent,
      },
      system: {
        fontFamily: vars.font.mono,
        fontSize: vars.fontSize.sm,
        color: vars.color.info,
        letterSpacing: '0.05em',
        textTransform: 'uppercase' as const,
      },
    },
  },
  defaultVariants: {
    variant: 'body',
  },
});
