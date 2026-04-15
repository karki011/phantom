/**
 * ThemeProvider — reactive Mantine theme wrapper driven by Jotai atoms.
 * Reads themeNameAtom + fontFamilyAtom and rebuilds the Mantine theme.
 * CSS custom properties (--phantom-*) are applied directly to :root so
 * theme switches take effect instantly without remounting the tree.
 * @author Subash Karki
 */
import { useEffect, useMemo } from 'react';
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

  const theme = useMemo(() => buildPhantomTheme(tokensWithFont), [tokensWithFont]);
  const cssVarsResolver = useMemo(() => buildCssVarsResolver(tokensWithFont), [tokensWithFont]);

  // Apply --phantom-* CSS custom properties directly to :root on theme change
  // so the entire UI updates without unmounting/remounting the component tree
  useEffect(() => {
    const root = document.documentElement;
    const colorScheme = root.getAttribute('data-mantine-color-scheme') ?? 'dark';
    const vars = colorScheme === 'light'
      ? tokensWithFont.cssVars.light
      : tokensWithFont.cssVars.dark;
    for (const [prop, value] of Object.entries(vars)) {
      root.style.setProperty(prop, value);
    }
  }, [tokensWithFont]);

  let defaultColorScheme: 'dark' | 'light' = 'dark';
  try {
    defaultColorScheme = (localStorage.getItem('phantom-theme')?.replace(/"/g, '') as 'dark' | 'light') ?? 'dark';
  } catch {}

  return (
    <MantineProvider
      theme={theme}
      defaultColorScheme={defaultColorScheme}
      cssVariablesResolver={cssVarsResolver}
    >
      {children}
    </MantineProvider>
  );
};
