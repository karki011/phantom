/**
 * @phantom-os/panes — Recursive binary-tree renderer
 * @author Subash Karki
 *
 * Renders LayoutNode trees. Split nodes use a CSS flex + drag handle.
 */

import { useCallback, useRef, type CSSProperties, type MouseEvent } from 'react';
import type { LayoutNode, Pane } from '../core/types.js';
import { PaneContainer } from './PaneContainer.js';
import { usePaneRegistry } from './PaneRegistry.js';

const handleStyle: CSSProperties = {
  flex: '0 0 4px',
  cursor: 'col-resize',
  background: 'var(--pane-border, rgba(255,255,255,0.08))',
  zIndex: 1,
};

interface SplitProps {
  direction: 'horizontal' | 'vertical';
  first: React.ReactNode;
  second: React.ReactNode;
  ratio: number;
  onRatioChange: (r: number) => void;
}

function SplitView({ direction, first, second, ratio, onRatioChange }: SplitProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const startDrag = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      const el = containerRef.current;
      if (!el) return;

      const onMove = (ev: globalThis.MouseEvent) => {
        const rect = el.getBoundingClientRect();
        const pos = direction === 'horizontal' ? ev.clientX - rect.left : ev.clientY - rect.top;
        const size = direction === 'horizontal' ? rect.width : rect.height;
        onRatioChange(Math.min(0.9, Math.max(0.1, pos / size)));
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [direction, onRatioChange],
  );

  const isH = direction === 'horizontal';
  return (
    <div
      ref={containerRef}
      style={{ display: 'flex', flexDirection: isH ? 'row' : 'column', height: '100%', width: '100%' }}
    >
      <div style={{ flex: `0 0 ${ratio * 100}%`, overflow: 'hidden' }}>{first}</div>
      <div
        style={{ ...handleStyle, cursor: isH ? 'col-resize' : 'row-resize' }}
        onMouseDown={startDrag}
      />
      <div style={{ flex: 1, overflow: 'hidden' }}>{second}</div>
    </div>
  );
}

export interface PaneLayoutProps {
  layout: LayoutNode;
  panes: Record<string, Pane>;
  onRatioChange?: (node: LayoutNode, ratio: number) => void;
}

export function PaneLayout({ layout, panes, onRatioChange }: PaneLayoutProps) {
  const registry = usePaneRegistry();

  if (layout.type === 'pane') {
    const pane = panes[layout.paneId];
    if (!pane) return null;
    const def = registry.get(pane.kind);
    return (
      <PaneContainer pane={pane}>
        {def ? def.render(pane) : <div>Unknown pane kind: {pane.kind}</div>}
      </PaneContainer>
    );
  }

  return (
    <SplitView
      direction={layout.direction}
      ratio={layout.ratio}
      onRatioChange={(r) => onRatioChange?.(layout, r)}
      first={<PaneLayout layout={layout.first} panes={panes} onRatioChange={onRatioChange} />}
      second={<PaneLayout layout={layout.second} panes={panes} onRatioChange={onRatioChange} />}
    />
  );
}
