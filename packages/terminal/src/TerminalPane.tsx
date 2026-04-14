/**
 * xterm.js React wrapper rendered inside a PhantomOS pane.
 * Includes restore banner for cold restore sessions.
 * @author Subash Karki
 */
import { useCallback, useRef, useState } from 'react';
import '@xterm/xterm/css/xterm.css';
import { useTerminal } from './useTerminal.js';
import { getSession } from './state.js';
import { TaskOverlayPanel } from './TaskOverlayPanel.js';

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
  coldRestore?: boolean;
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
  coldRestore,
}: TerminalPaneProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const { connected, showRestoreBanner, dismissBanner } = useTerminal(
    containerRef,
    paneId,
    cwd,
    initialCommand,
    {
      workspaceId,
      projectId,
      recipeCommand,
      recipeLabel,
      recipeCategory,
      port,
    },
  );

  /** Send a string as terminal input (types it into the PTY) */
  const typeIntoTerminal = useCallback((text: string) => {
    const session = getSession(paneId);
    if (session?.ws && session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify({ type: 'input', data: text }));
    }
  }, [paneId]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    // File path dragged from the PhantomOS file tree
    const phantomPath = e.dataTransfer?.getData('application/x-phantom-file');
    if (phantomPath) {
      // Quote the path in case it has spaces
      const quoted = phantomPath.includes(' ') ? `"${phantomPath}"` : phantomPath;
      typeIntoTerminal(quoted);
      return;
    }

    // Files dropped from the OS (Finder, etc.)
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const paths: string[] = [];
      for (const file of files) {
        // Electron File objects have a .path property with the absolute path
        const filePath = (file as File & { path?: string }).path || file.name;
        paths.push(filePath.includes(' ') ? `"${filePath}"` : filePath);
      }
      typeIntoTerminal(paths.join(' '));
      return;
    }

    // Plain text (e.g. path copied from somewhere)
    const text = e.dataTransfer?.getData('text/plain');
    if (text) {
      typeIntoTerminal(text);
    }
  }, [typeIntoTerminal]);

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag-drop overlay */}
      {dragOver && (
        <div style={{
          position: 'absolute',
          inset: 0,
          zIndex: 20,
          backgroundColor: 'rgba(69, 153, 172, 0.1)',
          border: '2px dashed var(--phantom-accent-glow, #00c8ff)',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <span style={{
            color: 'var(--phantom-accent-glow, #00c8ff)',
            fontWeight: 600,
            fontSize: '14px',
            fontFamily: 'JetBrains Mono, monospace',
          }}>
            Drop file to paste path
          </span>
        </div>
      )}

      {/* Restore banner */}
      {showRestoreBanner && (
        <div
          onClick={dismissBanner}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
            padding: '8px 16px',
            background: 'linear-gradient(135deg, rgba(0, 200, 255, 0.15), rgba(139, 92, 246, 0.15))',
            borderBottom: '1px solid rgba(0, 200, 255, 0.3)',
            color: '#00c8ff',
            fontSize: '13px',
            fontFamily: 'JetBrains Mono, monospace',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            animation: 'phantom-banner-fade 4s ease-in-out forwards',
          }}
        >
          <span style={{ fontSize: '16px' }}>⚡</span>
          <span>Previous session restored. Running processes were restarted.</span>
          <span style={{ marginLeft: 'auto', opacity: 0.6, fontSize: '11px' }}>click to dismiss</span>
        </div>
      )}

      {/* Terminal renders immediately */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          padding: '4px',
          paddingTop: showRestoreBanner ? '40px' : '4px',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
        data-pane-id={paneId}
        data-cold-restore={coldRestore ? 'true' : undefined}
      />

      {/* Task overlay — only renders when incomplete tasks exist */}
      {cwd && <TaskOverlayPanel cwd={cwd} />}

      {/* Inline keyframes for banner animation */}
      <style>{`
        @keyframes phantom-banner-fade {
          0% { opacity: 0; transform: translateY(-10px); }
          10% { opacity: 1; transform: translateY(0); }
          80% { opacity: 1; }
          100% { opacity: 0; pointer-events: none; }
        }
      `}</style>
    </div>
  );
};
