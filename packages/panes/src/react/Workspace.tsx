/**
 * @phantom-os/panes — Top-level workspace component
 * @author Subash Karki
 *
 * Renders TabBar + active Tab's content.
 * This is the main entry point for the pane system UI.
 */

import type { CSSProperties } from 'react';
import { TabBar, type PaneMenuItem } from './TabBar.js';
import { TabContent } from './TabContent.js';
import { usePaneStore } from './WorkspaceProvider.js';

export interface WorkspaceProps {
  /** Menu items for the "+" button dropdown */
  paneMenu?: PaneMenuItem[];
  /** Optional CSS custom properties for theming */
  style?: CSSProperties;
}

export function Workspace({ paneMenu, style }: WorkspaceProps) {
  const store = usePaneStore();
  const tab = store.getActiveTab();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        // Default CSS custom properties for pane theming
        '--pane-border': 'rgba(255,255,255,0.08)',
        '--pane-header-bg': 'rgba(255,255,255,0.04)',
        '--tab-bar-bg': 'rgba(0,0,0,0.3)',
        '--pane-bg': 'transparent',
        ...style,
      } as CSSProperties}
    >
      <TabBar paneMenu={paneMenu} />
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tab ? <TabContent tab={tab} /> : null}
      </div>
    </div>
  );
}
