// Author: Subash Karki

import { style } from '@vanilla-extract/css';
import { vars } from '../../styles/theme.css';

export const layout = style({
  display: 'grid',
  gridTemplateColumns: '1fr 2fr 1fr',
  height: '100%',
  overflow: 'hidden',
});

export const leftPanel = style({
  borderRight: `1px solid ${vars.color.divider}`,
  overflow: 'hidden',
});

export const centerPanel = style({
  overflow: 'hidden',
});

export const rightPanel = style({
  borderLeft: `1px solid ${vars.color.divider}`,
  overflow: 'hidden',
});
