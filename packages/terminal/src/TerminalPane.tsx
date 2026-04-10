/**
 * xterm.js React wrapper rendered inside a PhantomOS pane.
 * Includes restore banner for cold restore sessions.
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

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
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
        }}
        data-pane-id={paneId}
        data-cold-restore={coldRestore ? 'true' : undefined}
      />

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
