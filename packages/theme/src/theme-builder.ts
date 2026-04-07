/**
 * PhantomOS Theme Builder
 * Produces Mantine theme config from any ThemeTokens.
 * @author Subash Karki
 */
import { createTheme, type CSSVariablesResolver } from '@mantine/core';
import type { ThemeTokens } from './types.js';

export const buildPhantomTheme = (tokens: ThemeTokens) =>
  createTheme({
    colors: tokens.colors,
    primaryColor: tokens.primaryColor,
    primaryShade: tokens.primaryShade,
    fontFamily: tokens.fontFamily.body,
    headings: { fontFamily: tokens.fontFamily.heading },
    fontSizes: tokens.fontSizes,
    spacing: tokens.spacing,
    radius: tokens.radius,
    defaultRadius: tokens.defaultRadius,
    shadows: tokens.shadows,
  });

export const buildCssVarsResolver = (tokens: ThemeTokens): CSSVariablesResolver =>
  () => ({
    variables: {},
    light: tokens.cssVars.light,
    dark: tokens.cssVars.dark,
  });
