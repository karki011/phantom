// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

export const glass = style({
  background: `color-mix(in srgb, ${vars.color.bgTertiary} 80%, transparent)`,
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  border: `1px solid color-mix(in srgb, ${vars.color.accent} 20%, transparent)`,
  borderRadius: vars.radius.lg,
  padding: `${vars.space.xxl} ${vars.space.xxl}`,
  boxShadow: `${vars.shadow.lg}, 0 0 60px rgba(124, 58, 237, 0.06)`,
});
