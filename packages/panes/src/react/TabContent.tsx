/**
 * @phantom-os/panes — Active tab content renderer
 * @author Subash Karki
 *
 * Renders the active tab's LayoutNode tree using LayoutRenderer.
 */

import { useCallback } from 'react';
import type { Tab } from '../core/types.js';
import { LayoutRenderer } from './LayoutRenderer.js';
import { usePaneStore } from './WorkspaceProvider.js';

export interface TabContentProps {
  tab: Tab;
}

export function TabContent({ tab }: TabContentProps) {
  const store = usePaneStore();

  const handleResize = useCallback(
    (path: number[], percentage: number) => {
      store.resizeSplit(tab.id, path, percentage);
    },
    [store, tab.id],
  );

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <LayoutRenderer
        layout={tab.layout}
        panes={tab.panes}
        tabId={tab.id}
        onResize={handleResize}
      />
    </div>
  );
}
