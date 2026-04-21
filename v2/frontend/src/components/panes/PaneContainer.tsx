// PhantomOS v2 — Individual pane wrapper with header + content
// Author: Subash Karki

import { Show, Suspense, Dynamic } from 'solid-js/web';
import * as styles from '@/styles/panes.css';
import { activeTab, setActivePaneInTab, splitPane, closePane, activePaneId } from '@/core/panes/signals';
import { getPaneComponent } from './PaneRegistry';
import type { PaneLeaf } from '@/core/panes/types';

interface PaneContainerProps {
  pane: PaneLeaf;
}

const PANE_TYPE_LABELS: Record<string, string> = {
  terminal: 'Terminal',
  editor: 'Editor',
  chat: 'Chat',
  diff: 'Diff',
  home: 'Home',
  journal: 'Journal',
};

export function PaneContainer(props: PaneContainerProps) {
  const paneData = () => activeTab()?.panes[props.pane.id];
  const isActive = () => activePaneId() === props.pane.id;
  const PaneComponent = () => getPaneComponent(props.pane.paneType);

  const handleClick = () => {
    setActivePaneInTab(props.pane.id);
  };

  const handleSplitH = (e: MouseEvent) => {
    e.stopPropagation();
    splitPane(props.pane.id, 'horizontal');
  };

  const handleSplitV = (e: MouseEvent) => {
    e.stopPropagation();
    splitPane(props.pane.id, 'vertical');
  };

  const handleClose = (e: MouseEvent) => {
    e.stopPropagation();
    closePane(props.pane.id);
  };

  return (
    <div
      class={`${styles.paneContainer} ${isActive() ? styles.paneContainerActive : ''}`}
      onClick={handleClick}
    >
      {/* Mini header */}
      <div class={styles.paneHeader}>
        <span class={styles.paneHeaderTitle}>
          {paneData()?.title ?? PANE_TYPE_LABELS[props.pane.paneType] ?? props.pane.paneType}
        </span>
        <div class={styles.paneHeaderActions}>
          <button
            class={styles.paneHeaderButton}
            title="Split horizontally"
            onClick={handleSplitH}
            type="button"
          >
            &#x2015;
          </button>
          <button
            class={styles.paneHeaderButton}
            title="Split vertically"
            onClick={handleSplitV}
            type="button"
          >
            &#x2502;
          </button>
          <button
            class={`${styles.paneHeaderButton} danger`}
            title="Close pane"
            onClick={handleClose}
            type="button"
          >
            &#x2715;
          </button>
        </div>
      </div>

      {/* Content */}
      <div class={styles.paneContent}>
        <Show when={PaneComponent()} fallback={<PlaceholderContent kind={props.pane.paneType} />}>
          {(Comp) => (
            <Suspense fallback={<PlaceholderContent kind={props.pane.paneType} />}>
              <Dynamic component={Comp()} />
            </Suspense>
          )}
        </Show>
      </div>
    </div>
  );
}

function PlaceholderContent(props: { kind: string }) {
  return (
    <div
      style={{
        display: 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        height: '100%',
        'font-family': 'monospace',
        'font-size': '11px',
        color: '#666',
      }}
    >
      {props.kind} — Wave 4
    </div>
  );
}
