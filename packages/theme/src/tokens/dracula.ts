/**
 * Dracula Theme Tokens
 * Rich, dark, colorful — based on the popular Dracula color scheme.
 * @author Subash Karki
 */
import type { MantineColorsTuple } from '@mantine/core';
import type { ThemeTokens } from '../types.js';

const purple: MantineColorsTuple = [
  '#f2ecfe', '#e5d9fd', '#d4c2fc', '#c3abfb', '#bd93f9',
  '#a87de6', '#9368d3', '#7e53c0', '#693fad', '#542b9a',
];

const pink: MantineColorsTuple = [
  '#ffe8f5', '#ffd1eb', '#ffb0dc', '#ff97d0', '#ff79c6',
  '#e66db2', '#cc619e', '#b3558b', '#994977', '#803d63',
];

const cyan: MantineColorsTuple = [
  '#e8fafe', '#d1f5fd', '#aeeefc', '#8be9fd', '#6edcf0',
  '#55c8dd', '#3db4ca', '#289fb7', '#168ba4', '#067791',
];

const green: MantineColorsTuple = [
  '#e5fee8', '#cbfdd2', '#a5fbb2', '#80fa93', '#50fa7b',
  '#40e06c', '#32c65d', '#24ac4f', '#189240', '#0c7832',
];

const orange: MantineColorsTuple = [
  '#fff0e0', '#ffe1c1', '#ffcfa0', '#ffc085', '#ffb86c',
  '#e6a560', '#cc9255', '#b3804a', '#996d3f', '#805a34',
];

const red: MantineColorsTuple = [
  '#ffe5e5', '#ffcccc', '#ffa6a6', '#ff7d7d', '#ff5555',
  '#e64c4c', '#cc4444', '#b33b3b', '#993333', '#802a2a',
];

const yellow: MantineColorsTuple = [
  '#fdfee5', '#fbfdcb', '#f8fca6', '#f5fb98', '#f1fa8c',
  '#d8e17e', '#bfc870', '#a6af62', '#8d9654', '#747d46',
];

const gray: MantineColorsTuple = [
  '#f8f8f2', '#e0e0d8', '#b0b0a4', '#8a8a7e', '#6272a4',
  '#565870', '#44475a', '#383a4a', '#282a36', '#191a21',
];

export const draculaTokens: ThemeTokens = {
  name: 'dracula',
  label: 'Dracula',

  colors: { purple, pink, cyan, green, orange, red, yellow, gray },

  primaryColor: 'purple',
  primaryShade: { light: 4, dark: 4 },

  fontFamily: {
    body: "'JetBrains Mono', 'Poppins', monospace",
    heading: "'Orbitron', 'Poppins', sans-serif",
  },

  fontSizes: { xs: '12px', sm: '14px', md: '16px', lg: '18px', xl: '20px' },
  spacing: { xs: '8px', sm: '12px', md: '16px', lg: '24px', xl: '32px' },
  radius: { xs: '2px', sm: '4px', md: '6px', lg: '8px', xl: '12px' },
  defaultRadius: 'md',

  shadows: {
    xs: '0 1px 3px #191a2133',
    sm: '0 2px 6px #191a2144',
    md: '0 4px 12px #191a2155, 0 0 4px #bd93f922',
    lg: '0 8px 24px #191a2166, 0 0 8px #bd93f933',
    xl: '0 16px 48px #191a2177, 0 0 16px #bd93f933',
  },

  cssVars: {
    light: {
      '--phantom-surface-bg': '#383a4a',
      '--phantom-surface-card': '#44475a',
      '--phantom-surface-elevated': '#565870',
      '--phantom-border-subtle': '#6272a4',
      '--phantom-text-primary': '#f8f8f2',
      '--phantom-text-secondary': '#b0b0a4',
      '--phantom-text-muted': '#6272a4',
      '--phantom-accent-glow': '#bd93f9',
      '--phantom-accent-gold': '#f1fa8c',
      '--phantom-status-active': '#50fa7b',
      '--phantom-status-warning': '#ffb86c',
      '--phantom-status-danger': '#ff5555',
    },
    dark: {
      '--phantom-surface-bg': '#282a36',
      '--phantom-surface-card': '#21222c',
      '--phantom-surface-elevated': '#191a21',
      '--phantom-border-subtle': '#44475a',
      '--phantom-text-primary': '#f8f8f2',
      '--phantom-text-secondary': '#b0b0a4',
      '--phantom-text-muted': '#6272a4',
      '--phantom-accent-glow': '#bd93f9',
      '--phantom-accent-gold': '#f1fa8c',
      '--phantom-status-active': '#50fa7b',
      '--phantom-status-warning': '#ffb86c',
      '--phantom-status-danger': '#ff5555',
    },
  },
};
