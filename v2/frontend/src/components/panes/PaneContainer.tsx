// PhantomOS v2 — Individual pane wrapper with header + content
// Author: Subash Karki

import { Show } from 'solid-js';
import { Suspense, Dynamic } from 'solid-js/web';
import { Columns2, Rows2, X } from 'lucide-solid';
import { Skeleton } from '@kobalte/core/skeleton';
import * as styles from '@/styles/panes.css';
import { activeTab, setActivePaneInTab, splitPane, closePane, activePaneId } from '@/core/panes/signals';
import { getPaneComponent } from './PaneRegistry';
import type { PaneLeaf } from '@/core/panes/types';

interface PaneContainerProps {
  pane: PaneLeaf;
  isSolo?: boolean;
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
      {/* Floating overlay header — hidden when solo+home, shown on hover otherwise */}
      <Show when={!props.isSolo || props.pane.paneType !== 'home'}>
        <div class={styles.paneHeaderFloat}>
          <Show when={!props.isSolo}>
            <span class={styles.paneHeaderTitle}>
              {paneData()?.title ?? PANE_TYPE_LABELS[props.pane.paneType] ?? props.pane.paneType}
            </span>
          </Show>
          <Show when={props.pane.paneType !== 'home'}>
            <div class={styles.paneHeaderActions}>
              <button
                class={styles.paneHeaderButton}
                title="Split horizontally"
                onClick={handleSplitH}
                type="button"
              >
                <Columns2 size={12} />
              </button>
              <button
                class={styles.paneHeaderButton}
                title="Split vertically"
                onClick={handleSplitV}
                type="button"
              >
                <Rows2 size={12} />
              </button>
              <button
                class={`${styles.paneHeaderButton} danger`}
                title="Close pane"
                onClick={handleClose}
                type="button"
              >
                <X size={12} />
              </button>
            </div>
          </Show>
        </div>
      </Show>

      {/* Content */}
      <div class={styles.paneContent}>
        <Show when={PaneComponent()} fallback={<PlaceholderContent kind={props.pane.paneType} />}>
          {(Comp) => (
            <Suspense fallback={<PlaceholderContent />}>
              <Dynamic component={Comp()} paneId={props.pane.id} cwd={paneData()?.data?.cwd as string ?? ''} sessionId={paneData()?.data?.sessionId as string ?? ''} command={paneData()?.data?.command as string ?? ''} />
            </Suspense>
          )}
        </Show>
      </div>
    </div>
  );
}

function PlaceholderContent() {
  return (
    <Skeleton visible animate class={styles.skeletonPlaceholder}>
      <div class={styles.skeletonHeader} />
      <div class={styles.skeletonLine} style={{ height: '12px', width: '70%' }} />
      <div class={styles.skeletonLine} style={{ height: '12px', width: '55%' }} />
      <div class={styles.skeletonBody} />
    </Skeleton>
  );
}
