// Author: Subash Karki
import { style } from '@vanilla-extract/css';
import { vars } from '@/styles/theme.css';

export const turnGroup = style({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  selectors: {
    '& + &': {
      borderTop: `1px solid ${vars.color.divider}`,
      paddingTop: vars.space.lg,
    },
  },
});

export const assistantBadge = style({
  display: 'inline-block',
  marginBottom: vars.space.xs,
  padding: '1px 6px',
  borderRadius: vars.radius.sm,
  background: vars.color.bgTertiary,
  color: vars.color.textSecondary,
  fontSize: '10px',
  fontWeight: 600,
  letterSpacing: '0.05em',
});
