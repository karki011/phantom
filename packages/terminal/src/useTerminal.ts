/**
 * Hook for terminal lifecycle — create, resize, dispose.
 * PTY backend (node-pty) will be connected later via Electron IPC.
 * @author Subash Karki
 */
import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { getTerminalTheme } from './theme.js';

export const useTerminal = (
  containerRef: React.RefObject<HTMLDivElement | null>,
) => {
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      theme: getTerminalTheme(),
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 14,
      cursorBlink: true,
      cursorStyle: 'bar',
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());

    term.open(containerRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    // Re-fit on container resize
    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(containerRef.current);

    // Welcome message (no shell connected yet)
    term.writeln('\x1b[1;36mPhantomOS Terminal\x1b[0m');
    term.writeln('');

    return () => {
      observer.disconnect();
      term.dispose();
    };
  }, [containerRef]);

  return { terminal: termRef, fit: fitRef };
};
