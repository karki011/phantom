/**
 * @phantom-os/panes — Recursive binary tree layout renderer
 * @author Subash Karki
 *
 * Renders LayoutNode trees. Leaf → PaneContainer, Split → two children + ResizeHandle.
 * Tracks the path through the tree for targeted resize operations.
 */

import { useCallback, type CSSProperties, type ReactNode } from 'react';
import type { LayoutNode, Pane } from '../core/types.js';
import { PaneContainer } from './PaneContainer.js';
import { ResizeHandle } from './ResizeHandle.js';
import { usePaneRegistry } from './WorkspaceProvider.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LayoutRendererProps {
  layout: LayoutNode;
  panes: Record<string, Pane>;
  tabId: string;
  /** Path from root to this node (array of 0=first, 1=second) */
  path?: number[];
  onResize: (path: number[], percentage: number) => void;
}

// ---------------------------------------------------------------------------
// Split wrapper
// ---------------------------------------------------------------------------

interface SplitViewProps {
  direction: 'horizontal' | 'vertical';
  splitPercentage: number;
  first: ReactNode;
  second: ReactNode;
  path: number[];
  onResize: (path: number[], percentage: number) => void;
}

function SplitView({
  direction,
  splitPercentage,
  first,
  second,
  path,
  onResize,
}: SplitViewProps) {
  const handleResize = useCallback(
    (pct: number) => onResize(path, pct),
    [onResize, path],
  );

  const isH = direction === 'horizontal';
  const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: isH ? 'row' : 'column',
    height: '100%',
    width: '100%',
  };

  return (
    <div style={containerStyle}>
      <div
        style={{
          flex: `0 0 ${splitPercentage}%`,
          overflow: 'hidden',
          minWidth: 0,
          minHeight: 0,
        }}
      >
        {first}
      </div>
      <ResizeHandle direction={direction} onResize={handleResize} />
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          minWidth: 0,
          minHeight: 0,
        }}
      >
        {second}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recursive renderer
// ---------------------------------------------------------------------------

export function LayoutRenderer({
  layout,
  panes,
  tabId,
  path = [],
  onResize,
}: LayoutRendererProps) {
  const registry = usePaneRegistry();

  if (layout.type === 'pane') {
    const pane = panes[layout.paneId];
    if (!pane) return null;
    const def = registry.get(pane.kind);

    let content: ReactNode;
    if (def?.render) {
      content = def.render(pane);
    } else if (def?.component) {
      const Component = def.component;
      content = <Component pane={pane} />;
    } else {
      content = (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'rgba(255,255,255,0.4)',
            fontSize: 13,
          }}
        >
          Unknown pane kind: {pane.kind}
        </div>
      );
    }

    return (
      <PaneContainer pane={pane} tabId={tabId}>
        {content}
      </PaneContainer>
    );
  }

  // Split node
  return (
    <SplitView
      direction={layout.direction}
      splitPercentage={layout.splitPercentage}
      path={path}
      onResize={onResize}
      first={
        <LayoutRenderer
          layout={layout.first}
          panes={panes}
          tabId={tabId}
          path={[...path, 0]}
          onResize={onResize}
        />
      }
      second={
        <LayoutRenderer
          layout={layout.second}
          panes={panes}
          tabId={tabId}
          path={[...path, 1]}
          onResize={onResize}
        />
      }
    />
  );
}
