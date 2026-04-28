// PhantomOS v2 — Individual pane wrapper with header + content
// Author: Subash Karki

import { Show, createSignal, lazy } from 'solid-js';
import { Suspense, Dynamic } from 'solid-js/web';
import { Columns2, Rows2, X, Settings2 } from 'lucide-solid';
import { Skeleton } from '@kobalte/core/skeleton';
import * as styles from '@/styles/panes.css';
import { activeTab, setActivePaneInTab, splitPane, closePane, activePaneId, getPaneColor } from '@/core/panes/signals';
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
  const paneId = () => props.pane?.id ?? '';
  const paneType = () => props.pane?.paneType ?? 'terminal';
  const paneData = () => activeTab()?.panes[paneId()];
  const isActive = () => activePaneId() === paneId();
  const PaneComponent = () => getPaneComponent(paneType());
  const [showSettings, setShowSettings] = createSignal(false);
  const isTerminal = () => paneType() === 'terminal';

  const handleClick = () => {
    if (paneId()) setActivePaneInTab(paneId());
  };

  const handleSplitH = (e: MouseEvent) => {
    e.stopPropagation();
    if (paneId()) splitPane(paneId(), 'horizontal');
  };

  const handleSplitV = (e: MouseEvent) => {
    e.stopPropagation();
    if (paneId()) splitPane(paneId(), 'vertical');
  };

  const handleClose = (e: MouseEvent) => {
    e.stopPropagation();
    if (paneId()) closePane(paneId());
  };

  const paneColor = () => (!props.isSolo && paneId()) ? getPaneColor(paneId()) : undefined;

  return (
    <div
      class={`${styles.paneContainer} ${isActive() ? styles.paneContainerActive : ''}`}
      style={paneColor() ? { 'border-top': `2px solid ${paneColor()}` } : undefined}
      onClick={handleClick}
    >
      {/* Floating overlay header — hidden when solo+home, shown on hover otherwise */}
      <Show when={paneId() && (!props.isSolo || paneType() !== 'home') && paneType() !== 'editor' && paneType() !== 'diff' && paneType() !== 'chat'}>
        <div class={styles.paneHeaderFloat}>
          <Show when={!props.isSolo}>
            <span class={styles.paneHeaderTitle}>
              {paneData()?.title ?? PANE_TYPE_LABELS[paneType()] ?? paneType()}
            </span>
          </Show>
          <Show when={paneType() !== 'home'}>
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
              </Show>
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
          <TerminalSettings paneId={paneId()} onClose={() => setShowSettings(false)} />
        </Suspense>
      </Show>

      {/* Content */}
      <div class={styles.paneContent}>
        <Show when={PaneComponent()} fallback={<PlaceholderContent kind={paneType()} />}>
          {(Comp) => (
            <Suspense fallback={<PlaceholderContent />}>
              <Dynamic component={Comp()} paneId={paneId()} cwd={paneData()?.data?.cwd as string ?? ''} worktreeId={paneData()?.data?.worktreeId as string ?? ''} projectId={paneData()?.data?.projectId as string ?? ''} sessionId={paneData()?.data?.sessionId as string ?? ''} command={paneData()?.data?.command as string ?? ''} restore={!!paneData()?.data?.restore} filePath={paneData()?.data?.filePath as string ?? ''} workspaceId={paneData()?.data?.workspaceId as string ?? ''} line={paneData()?.data?.line as number | undefined} column={paneData()?.data?.column as number | undefined} originalContent={paneData()?.data?.originalContent as string ?? ''} modifiedContent={paneData()?.data?.modifiedContent as string ?? ''} originalLabel={paneData()?.data?.originalLabel as string ?? ''} modifiedLabel={paneData()?.data?.modifiedLabel as string ?? ''} language={paneData()?.data?.language as string ?? ''} readOnly={!!paneData()?.data?.readOnly} />
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
      <div class={`${styles.skeletonLine} ${styles.skeletonLineShort}`} />
      <div class={`${styles.skeletonLine} ${styles.skeletonLineShorter}`} />
      <div class={styles.skeletonBody} />
    </Skeleton>
  );
}
