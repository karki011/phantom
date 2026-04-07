/**
 * Nord Arctic Theme Tokens
 * Calm, minimal, Scandinavian — based on the Nord color palette.
 * @author Subash Karki
 */
import type { MantineColorsTuple } from '@mantine/core';
import type { ThemeTokens } from '../types.js';

const blue: MantineColorsTuple = [
  '#e8eff8', '#d1dff1', '#b0c8e6', '#8fb1db', '#6e9ace',
  '#5e81ac', '#4c6e99', '#3b5b86', '#2e4a70', '#213a5a',
];

const green: MantineColorsTuple = [
  '#eef3ea', '#dde8d5', '#c5d8b5', '#b1cb9e', '#a3be8c',
  '#8fad74', '#7a9a5e', '#65874a', '#527438', '#3f6128',
];

const yellow: MantineColorsTuple = [
  '#fdf6e3', '#faedc7', '#f5dfA0', '#f0d47e', '#ebcb8b',
  '#d4b474', '#be9e5e', '#a8884a', '#8c7238', '#705c28',
];

const red: MantineColorsTuple = [
  '#f5e4e3', '#ebc8c7', '#dca4a1', '#cf827e', '#bf616a',
  '#ab5158', '#974248', '#833438', '#6e2628', '#5a1a1c',
];

const purple: MantineColorsTuple = [
  '#ede6ef', '#dbcde0', '#c4a8cc', '#b48ebe', '#b48ead',
  '#a07a9a', '#8c6888', '#785676', '#644564', '#503454',
];

const frost: MantineColorsTuple = [
  '#eef4f8', '#dde9f1', '#bbdae8', '#8fbcbb', '#88c0d0',
  '#81a1c1', '#6d8dae', '#5a799a', '#476586', '#345172',
];

const gray: MantineColorsTuple = [
  '#eceff4', '#e5e9f0', '#d8dee9', '#c0c8d4', '#a5b0bf',
  '#7b879a', '#5d6a7e', '#4c566a', '#3b4252', '#2e3440',
];

export const nordTokens: ThemeTokens = {
  name: 'nord',
  label: 'Nord Arctic',

  colors: { blue, green, yellow, red, purple, frost, gray },

  primaryColor: 'blue',
  primaryShade: { light: 5, dark: 5 },

  fontFamily: {
    body: "'JetBrains Mono', 'Poppins', monospace",
    heading: "'Orbitron', 'Poppins', sans-serif",
  },

  fontSizes: { xs: '12px', sm: '14px', md: '16px', lg: '18px', xl: '20px' },
  spacing: { xs: '8px', sm: '12px', md: '16px', lg: '24px', xl: '32px' },
  radius: { xs: '2px', sm: '4px', md: '6px', lg: '8px', xl: '12px' },
  defaultRadius: 'md',

  shadows: {
    xs: '0 1px 2px #2e344026',
    sm: '0 2px 4px #2e344033',
    md: '0 4px 8px #2e344033',
    lg: '0 8px 16px #2e344040',
    xl: '0 16px 24px #2e344040',
  },

  cssVars: {
    light: {
      '--phantom-surface-bg': '#eceff4',
      '--phantom-surface-card': '#e5e9f0',
      '--phantom-surface-elevated': '#d8dee9',
      '--phantom-border-subtle': '#c0c8d4',
      '--phantom-text-primary': '#2e3440',
      '--phantom-text-secondary': '#4c566a',
      '--phantom-text-muted': '#7b879a',
      '--phantom-accent-glow': '#88c0d0',
      '--phantom-accent-gold': '#ebcb8b',
      '--phantom-status-active': '#a3be8c',
      '--phantom-status-warning': '#ebcb8b',
      '--phantom-status-danger': '#bf616a',
    },
    dark: {
      '--phantom-surface-bg': '#2e3440',
      '--phantom-surface-card': '#3b4252',
      '--phantom-surface-elevated': '#434c5e',
      '--phantom-border-subtle': '#4c566a',
      '--phantom-text-primary': '#eceff4',
      '--phantom-text-secondary': '#d8dee9',
      '--phantom-text-muted': '#7b879a',
      '--phantom-accent-glow': '#88c0d0',
      '--phantom-accent-gold': '#ebcb8b',
      '--phantom-status-active': '#a3be8c',
      '--phantom-status-warning': '#ebcb8b',
      '--phantom-status-danger': '#bf616a',
    },
  },
};
