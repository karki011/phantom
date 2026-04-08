/**
 * xterm.js React wrapper rendered inside a PhantomOS pane.
 * @author Subash Karki
 */
import { useRef } from 'react';
import '@xterm/xterm/css/xterm.css';
import { useTerminal } from './useTerminal.js';

interface TerminalPaneProps {
  paneId: string;
  cwd?: string;
}

export const TerminalPane = ({ paneId, cwd }: TerminalPaneProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  useTerminal(containerRef, paneId, cwd);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', padding: '4px' }}
      data-pane-id={paneId}
    />
  );
};
