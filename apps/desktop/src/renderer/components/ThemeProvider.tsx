/**
 * ThemeProvider — reactive Mantine theme wrapper driven by Jotai atoms.
 * Reads themeNameAtom + fontFamilyAtom and rebuilds the Mantine theme.
 * @author Subash Karki
 */
import { MantineProvider } from '@mantine/core';
import { useAtomValue } from 'jotai';
import { themeRegistry, defaultTheme, buildPhantomTheme, buildCssVarsResolver } from '@phantom-os/theme';
import { themeNameAtom, fontFamilyAtom, FONT_FAMILY_OPTIONS } from '../atoms/system';

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const themeName = useAtomValue(themeNameAtom);
  const fontFamily = useAtomValue(fontFamilyAtom);
  const tokens = themeRegistry.find(t => t.name === themeName) ?? defaultTheme;

  // Override body font with user selection, keep heading font (Orbitron)
  const fontOption = FONT_FAMILY_OPTIONS.find(f => f.value === fontFamily);
  const tokensWithFont = fontOption
    ? { ...tokens, fontFamily: { body: fontOption.css, heading: tokens.fontFamily.heading } }
    : tokens;

  const theme = buildPhantomTheme(tokensWithFont);
  const cssVarsResolver = buildCssVarsResolver(tokensWithFont);

  let defaultColorScheme: 'dark' | 'light' = 'dark';
  try {
    defaultColorScheme = (localStorage.getItem('phantom-theme')?.replace(/"/g, '') as 'dark' | 'light') ?? 'dark';
  } catch {}

  return (
    <MantineProvider
      key={themeName}
      theme={theme}
      defaultColorScheme={defaultColorScheme}
      cssVariablesResolver={cssVarsResolver}
    >
      {children}
    </MantineProvider>
  );
};
