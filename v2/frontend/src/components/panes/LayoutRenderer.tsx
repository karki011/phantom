// Phantom — Recursive layout renderer (leaf → PaneContainer, split → two children + handle)
// Author: Subash Karki

import { Switch, Match, createSignal, onMount, onCleanup } from 'solid-js';
import * as styles from '@/styles/panes.css';
import type { LayoutNode, PaneLeaf, SplitNode } from '@/core/panes/types';
import { PaneContainer } from './PaneContainer';
import { PaneResizeHandle } from './PaneResizeHandle';
import { activeTab } from '@/core/panes/signals';

interface LayoutRendererProps {
  layout: LayoutNode;
  /** Path in the layout tree — used to target resize operations */
  path: number[];
}

export function LayoutRenderer(props: LayoutRendererProps) {
  const isSolo = () => activeTab()?.layout.type === 'leaf';

  return (
    <Switch>
      <Match when={props.layout.type === 'leaf'}>
        <PaneContainer pane={props.layout as PaneLeaf} isSolo={isSolo()} />
      </Match>

      <Match when={props.layout.type === 'split'}>
        <SplitRenderer split={props.layout as SplitNode} path={props.path} />
      </Match>
    </Switch>
  );
}

interface SplitRendererProps {
  split: SplitNode;
  path: number[];
}

function SplitRenderer(props: SplitRendererProps) {
  let containerRef!: HTMLDivElement;
  const [containerSize, setContainerSize] = createSignal(0);

  onMount(() => {
    const measure = () => {
      if (!containerRef) return;
      setContainerSize(
        props.split.direction === 'horizontal'
          ? containerRef.offsetWidth
          : containerRef.offsetHeight,
      );
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(containerRef);
    onCleanup(() => ro.disconnect());
  });

  const firstPct = () => props.split.splitPercentage;
  const secondPct = () => 100 - props.split.splitPercentage;

  const isHorizontal = props.split.direction === 'horizontal';
  const containerClass = isHorizontal
    ? styles.layoutSplitHorizontal
    : styles.layoutSplitVertical;

  const wrapperStyle = (pct: number) => ({
    flex: `0 0 ${pct}%`,
    overflow: 'hidden',
    'min-width': 0,
    'min-height': 0,
    display: 'flex',
    'flex-direction': isHorizontal ? 'row' : 'column',
  });

  return (
    <div class={containerClass} ref={containerRef}>
      {/* First child */}
      <div style={wrapperStyle(firstPct())}>
        <LayoutRenderer layout={props.split.first} path={[...props.path, 0]} />
      </div>

      {/* Resize handle */}
      <PaneResizeHandle
        direction={props.split.direction}
        path={props.path}
        currentPercentage={props.split.splitPercentage}
        containerSize={containerSize()}
      />

      {/* Second child */}
      <div style={wrapperStyle(secondPct())}>
        <LayoutRenderer layout={props.split.second} path={[...props.path, 1]} />
      </div>
    </div>
  );
}
