// Author: Subash Karki
// Warp-style context menu for the terminal pane.
// Portal-based, positions at mouse coords, dismisses on outside-click or Escape.

import { For, Show, onCleanup, onMount } from 'solid-js';
import { Portal } from 'solid-js/web';
import * as styles from './TerminalContextMenu.css';

export interface ContextMenuItem {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  action: () => void;
}

export interface ContextMenuSection {
  items: ContextMenuItem[];
}

interface TerminalContextMenuProps {
  x: number;
  y: number;
  sections: ContextMenuSection[];
  onClose: () => void;
}

export function TerminalContextMenu(props: TerminalContextMenuProps) {
  let menuRef!: HTMLDivElement;

  // Clamp position so menu never clips outside the viewport
  const clampedX = () => {
    const menuW = 240;
    return Math.min(props.x, window.innerWidth - menuW - 8);
  };
  const clampedY = () => {
    const menuH = props.sections.reduce(
      (h, s) => h + s.items.length * 28 + 1,
      8,
    );
    return Math.min(props.y, window.innerHeight - menuH - 8);
  };

  onMount(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        props.onClose();
      }
    };
    document.addEventListener('keydown', handleKeydown, { capture: true });
    onCleanup(() =>
      document.removeEventListener('keydown', handleKeydown, { capture: true }),
    );
  });

  const handleOverlayClick = (e: MouseEvent) => {
    if (!menuRef.contains(e.target as Node)) {
      props.onClose();
    }
  };

  const handleItemClick = (item: ContextMenuItem) => {
    if (item.disabled) return;
    props.onClose();
    // Run action after menu unmounts so any focus restoration works correctly
    queueMicrotask(() => item.action());
  };

  return (
    <Portal>
      {/* Invisible overlay catches outside clicks */}
      <div class={styles.overlay} onClick={handleOverlayClick} onContextMenu={(e) => { e.preventDefault(); props.onClose(); }} />
      <div
        ref={menuRef!}
        class={styles.menu}
        style={{ left: `${clampedX()}px`, top: `${clampedY()}px` }}
        // Prevent the overlay's click handler from firing when clicking inside
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      >
        <For each={props.sections}>
          {(section, sectionIdx) => (
            <>
              <Show when={sectionIdx() > 0}>
                <div class={styles.divider} />
              </Show>
              <div class={styles.section}>
                <For each={section.items}>
                  {(item) => (
                    <div
                      class={`${styles.item}${item.disabled ? ` ${styles.itemDisabled}` : ''}`}
                      onClick={() => handleItemClick(item)}
                      role="menuitem"
                      aria-disabled={item.disabled}
                    >
                      <span class={styles.itemLabel}>{item.label}</span>
                      <Show when={item.shortcut}>
                        <span class={styles.itemShortcut}>{item.shortcut}</span>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </>
          )}
        </For>
      </div>
    </Portal>
  );
}
