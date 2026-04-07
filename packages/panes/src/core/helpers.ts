/**
 * @phantom-os/panes — Layout tree helpers
 * @author Subash Karki
 */

import type { LayoutNode, Pane, Tab } from './types.js';

export const uid = () => crypto.randomUUID();

export function makePane(
  kind: string,
  data: Record<string, unknown> = {},
  title?: string,
): Pane {
  return { id: uid(), kind, title: title ?? kind, pinned: false, data };
}

export function makeTab(label: string): Tab {
  const pane = makePane('dashboard', {}, 'Dashboard');
  return {
    id: uid(),
    label,
    layout: { type: 'pane', paneId: pane.id },
    panes: { [pane.id]: pane },
    activePaneId: pane.id,
  };
}

/** Find and replace a node inside the layout tree (immutable). */
export function replaceNode(
  root: LayoutNode,
  match: (n: LayoutNode) => boolean,
  replacement: LayoutNode,
): LayoutNode {
  if (match(root)) return replacement;
  if (root.type === 'split') {
    return {
      ...root,
      first: replaceNode(root.first, match, replacement),
      second: replaceNode(root.second, match, replacement),
    };
  }
  return root;
}

/** Remove a pane node and promote its sibling. */
export function removeFromLayout(
  root: LayoutNode,
  paneId: string,
): LayoutNode | null {
  if (root.type === 'pane') return root.paneId === paneId ? null : root;
  const first = removeFromLayout(root.first, paneId);
  const second = removeFromLayout(root.second, paneId);
  if (!first) return second;
  if (!second) return first;
  return { ...root, first, second };
}

/** Find unpinned pane of a given kind. */
export function findUnpinned(tab: Tab, kind: string): Pane | undefined {
  return Object.values(tab.panes).find((p) => p.kind === kind && !p.pinned);
}
