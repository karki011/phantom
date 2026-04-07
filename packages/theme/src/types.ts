/**
 * PhantomOS Theme Token Interface
 * All themes must implement this contract.
 * @author Subash Karki
 */
import type { MantineColorShade, MantineColorsTuple } from '@mantine/core';

export interface ThemeTokens {
  /** Unique identifier (e.g., 'cz-dark', 'cyberpunk', 'nord') */
  name: string;
  /** Display name shown in theme picker (e.g., 'CloudZero Dark') */
  label: string;
  /** Color scales — each key maps to a Mantine 10-shade tuple */
  colors: Record<string, MantineColorsTuple>;
  /** Primary color key (must exist in colors) */
  primaryColor: string;
  /** Primary shade index for light/dark modes */
  primaryShade: { light: MantineColorShade; dark: MantineColorShade };
  /** Font families */
  fontFamily: { body: string; heading: string };
  /** Font sizes: xs, sm, md, lg, xl */
  fontSizes: Record<string, string>;
  /** Spacing scale: xs, sm, md, lg, xl */
  spacing: Record<string, string>;
  /** Border radius scale: xs, sm, md, lg, xl */
  radius: Record<string, string>;
  /** Default border radius key */
  defaultRadius: string;
  /** Box shadow scale: xs, sm, md, lg, xl */
  shadows: Record<string, string>;
  /** CSS custom variables for light and dark modes */
  cssVars: {
    light: Record<string, string>;
    dark: Record<string, string>;
  };
}
