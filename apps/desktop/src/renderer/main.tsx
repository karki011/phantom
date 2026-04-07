/**
 * PhantomOS Desktop — Renderer Entry
 * Mirrors apps/web/src/main.tsx, sharing the same App component via symlinks.
 * @author Subash Karki
 */
import { MantineProvider } from '@mantine/core';
import '@mantine/core/styles.css';
import { Notifications } from '@mantine/notifications';
import '@mantine/notifications/styles.css';
import { Provider as JotaiProvider } from 'jotai';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { buildCssVarsResolver, buildPhantomTheme, defaultTheme } from '@phantom-os/theme';

import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

// ---------------------------------------------------------------------------
// Font scale initialization from localStorage (before React mounts)
// ---------------------------------------------------------------------------

const applyFontScale = () => {
  try {
    const stored = localStorage.getItem('phantom-font-scale');
    if (stored) {
      const scale = JSON.parse(stored) as number;
      if ([0.9, 1.0, 1.1, 1.25, 1.5].includes(scale)) {
        document.documentElement.style.fontSize = `${scale}rem`;
      }
    }
  } catch {
    // Ignore parse errors — use browser default
  }
};

applyFontScale();

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

const defaultColorScheme =
  (localStorage.getItem('phantom-theme')?.replace(/"/g, '') as 'dark' | 'light') ?? 'dark';

createRoot(container).render(
  <StrictMode>
    <MantineProvider
      theme={buildPhantomTheme(defaultTheme)}
      defaultColorScheme={defaultColorScheme}
      cssVariablesResolver={buildCssVarsResolver(defaultTheme)}
    >
      <Notifications position="top-right" />
      <JotaiProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </JotaiProvider>
    </MantineProvider>
  </StrictMode>,
);
