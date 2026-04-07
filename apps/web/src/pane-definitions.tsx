/**
 * PhantomOS Pane Definitions
 * Maps pane kinds to their render functions.
 * @author Subash Karki
 */
import type { PaneDefinition, Pane } from '@phantom-os/panes';
import { Cockpit } from './components/cockpit/Cockpit';
// Terminal and Editor panes will be added when those packages are ready

export const paneDefinitions: Record<string, PaneDefinition> = {
  dashboard: {
    render: (_pane: Pane) => <Cockpit />,
    defaultTitle: 'Dashboard',
  },
  // Placeholder for future pane types:
  // terminal: { render: (pane) => <TerminalPane paneId={pane.id} />, defaultTitle: 'Terminal' },
  // editor: { render: (pane) => <EditorPane paneId={pane.id} {...pane.data} />, defaultTitle: 'Editor' },
};
