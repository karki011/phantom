/**
 * ThemeProvider — reactive Mantine theme wrapper driven by Jotai atoms.
 * Reads themeNameAtom + fontFamilyAtom and rebuilds the Mantine theme.
 * CSS custom properties (--phantom-*) are applied directly to :root so
 * theme switches take effect instantly without remounting the tree.
 * @author Subash Karki
 */
import { useEffect, useMemo } from 'react';
import { MantineProvider, useMantineColorScheme } from '@mantine/core';
import { useAtomValue } from 'jotai';
import { themeRegistry, defaultTheme, buildPhantomTheme, buildCssVarsResolver } from '@phantom-os/theme';
import { themeNameAtom, fontFamilyAtom, FONT_FAMILY_OPTIONS } from '../atoms/system';

/**
 * Inner component that has access to useMantineColorScheme (must be inside MantineProvider).
 * Applies --phantom-* CSS custom properties to :root whenever the theme or color scheme changes.
 */
const PhantomCssVarsApplicator = ({ tokens, children }: { tokens: typeof defaultTheme; children: React.ReactNode }) => {
  const { colorScheme } = useMantineColorScheme();

  useEffect(() => {
    const root = document.documentElement;
    const vars = colorScheme === 'light'
      ? tokens.cssVars.light
      : tokens.cssVars.dark;
    for (const [prop, value] of Object.entries(vars)) {
      root.style.setProperty(prop, value);
    }
  }, [tokens, colorScheme]);

  return <>{children}</>;
};

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
      <PhantomCssVarsApplicator tokens={tokensWithFont}>
        {children}
      </PhantomCssVarsApplicator>
    </MantineProvider>
  );
};
