// Author: Subash Karki
import { For, Show, createSignal, onMount, onCleanup } from 'solid-js';
import { AlertTriangle, Gauge, DollarSign, GitBranch, Brain } from 'lucide-solid';
import { visibleWidgets, type Widget } from '../../core/signals/widgets';
import * as styles from './WidgetBar.css';

const ICON_MAP: Record<string, any> = {
  AlertTriangle, Gauge, DollarSign, GitBranch, Brain,
};

export default function WidgetBar() {
  let containerRef: HTMLDivElement | undefined;
  const [compact, setCompact] = createSignal(false);

  onMount(() => {
    if (!containerRef) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCompact(entry.contentRect.width < 400);
      }
    });
    ro.observe(containerRef);
    onCleanup(() => ro.disconnect());
  });

  return (
    <Show when={visibleWidgets().length > 0}>
      <div ref={containerRef} class={styles.widgetBar}>
        <For each={visibleWidgets()}>
          {(widget) => {
            const Icon = ICON_MAP[widget.icon];
            return (
              <div
                class={`${styles.widget} ${styles[`widget_${widget.variant}` as keyof typeof styles] ?? ''}`}
                title={widget.detail || widget.label}
              >
                {Icon && <Icon size={11} />}
                <span class={styles.widgetLabel}>
                  {compact() ? widget.label : (widget.detail || widget.label)}
                </span>
              </div>
            );
          }}
        </For>
      </div>
    </Show>
  );
}
