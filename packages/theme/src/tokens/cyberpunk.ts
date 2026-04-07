/**
 * Cyberpunk Neon Theme Tokens
 * Hot pink/magenta primary, electric cyan accents, deep dark blue-black backgrounds.
 * Vibe: Blade Runner / Cyberpunk 2077
 * @author Subash Karki
 */
import type { MantineColorsTuple } from '@mantine/core';
import type { ThemeTokens } from '../types.js';

const pink: MantineColorsTuple = [
  '#fdf2f8', '#fce7f3', '#fbcfe8', '#f9a8d4', '#f472b6',
  '#ec4899', '#db2777', '#be185d', '#9d174d', '#831843',
];

const cyan: MantineColorsTuple = [
  '#ecfeff', '#cffafe', '#a5f3fc', '#67e8f9', '#22d3ee',
  '#06b6d4', '#0891b2', '#0e7490', '#155e75', '#164e63',
];

const purple: MantineColorsTuple = [
  '#f5f3ff', '#ede9fe', '#ddd6fe', '#c4b5fd', '#a78bfa',
  '#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95',
];

const green: MantineColorsTuple = [
  '#ecfdf5', '#d1fae5', '#a7f3d0', '#6ee7b7', '#34d399',
  '#10b981', '#059669', '#047857', '#065f46', '#064e3b',
];

const red: MantineColorsTuple = [
  '#fef2f2', '#fee2e2', '#fecaca', '#fca5a5', '#f87171',
  '#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d',
];

const yellow: MantineColorsTuple = [
  '#fefce8', '#fef9c3', '#fef08a', '#fde047', '#facc15',
  '#eab308', '#ca8a04', '#a16207', '#854d0e', '#713f12',
];

const gray: MantineColorsTuple = [
  '#e8e6f0', '#d0cde0', '#b3afc8', '#8a85a8', '#6b6588',
  '#4e4968', '#3a3554', '#2a2545', '#1a1a2e', '#111127',
];

export const cyberpunkTokens: ThemeTokens = {
  name: 'cyberpunk',
  label: 'Cyberpunk Neon',

  colors: { pink, cyan, purple, green, red, yellow, gray },

  primaryColor: 'pink',
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
    xs: '0 1px 3px #ec489933',
    sm: '0 2px 6px #ec489944',
    md: '0 4px 12px #ec489944, 0 0 4px #06b6d433',
    lg: '0 8px 24px #ec489955, 0 0 8px #06b6d444',
    xl: '0 16px 48px #ec489955, 0 0 16px #06b6d444',
  },

  cssVars: {
    light: {
      '--phantom-surface-bg': '#1a1a2e',
      '--phantom-surface-card': '#111127',
      '--phantom-surface-elevated': '#222244',
      '--phantom-border-subtle': '#4c1d95',
      '--phantom-text-primary': '#ecfeff',
      '--phantom-text-secondary': '#a5f3fc',
      '--phantom-text-muted': '#6b6588',
      '--phantom-accent-glow': '#06b6d4',
      '--phantom-accent-gold': '#facc15',
      '--phantom-status-active': '#10b981',
      '--phantom-status-warning': '#facc15',
      '--phantom-status-danger': '#f87171',
    },
    dark: {
      '--phantom-surface-bg': '#0a0a1a',
      '--phantom-surface-card': '#111127',
      '--phantom-surface-elevated': '#1a1a2e',
      '--phantom-border-subtle': '#4c1d95',
      '--phantom-text-primary': '#ecfeff',
      '--phantom-text-secondary': '#a5f3fc',
      '--phantom-text-muted': '#6b6588',
      '--phantom-accent-glow': '#06b6d4',
      '--phantom-accent-gold': '#facc15',
      '--phantom-status-active': '#10b981',
      '--phantom-status-warning': '#facc15',
      '--phantom-status-danger': '#f87171',
    },
  },
};
