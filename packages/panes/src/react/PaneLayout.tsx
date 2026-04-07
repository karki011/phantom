/**
 * @phantom-os/panes — PaneLayout backward-compatible wrapper
 * @author Subash Karki
 *
 * Wraps the new LayoutRenderer to maintain the old PaneLayout API.
 * New code should use LayoutRenderer or Workspace directly.
 */

import { useCallback } from 'react';
import type { LayoutNode, Pane } from '../core/types.js';
import { LayoutRenderer } from './LayoutRenderer.js';
import { usePaneStore } from './WorkspaceProvider.js';

export interface PaneLayoutProps {
  layout: LayoutNode;
  panes: Record<string, Pane>;
  /** @deprecated Use resizeSplit from the store instead */
  onRatioChange?: (node: LayoutNode, ratio: number) => void;
}

/**
 * @deprecated Use Workspace or LayoutRenderer directly.
 * This wrapper maintains the old API surface.
 */
export function PaneLayout({ layout, panes, onRatioChange }: PaneLayoutProps) {
  const store = usePaneStore();
  const tab = store.getActiveTab();
  const tabId = tab?.id ?? '';

  const handleResize = useCallback(
    (path: number[], percentage: number) => {
      if (tabId) {
        store.resizeSplit(tabId, path, percentage);
      }
      // Also call legacy handler if provided
      // (the old API passed the node + ratio, new API uses path + percentage)
      if (onRatioChange) {
        // Walk the tree to find the node at this path
        let node: LayoutNode = layout;
        for (const idx of path) {
          if (node.type === 'split') {
            node = idx === 0 ? node.first : node.second;
          }
        }
        onRatioChange(node, percentage / 100);
      }
    },
    [store, tabId, layout, onRatioChange],
  );

  return (
    <LayoutRenderer
      layout={layout}
      panes={panes}
      tabId={tabId}
      onResize={handleResize}
    />
  );
}
