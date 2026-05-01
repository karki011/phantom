// Author: Subash Karki
import { createSignal, onMount, For, Show } from 'solid-js';
import { ChevronRight, ChevronDown, FileText, Globe, BookOpen, X } from 'lucide-solid';
import { composerGetMemoryContext, type MemoryContextItem } from '@/core/bindings/composer';
import * as styles from './ComposerMemoryPanel.css';

interface MemoryPanelProps {
  cwd: string;
  onClose: () => void;
}

export default function ComposerMemoryPanel(props: MemoryPanelProps) {
  const [items, setItems] = createSignal<MemoryContextItem[]>([]);
  const [expandedPaths, setExpandedPaths] = createSignal<Set<string>>(new Set());

  onMount(async () => {
    const ctx = await composerGetMemoryContext(props.cwd);
    setItems(ctx);
  });

  const toggleExpand = (path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const isExpanded = (path: string) => expandedPaths().has(path);

  const totalSize = () => items().reduce((sum, i) => sum + i.size, 0);

  const formatSize = (bytes: number) => {
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${bytes}B`;
  };

  const iconForLevel = (level: string) => {
    switch (level) {
      case 'global':
        return <Globe size={12} />;
      case 'rule':
        return <BookOpen size={12} />;
      default:
        return <FileText size={12} />;
    }
  };

  const basename = (path: string) => {
    const idx = path.lastIndexOf('/');
    return idx >= 0 ? path.slice(idx + 1) : path;
  };

  return (
    <div class={styles.panel}>
      <div class={styles.panelHeader}>
        <span class={styles.panelTitle}>Memory Context</span>
        <span class={styles.panelSize}>{formatSize(totalSize())} loaded</span>
        <button class={styles.panelClose} type="button" onClick={props.onClose}>
          <X size={12} />
        </button>
      </div>
      <div class={styles.panelBody}>
        <Show when={items().length === 0}>
          <div class={styles.panelEmpty}>No context files found</div>
        </Show>
        <For each={items()}>
          {(item) => (
            <div class={styles.memoryItem}>
              <div class={styles.memoryItemHeader} onClick={() => toggleExpand(item.path)}>
                {iconForLevel(item.level)}
                <Show when={isExpanded(item.path)} fallback={<ChevronRight size={11} />}>
                  <ChevronDown size={11} />
                </Show>
                <span class={styles.memoryItemName}>{basename(item.path)}</span>
                <span class={styles.memoryItemLevel}>{item.level}</span>
                <span class={styles.memoryItemSize}>{formatSize(item.size)}</span>
              </div>
              <Show when={isExpanded(item.path)}>
                <pre class={styles.memoryItemContent}>{item.content}</pre>
              </Show>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
