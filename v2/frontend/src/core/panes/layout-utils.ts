/**
 * Phantom — Binary tree layout utilities
 * Ported from v1 @phantom-os/panes layout-utils.ts
 * Author: Subash Karki
 *
 * Pure functions for manipulating the LayoutNode binary tree.
 * All operations are immutable — they return new trees.
 */

import type { LayoutNode, PaneLeaf, SplitNode } from './types';

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

export const uid = (): string => crypto.randomUUID();

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Find a pane leaf by its id.
 * Note: v2 PaneLeaf uses `id` (not `paneId` as in v1).
 */
export function findPaneInLayout(
  node: LayoutNode,
  paneId: string,
): PaneLeaf | undefined {
  if (node.type === 'leaf') {
    return node.id === paneId ? node : undefined;
  }
  return findPaneInLayout(node.first, paneId) ?? findPaneInLayout(node.second, paneId);
}

/** Collect all pane leaf IDs in a layout tree. */
export function getLayoutPaneIds(node: LayoutNode): string[] {
  if (node.type === 'leaf') return [node.id];
  return [...getLayoutPaneIds(node.first), ...getLayoutPaneIds(node.second)];
}

export const MAX_PANES_PER_TAB = 6;

/** Count the total number of pane leaves. */
export function countPanes(node: LayoutNode): number {
  if (node.type === 'leaf') return 1;
  return countPanes(node.first) + countPanes(node.second);
}

// ---------------------------------------------------------------------------
// Replace (internal helper)
// ---------------------------------------------------------------------------

/** Replace a pane leaf in the tree by paneId. Returns new tree. */
function replacePaneInLayout(
  node: LayoutNode,
  paneId: string,
  replacement: LayoutNode,
): LayoutNode {
  if (node.type === 'leaf') {
    return node.id === paneId ? replacement : node;
  }
  return {
    ...node,
    first: replacePaneInLayout(node.first, paneId, replacement),
    second: replacePaneInLayout(node.second, paneId, replacement),
  };
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
  if (node.type === 'leaf') {
    return node.id === paneId ? null : node;
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
  if (node.type === 'leaf') return node;
  return {
    ...node,
    splitPercentage: 50,
    first: equalizeLayout(node.first),
    second: equalizeLayout(node.second),
  };
}

// ---------------------------------------------------------------------------
// Insert
// ---------------------------------------------------------------------------

/**
 * Insert a new pane leaf adjacent to a target pane, creating a split.
 * `position` = 'before' puts newLeaf first; 'after' puts it second.
 */
export function insertPaneAdjacentTo(
  root: LayoutNode,
  targetId: string,
  newLeaf: PaneLeaf,
  direction: 'horizontal' | 'vertical',
  position: 'before' | 'after' = 'after',
): LayoutNode {
  const targetLeaf = findPaneInLayout(root, targetId);
  if (!targetLeaf) return root;

  const splitNode: SplitNode = {
    type: 'split',
    direction,
    splitPercentage: 50,
    first: position === 'before' ? newLeaf : targetLeaf,
    second: position === 'after' ? newLeaf : targetLeaf,
  };

  return replacePaneInLayout(root, targetId, splitNode);
}
