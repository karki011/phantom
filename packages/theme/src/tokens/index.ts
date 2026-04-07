import { czDarkTokens } from './cz-dark.js';
import { cyberpunkTokens } from './cyberpunk.js';
import { nordTokens } from './nord.js';
import { draculaTokens } from './dracula.js';
import type { ThemeTokens } from '../types.js';

export const themeRegistry: ThemeTokens[] = [
  czDarkTokens,
  cyberpunkTokens,
  nordTokens,
  draculaTokens,
];
export const defaultTheme = czDarkTokens;
export { czDarkTokens, cyberpunkTokens, nordTokens, draculaTokens };
