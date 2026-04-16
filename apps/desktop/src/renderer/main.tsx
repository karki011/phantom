/**
 * PhantomOS Desktop — Renderer Entry
 * Electron renderer entry point — the sole frontend for PhantomOS.
 * @author Subash Karki
 */
import './fonts/fonts.css';
import '@mantine/core/styles.css';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { QueryClientProvider } from '@tanstack/react-query';
import { Provider as JotaiProvider } from 'jotai';
import { queryClientAtom } from 'jotai-tanstack-query';
import { jotaiStore } from '@phantom-os/panes';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeProvider } from './components/ThemeProvider';
import { queryClient } from './lib/queryClient';

// Hydrate the Jotai queryClientAtom so atomWithQuery uses our configured client
jotaiStore.set(queryClientAtom, queryClient);

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
// Suppress Monaco "Canceled" noise — thrown when a DiffEditor unmounts
// while an async diff computation is in-flight. Harmless internal cleanup.
// ---------------------------------------------------------------------------

window.addEventListener('unhandledrejection', (e) => {
  if (e.reason?.message === 'Canceled' || e.reason?.name === 'Canceled') {
    e.preventDefault();
  }
});

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
    <JotaiProvider store={jotaiStore}>
      <ThemeProvider>
        <ToastContainer
          position="top-right"
          autoClose={4000}
          hideProgressBar={false}
          newestOnTop
          closeOnClick
          pauseOnHover
          draggable={false}
          theme="dark"
          toastStyle={{
            backgroundColor: 'var(--phantom-surface-card)',
            borderRadius: 8,
            border: '1px solid var(--phantom-border-subtle)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            fontSize: '0.82rem',
          }}
        />
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </ThemeProvider>
    </JotaiProvider>
    </QueryClientProvider>
  </StrictMode>,
);
