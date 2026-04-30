// Phantom — Chat → Composer redirect shim
// Author: Subash Karki
//
// The legacy `chat` pane was deleted in favour of Composer. Existing
// user-saved tabs may still carry `kind: 'chat'`; instead of crashing,
// they render this small placeholder that one-click migrates them to a
// Composer pane. Once enough time passes that no saved sessions reference
// `chat`, this and its PaneRegistry entry can be removed.

import { addTabWithData, closePane } from '@/core/panes/signals';

interface ChatRedirectProps {
  paneId?: string;
  cwd?: string;
  workspaceId?: string;
}

export default function ChatRedirect(props: ChatRedirectProps) {
  const handleOpenComposer = () => {
    addTabWithData('composer', 'Composer', {
      cwd: props.cwd ?? '',
      workspaceId: props.workspaceId ?? '',
    });
    if (props.paneId) closePane(props.paneId);
  };

  return (
    <div
      style={{
        display: 'flex',
        'flex-direction': 'column',
        'align-items': 'center',
        'justify-content': 'center',
        gap: '12px',
        height: '100%',
        padding: '24px',
        'text-align': 'center',
        color: 'var(--text-secondary, #888)',
        'font-family': 'var(--font-body)',
      }}
    >
      <div style={{ 'font-size': '14px' }}>
        Chat has moved to Composer.
      </div>
      <button
        type="button"
        onClick={handleOpenComposer}
        style={{
          background: 'transparent',
          border: '1px solid var(--border, #333)',
          color: 'var(--accent, #888)',
          padding: '6px 14px',
          'border-radius': '6px',
          cursor: 'pointer',
          'font-size': '13px',
        }}
      >
        Open Composer →
      </button>
    </div>
  );
}
