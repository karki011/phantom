// PhantomOS v2 — Terminal pane placeholder (Wave 4 will connect xterm)
// Author: Subash Karki

export default function TerminalPanePlaceholder() {
  return (
    <div
      style={{
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        height: '100%',
        'font-family': 'var(--font-mono, monospace)',
        'font-size': '12px',
        color: 'var(--color-text-secondary, #888)',
        'background-color': 'var(--color-terminal-bg, #0d0d0d)',
        'user-select': 'none',
      }}
    >
      Terminal — connecting in Wave 4
    </div>
  );
}
