// PhantomOS v2 — Individual pane wrapper with header + content
// Author: Subash Karki

import { Show, createSignal, lazy } from 'solid-js';
import { Suspense, Dynamic } from 'solid-js/web';
import { Columns2, Rows2, X, Settings2 } from 'lucide-solid';
import { Skeleton } from '@kobalte/core/skeleton';
import * as styles from '@/styles/panes.css';
import { activeTab, setActivePaneInTab, splitPane, closePane, activePaneId } from '@/core/panes/signals';
import { getPaneComponent } from './PaneRegistry';
import type { PaneLeaf } from '@/core/panes/types';

const TerminalSettings = lazy(() => import('./TerminalSettings'));

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
  const [showSettings, setShowSettings] = createSignal(false);
  const isTerminal = () => props.pane.paneType === 'terminal';

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
              <Show when={isTerminal()}>
                <button
                  class={styles.paneHeaderButton}
                  title="Terminal settings"
                  onClick={(e) => { e.stopPropagation(); setShowSettings(!showSettings()); }}
                  type="button"
                >
                  <Settings2 size={12} />
                </button>
              </Show>
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

      {/* Terminal settings popover */}
      <Show when={showSettings() && isTerminal()}>
        <Suspense>
          <TerminalSettings paneId={props.pane.id} onClose={() => setShowSettings(false)} />
        </Suspense>
      </Show>

      {/* Content */}
      <div class={styles.paneContent}>
        <Show when={PaneComponent()} fallback={<PlaceholderContent kind={props.pane.paneType} />}>
          {(Comp) => (
            <Suspense fallback={<PlaceholderContent />}>
              <Dynamic component={Comp()} paneId={props.pane.id} cwd={paneData()?.data?.cwd as string ?? ''} worktreeId={paneData()?.data?.worktreeId as string ?? ''} projectId={paneData()?.data?.projectId as string ?? ''} sessionId={paneData()?.data?.sessionId as string ?? ''} command={paneData()?.data?.command as string ?? ''} restore={!!paneData()?.data?.restore} />
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
