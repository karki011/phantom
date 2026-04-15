/**
 * CloudZero Dark Theme Tokens
 * Extracted from PhantomOS phantom-theme.ts — CZ Design System values.
 * @author Subash Karki
 */
import type { MantineColorsTuple } from '@mantine/core';
import type { ThemeTokens } from '../types.js';

/* ─── CZ Primitive Color Scales → Mantine 10-shade tuples ─── */
// Mapping: CZ 50→[0], 100→[1], 200→[2], 300→[3], 400→[4], 500→[5], 600→[6], 700→[7], 800→[8], 900→[9]

const czGray: MantineColorsTuple = [
  '#fafafa',  // 50
  '#f4f4f5',  // 100
  '#e4e4e7',  // 200
  '#d4d4d8',  // 300
  '#a1a1aa',  // 400
  '#71717a',  // 500
  '#52525b',  // 600
  '#3f3f46',  // 700
  '#27272a',  // 800
  '#18181b',  // 900
];

const czRed: MantineColorsTuple = [
  '#fef2f2',  // 50
  '#fee2e2',  // 100
  '#fecaca',  // 200
  '#fca5a5',  // 300
  '#f87171',  // 400
  '#ef4444',  // 500
  '#da0a01',  // 600
  '#991919',  // 700
  '#511111',  // 800
  '#300c0c',  // 900
];

const czOrange: MantineColorsTuple = [
  '#ffeac4',  // 50
  '#ffd6b0',  // 100
  '#ffc29c',  // 200
  '#ffa47e',  // 300
  '#ff906a',  // 400
  '#ff7c56',  // 500
  '#fe552e',  // 600
  '#c21800',  // 700
  '#a40000',  // 800
  '#860000',  // 900
];

const czYellow: MantineColorsTuple = [
  '#fefce8',  // 50
  '#fef9c3',  // 100
  '#fef08a',  // 200
  '#ffdc27',  // 300
  '#facc15',  // 400
  '#eab308',  // 500
  '#ca8a04',  // 600
  '#845209',  // 700
  '#713f12',  // 800
  '#422006',  // 900
];

const czGreen: MantineColorsTuple = [
  '#f0fdf4',  // 50
  '#dcfce7',  // 100
  '#bbf7d0',  // 200
  '#86efac',  // 300
  '#4ade80',  // 400
  '#22c55e',  // 500
  '#16a34a',  // 600
  '#116932',  // 700
  '#124a28',  // 800
  '#042713',  // 900
];

const czTeal: MantineColorsTuple = [
  '#f3fbfc',  // 50
  '#e3f5f7',  // 100
  '#cceaed',  // 200
  '#a2dce2',  // 300
  '#74c4cd',  // 400
  '#4599ac',  // 500
  '#2286a1',  // 600
  '#026681',  // 700
  '#03576e',  // 800
  '#00485b',  // 900
];

const czBlue: MantineColorsTuple = [
  '#eff6ff',  // 50
  '#dbeafe',  // 100
  '#bfdbfe',  // 200
  '#a3cfff',  // 300
  '#60a5fa',  // 400
  '#3b82f6',  // 500
  '#2563eb',  // 600
  '#173da6',  // 700
  '#1a3478',  // 800
  '#14204a',  // 900
];

const czCyan: MantineColorsTuple = [
  '#f3fefe',  // 50
  '#e1feff',  // 100
  '#b8fdff',  // 200
  '#69fbff',  // 300
  '#27eef4',  // 400
  '#0ccfd5',  // 500
  '#00b2b7',  // 600
  '#008a8e',  // 700
  '#005d60',  // 800
  '#00484a',  // 900
];

const czPurple: MantineColorsTuple = [
  '#faf5ff',  // 50
  '#f3e8ff',  // 100
  '#e9d5ff',  // 200
  '#d8b4fe',  // 300
  '#c084fc',  // 400
  '#a855f7',  // 500
  '#9333ea',  // 600
  '#641ba3',  // 700
  '#4a1772',  // 800
  '#2f0553',  // 900
];

const czPink: MantineColorsTuple = [
  '#fdf2f8',  // 50
  '#fce7f3',  // 100
  '#fbcfe8',  // 200
  '#f9a8d4',  // 300
  '#f472b6',  // 400
  '#ec4899',  // 500
  '#db2777',  // 600
  '#a41752',  // 700
  '#6d0e34',  // 800
  '#45061f',  // 900
];

/** CZ Brand colors as a custom Mantine palette */
const czBrand: MantineColorsTuple = [
  '#F7F4F1',  // cream
  '#D8EFF3',  // lightBlue
  '#7FC2C8',  // blue (brand primary)
  '#4599ac',  // teal 500
  '#2286a1',  // teal 600
  '#026681',  // teal 700
  '#002E44',  // darkBlue
  '#FEAC01',  // yellow (brand accent)
  '#FE542E',  // orange (CTA)
  '#00485b',  // teal 900
];

/* ─── Token Definition ─── */

export const czDarkTokens: ThemeTokens = {
  name: 'cz-dark',
  label: 'Dark',

  colors: {
    gray: czGray,
    red: czRed,
    orange: czOrange,
    yellow: czYellow,
    green: czGreen,
    teal: czTeal,
    blue: czBlue,
    cyan: czCyan,
    purple: czPurple,
    pink: czPink,
    czBrand,
  },

  primaryColor: 'teal',
  primaryShade: { light: 6, dark: 5 },

  fontFamily: {
    body: "'JetBrains Mono', 'Poppins', monospace",
    heading: "'Orbitron', 'Poppins', sans-serif",
  },

  fontSizes: {
    xs: '12px',
    sm: '14px',
    md: '16px',
    lg: '18px',
    xl: '20px',
  },

  spacing: {
    xs: '8px',
    sm: '12px',
    md: '16px',
    lg: '24px',
    xl: '32px',
  },

  radius: {
    xs: '2px',
    sm: '4px',
    md: '6px',
    lg: '8px',
    xl: '12px',
  },

  defaultRadius: 'md',

  shadows: {
    xs: '0px 1px 2px 0px #18181b0f, 0px 1px 3px 0px #18181b1a',
    sm: '0px 2px 4px 0px #18181b1a, 0px 0px 1px 0px #18181b4d',
    md: '0px 4px 8px 0px #18181b1a, 0px 0px 1px 0px #18181b4d',
    lg: '0px 8px 16px 0px #18181b1a, 0px 0px 1px 0px #18181b4d',
    xl: '0px 16px 24px 0px #18181b1a, 0px 0px 1px 0px #18181b4d',
  },

  cssVars: {
    light: {
      '--phantom-surface-bg': '#fafafa',
      '--phantom-surface-card': '#ffffff',
      '--phantom-surface-elevated': '#f4f4f5',
      '--phantom-surface-hover': '#e4e4e7',
      '--phantom-border-subtle': '#d4d4d8',
      '--phantom-text-primary': '#18181b',
      '--phantom-text-secondary': '#3f3f46',
      '--phantom-text-muted': '#71717a',
      '--phantom-accent-glow': '#4599ac',
      '--phantom-accent-gold': '#FEAC01',
      '--phantom-status-active': '#4ADE80',
      '--phantom-status-warning': '#FB923C',
      '--phantom-status-danger': '#F87171',
      '--phantom-accent-purple': '#9333ea',
    },
    dark: {
      '--phantom-surface-bg': '#0d0d10',
      '--phantom-surface-card': '#161619',
      '--phantom-surface-elevated': '#1e1e22',
      '--phantom-surface-hover': '#27272c',
      '--phantom-border-subtle': '#2e2e33',
      '--phantom-text-primary': '#f0f0f2',
      '--phantom-text-secondary': '#a1a1aa',
      '--phantom-text-muted': '#71717a',
      '--phantom-accent-glow': '#4599ac',
      '--phantom-accent-gold': '#FEAC01',
      '--phantom-status-active': '#4ADE80',
      '--phantom-status-warning': '#FB923C',
      '--phantom-status-danger': '#F87171',
      '--phantom-accent-purple': '#a855f7',
    },
  },
};
