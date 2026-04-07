/**
 * @phantom-os/panes — Binary tree layout utilities
 * @author Subash Karki
 *
 * Pure functions for manipulating the LayoutNode binary tree.
 * All operations are immutable — they return new trees.
 */

import type { LayoutNode, PaneLeaf, SplitNode } from './types.js';

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

export const uid = (): string => crypto.randomUUID();

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/** Find a pane leaf by paneId. Returns the node or undefined. */
export function findPaneInLayout(
  node: LayoutNode,
  paneId: string,
): PaneLeaf | undefined {
  if (node.type === 'pane') {
    return node.paneId === paneId ? node : undefined;
  }
  return findPaneInLayout(node.first, paneId) ?? findPaneInLayout(node.second, paneId);
}

/** Collect all pane IDs in a layout tree. */
export function getLayoutPaneIds(node: LayoutNode): string[] {
  if (node.type === 'pane') return [node.paneId];
  return [...getLayoutPaneIds(node.first), ...getLayoutPaneIds(node.second)];
}

/** Count the total number of pane leaves. */
export function countPanes(node: LayoutNode): number {
  if (node.type === 'pane') return 1;
  return countPanes(node.first) + countPanes(node.second);
}

// ---------------------------------------------------------------------------
// Replace
// ---------------------------------------------------------------------------

/** Replace a pane leaf in the tree by paneId. */
export function replacePaneInLayout(
  node: LayoutNode,
  paneId: string,
  replacement: LayoutNode,
): LayoutNode {
  if (node.type === 'pane') {
    return node.paneId === paneId ? replacement : node;
  }
  return {
    ...node,
    first: replacePaneInLayout(node.first, paneId, replacement),
    second: replacePaneInLayout(node.second, paneId, replacement),
  };
}

/** Generic replace: match any node via predicate. */
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

// ---------------------------------------------------------------------------
// Remove
// ---------------------------------------------------------------------------

/**
 * Remove a pane from the layout tree.
 * When a pane is removed from a split, its sibling is promoted up.
 * Returns null if the entire tree collapses (last pane removed).
 */
export function removePaneFromLayout(
  node: LayoutNode,
  paneId: string,
): LayoutNode | null {
  if (node.type === 'pane') {
    return node.paneId === paneId ? null : node;
  }
  const first = removePaneFromLayout(node.first, paneId);
  const second = removePaneFromLayout(node.second, paneId);
  if (!first) return second;
  if (!second) return first;
  return { ...node, first, second };
}

// ---------------------------------------------------------------------------
// Split percentage by path
// ---------------------------------------------------------------------------

/**
 * Update splitPercentage at a specific path in the tree.
 * Path is an array of 0 (first) or 1 (second) indices indicating
 * which child to descend into at each split.
 * An empty path means "this node".
 */
export function updateSplitAtPath(
  node: LayoutNode,
  path: number[],
  splitPercentage: number,
): LayoutNode {
  if (path.length === 0) {
    if (node.type === 'split') {
      return { ...node, splitPercentage: Math.min(90, Math.max(10, splitPercentage)) };
    }
    return node;
  }
  if (node.type !== 'split') return node;
  const [head, ...rest] = path;
  if (head === 0) {
    return { ...node, first: updateSplitAtPath(node.first, rest, splitPercentage) };
  }
  return { ...node, second: updateSplitAtPath(node.second, rest, splitPercentage) };
}

// ---------------------------------------------------------------------------
// Equalize
// ---------------------------------------------------------------------------

/** Set all split percentages in the tree to 50%. */
export function equalizeLayout(node: LayoutNode): LayoutNode {
  if (node.type === 'pane') return node;
  return {
    ...node,
    splitPercentage: 50,
    first: equalizeLayout(node.first),
    second: equalizeLayout(node.second),
  };
}

// ---------------------------------------------------------------------------
// Insert (for drag-and-drop)
// ---------------------------------------------------------------------------

/**
 * Insert a new pane adjacent to a target pane, creating a split.
 * `position` = 'before' puts the new pane first; 'after' puts it second.
 */
export function insertPaneAdjacentTo(
  root: LayoutNode,
  targetPaneId: string,
  newPaneId: string,
  direction: 'horizontal' | 'vertical',
  position: 'before' | 'after',
): LayoutNode {
  const newLeaf: PaneLeaf = { type: 'pane', paneId: newPaneId };
  const targetLeaf: PaneLeaf = { type: 'pane', paneId: targetPaneId };

  const splitNode: SplitNode = {
    type: 'split',
    direction,
    first: position === 'before' ? newLeaf : targetLeaf,
    second: position === 'after' ? newLeaf : targetLeaf,
    splitPercentage: 50,
  };

  return replacePaneInLayout(root, targetPaneId, splitNode);
}
