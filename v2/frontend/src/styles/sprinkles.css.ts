// Author: Subash Karki

import { defineProperties, createSprinkles } from '@vanilla-extract/sprinkles';
import { vars } from './theme.css';

const layoutProperties = defineProperties({
  properties: {
    display: ['none', 'block', 'flex', 'inline-flex', 'grid', 'inline-grid', 'inline-block'],
    flexDirection: ['row', 'column', 'row-reverse', 'column-reverse'],
    alignItems: ['center', 'flex-start', 'flex-end', 'stretch', 'baseline'],
    justifyContent: ['center', 'flex-start', 'flex-end', 'space-between', 'space-around', 'space-evenly'],
    flexWrap: ['wrap', 'nowrap'],
    position: ['relative', 'absolute', 'fixed', 'sticky'],
    overflow: ['hidden', 'auto', 'visible', 'scroll'],
    overflowX: ['hidden', 'auto', 'visible', 'scroll'],
    overflowY: ['hidden', 'auto', 'visible', 'scroll'],
  },
});

const spacingProperties = defineProperties({
  properties: {
    gap: vars.space,
    padding: vars.space,
    paddingTop: vars.space,
    paddingBottom: vars.space,
    paddingLeft: vars.space,
    paddingRight: vars.space,
    margin: vars.space,
    marginTop: vars.space,
    marginBottom: vars.space,
    marginLeft: vars.space,
    marginRight: vars.space,
  },
});

const typographyProperties = defineProperties({
  properties: {
    fontFamily: vars.font,
    fontSize: vars.fontSize,
    fontWeight: ['400', '500', '600', '700'],
    textAlign: ['left', 'center', 'right'],
    textTransform: ['uppercase', 'lowercase', 'capitalize', 'none'],
    letterSpacing: {
      tight: '-0.5px',
      normal: '0px',
      wide: '1px',
      wider: '2px',
    },
    lineHeight: {
      tight: '1',
      normal: '1.5',
      relaxed: '1.75',
    },
    whiteSpace: ['nowrap', 'normal', 'pre-wrap'],
  },
});

const colorProperties = defineProperties({
  properties: {
    color: vars.color,
    background: vars.color,
    borderColor: vars.color,
  },
});

const borderProperties = defineProperties({
  properties: {
    borderRadius: vars.radius,
    borderStyle: ['none', 'solid'],
    borderWidth: {
      '0': '0',
      '1': '1px',
      '2': '2px',
    },
  },
});

const otherProperties = defineProperties({
  properties: {
    cursor: ['pointer', 'default', 'not-allowed', 'text'],
    userSelect: ['none', 'auto', 'text'],
    opacity: {
      '0': '0',
      '50': '0.5',
      '100': '1',
    },
    pointerEvents: ['none', 'auto'],
    width: {
      full: '100%',
      auto: 'auto',
      fit: 'fit-content',
    },
    height: {
      full: '100%',
      auto: 'auto',
      fit: 'fit-content',
    },
    flex: {
      '1': '1',
      auto: 'auto',
      none: 'none',
    },
  },
});

export const sprinkles = createSprinkles(
  layoutProperties,
  spacingProperties,
  typographyProperties,
  colorProperties,
  borderProperties,
  otherProperties,
);

export type Sprinkles = Parameters<typeof sprinkles>[0];
