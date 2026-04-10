/**
 * xterm.js React wrapper rendered inside a PhantomOS pane.
 * Includes a Solo Leveling-themed loading overlay while the PTY connects.
 * @author Subash Karki
 */
import { useRef } from 'react';
import '@xterm/xterm/css/xterm.css';
import { useTerminal } from './useTerminal.js';

interface TerminalPaneProps {
  paneId: string;
  cwd?: string;
  initialCommand?: string;
  workspaceId?: string;
  projectId?: string;
  recipeCommand?: string;
  recipeLabel?: string;
  recipeCategory?: string;
  port?: number | null;
}

export const TerminalPane = ({
  paneId,
  cwd,
  initialCommand,
  workspaceId,
  projectId,
  recipeCommand,
  recipeLabel,
  recipeCategory,
  port,
}: TerminalPaneProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { connected } = useTerminal(containerRef, paneId, cwd, initialCommand, {
    workspaceId,
    projectId,
    recipeCommand,
    recipeLabel,
    recipeCategory,
    port,
  });

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      {/* Terminal renders immediately — no blocking overlay */}
      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', padding: '4px' }}
        data-pane-id={paneId}
      />
    </div>
  );
};
