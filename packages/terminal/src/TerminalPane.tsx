/**
 * xterm.js React wrapper rendered inside a PhantomOS pane.
 * Includes a Solo Leveling-themed loading overlay while the PTY connects.
 * @author Subash Karki
 */
import { useRef, useState, useEffect } from 'react';
import '@xterm/xterm/css/xterm.css';
import { useTerminal } from './useTerminal.js';

interface TerminalPaneProps {
  paneId: string;
  cwd?: string;
  initialCommand?: string;
}

const overlayStyles = `
  @keyframes phantom-blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
  }
  @keyframes phantom-pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 1; }
  }
  .phantom-terminal-overlay {
    position: absolute;
    inset: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    background: var(--phantom-surface-bg);
    transition: opacity 300ms ease;
  }
  .phantom-terminal-overlay.connected {
    opacity: 0;
    pointer-events: none;
  }
  .phantom-terminal-dots {
    display: flex;
    gap: 6px;
  }
  .phantom-terminal-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--phantom-accent-primary, var(--phantom-text-muted));
    animation: phantom-pulse 1.2s ease-in-out infinite;
  }
  .phantom-terminal-dot:nth-child(2) { animation-delay: 0.2s; }
  .phantom-terminal-dot:nth-child(3) { animation-delay: 0.4s; }
  .phantom-terminal-label {
    color: var(--phantom-text-muted);
    font-size: 0.85rem;
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.03em;
  }
  .phantom-terminal-cursor {
    color: var(--phantom-accent-primary, var(--phantom-text-muted));
    font-size: 1rem;
    font-family: 'JetBrains Mono', monospace;
    animation: phantom-blink 1s step-end infinite;
  }
`;

export const TerminalPane = ({ paneId, cwd, initialCommand }: TerminalPaneProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { connected } = useTerminal(containerRef, paneId, cwd, initialCommand);

  // Remove overlay from DOM after fade-out transition (300ms)
  const [overlayMounted, setOverlayMounted] = useState(true);
  useEffect(() => {
    if (connected) {
      const timer = setTimeout(() => setOverlayMounted(false), 350);
      return () => clearTimeout(timer);
    }
  }, [connected]);

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      <style>{overlayStyles}</style>

      {overlayMounted && (
        <div className={`phantom-terminal-overlay${connected ? ' connected' : ''}`}>
          <div className="phantom-terminal-dots">
            <div className="phantom-terminal-dot" />
            <div className="phantom-terminal-dot" />
            <div className="phantom-terminal-dot" />
          </div>
          <span className="phantom-terminal-label">Summoning terminal...</span>
          <span className="phantom-terminal-cursor">█</span>
        </div>
      )}

      <div
        ref={containerRef}
        style={{ width: '100%', height: '100%', padding: '4px' }}
        data-pane-id={paneId}
      />
    </div>
  );
};
