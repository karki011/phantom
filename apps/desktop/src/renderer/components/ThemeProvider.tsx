/**
 * ThemeProvider — reactive Mantine theme wrapper driven by Jotai atom.
 * Reads themeNameAtom and rebuilds the Mantine theme whenever it changes.
 * @author Subash Karki
 */
import { MantineProvider } from '@mantine/core';
import { useAtomValue } from 'jotai';
import { themeRegistry, defaultTheme, buildPhantomTheme, buildCssVarsResolver } from '@phantom-os/theme';
import { themeNameAtom } from '../atoms/system';

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const themeName = useAtomValue(themeNameAtom);
  const tokens = themeRegistry.find(t => t.name === themeName) ?? defaultTheme;
  const theme = buildPhantomTheme(tokens);
  const cssVarsResolver = buildCssVarsResolver(tokens);

  const defaultColorScheme =
    (localStorage.getItem('phantom-theme')?.replace(/"/g, '') as 'dark' | 'light') ?? 'dark';

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
