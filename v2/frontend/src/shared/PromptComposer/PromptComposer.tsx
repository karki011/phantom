// PhantomOS v2 — Floating prompt composer
// Author: Subash Karki

import {
  createSignal,
  createEffect,
  onCleanup,
  Show,
  For,
  batch,
} from 'solid-js';
import { Portal } from 'solid-js/web';
import { TextField } from '@kobalte/core/text-field';
import {
  Paperclip,
  ArrowUp,
  X,
  GripVertical,
  FileText,
  MessageSquarePlus,
  Terminal,
  ChevronDown,
} from 'lucide-solid';
import { writeTerminal } from '@/core/bindings';
import { composerTargetSession, openComposer, composerColor, setComposerTarget } from '@/core/signals/composer';
import { Tip } from '@/shared/Tip/Tip';
import { activePaneId, activeTab, setActivePaneInTab, getPaneColor } from '@/core/panes/signals';
import { rightSidebarCollapsed, rightSidebarWidth } from '@/core/signals/files';
import * as styles from './PromptComposer.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AttachedFile {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'image';
  thumbnail?: string;
}

interface PromptComposerProps {
  visible: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const PromptComposer = (props: PromptComposerProps) => {
  // -- State ----------------------------------------------------------------
  const [prompt, setPrompt] = createSignal('');
  const [chips, setChips] = createSignal<AttachedFile[]>([]);
  const [dragOver, setDragOver] = createSignal(false);
  const [position, setPosition] = createSignal({
    x: typeof window !== 'undefined' ? Math.round(window.innerWidth / 2 - 300) : 0,
    y: typeof window !== 'undefined' ? Math.round(window.innerHeight - 200) : 0,
  });
  const [dragging, setDragging] = createSignal(false);

  const [selectorOpen, setSelectorOpen] = createSignal(false);

  const terminalPanes = () => {
    const tab = activeTab();
    if (!tab) return [];
    return Object.values(tab.panes)
      .filter((p) => p.kind === 'terminal')
      .map((p) => ({ id: p.id, title: p.title, color: getPaneColor(p.id) }));
  };

  const currentTargetLabel = () => {
    const target = composerTargetSession();
    const tab = activeTab();
    if (!target || !tab) return 'Terminal';
    const pane = tab.panes[target];
    return pane?.title ?? 'Terminal';
  };

  const handleSelectTerminal = (paneId: string) => {
    setComposerTarget(paneId);
    setActivePaneInTab(paneId);
    setSelectorOpen(false);
  };

  const isTerminalActive = () => {
    const paneId = activePaneId();
    if (!paneId) return false;
    const tab = activeTab();
    const pane = tab?.panes[paneId];
    return pane?.kind === 'terminal';
  };

  let dragStart = { x: 0, y: 0 };
  let posStart = { x: 0, y: 0 };
  let fileInputRef: HTMLInputElement | undefined;
  let textAreaRef: HTMLTextAreaElement | undefined;

  // -- Auto-focus textarea when composer opens ------------------------------
  createEffect(() => {
    if (props.visible) {
      requestAnimationFrame(() => textAreaRef?.focus());
    }
  });

  // -- Global Escape to close (works even when textarea isn't focused) ------
  createEffect(() => {
    if (!props.visible) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        props.onClose();
      }
    };
    document.addEventListener('keydown', onEsc, true);
    onCleanup(() => document.removeEventListener('keydown', onEsc, true));
  });

  // -- Drag handling --------------------------------------------------------

  const onPointerDown = (e: PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    dragStart = { x: e.clientX, y: e.clientY };
    posStart = { ...position() };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragging()) return;
    setPosition({
      x: posStart.x + (e.clientX - dragStart.x),
      y: posStart.y + (e.clientY - dragStart.y),
    });
  };

  const onPointerUp = () => {
    setDragging(false);
  };

  // -- File processing (shared by drop + picker) ----------------------------

  const processFiles = (files: FileList) => {
    for (const file of Array.from(files)) {
      const path = (file as any).path ?? file.name;
      const isImage = file.type.startsWith('image/');
      const id = crypto.randomUUID();

      if (isImage) {
        const reader = new FileReader();
        reader.onload = () => {
          setChips((prev) => [
            ...prev,
            {
              id,
              name: file.name,
              path,
              type: 'image',
              thumbnail: reader.result as string,
            },
          ]);
        };
        reader.readAsDataURL(file);
      } else {
        setChips((prev) => [...prev, { id, name: file.name, path, type: 'file' }]);
      }
    }
  };

  // -- Drop handler ---------------------------------------------------------

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    // Internal drag from sidebar (file tree or worktree items)
    const phantomPath = e.dataTransfer?.getData('text/phantom-path');
    if (phantomPath) {
      const name = phantomPath.split('/').pop() ?? phantomPath;
      const id = crypto.randomUUID();
      setChips((prev) => [...prev, { id, name, path: phantomPath, type: 'file' }]);
      return;
    }

    // External file drop (from Finder, etc.)
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      processFiles(files);
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  // -- File picker ----------------------------------------------------------

  const handleAttachClick = () => {
    fileInputRef?.click();
  };

  const handleFileSelect = (e: Event) => {
    const input = e.target as HTMLInputElement;
    if (input.files) {
      processFiles(input.files);
    }
    input.value = '';
  };

  // -- Chip removal ---------------------------------------------------------

  const removeChip = (id: string) => {
    setChips((prev) => prev.filter((c) => c.id !== id));
  };

  // -- Submit ---------------------------------------------------------------

  const handleSubmit = async () => {
    const text = prompt().trim();
    const sessionId = composerTargetSession();
    if (!text && chips().length === 0) return;
    if (!sessionId) return;

    const parts: string[] = [];
    for (const chip of chips()) {
      parts.push(chip.path);
    }
    if (text) parts.push(text);

    const fullPrompt = parts.join(' ');
    await writeTerminal(sessionId, fullPrompt + '\n');

    batch(() => {
      setPrompt('');
      setChips([]);
    });
  };

  // -- Keyboard shortcuts ---------------------------------------------------

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      props.onClose();
      return;
    }

    if (e.key === 'Enter' && (e.shiftKey || e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // -- Render ---------------------------------------------------------------

  return (
    <>
    <Portal>
      <Show when={props.visible}>
        <div
          class={`${styles.composer} ${dragOver() ? styles.composerDragOver : ''}`}
          style={{
            left: '0px',
            top: '0px',
            transform: `translate(${position().x}px, ${position().y}px)`,
            ...(composerColor() ? { 'border-color': composerColor()! } : {}),
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Header — drag handle + terminal selector + close */}
          <div class={styles.composerHeader}>
            <div
              class={styles.dragHandle}
              data-dragging={dragging()}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
            >
              <GripVertical size={12} />
            </div>

            {/* Terminal selector */}
            <div class={styles.terminalSelector}>
              <button
                class={styles.selectorButton}
                onClick={() => setSelectorOpen(!selectorOpen())}
              >
                <span
                  class={styles.selectorDot}
                  style={{ background: composerColor() ?? undefined }}
                />
                <Terminal size={12} />
                <span class={styles.selectorLabel}>{currentTargetLabel()}</span>
                <ChevronDown size={10} />
              </button>
              <Show when={selectorOpen()}>
                <div class={styles.selectorDropdown}>
                  <For each={terminalPanes()}>
                    {(tp) => (
                      <button
                        class={styles.selectorItem}
                        data-active={tp.id === composerTargetSession()}
                        onClick={() => handleSelectTerminal(tp.id)}
                      >
                        <span
                          class={styles.selectorDot}
                          style={{ background: tp.color }}
                        />
                        <span>{tp.title}</span>
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </div>

            <button
              class={styles.closeButton}
              onClick={() => props.onClose()}
              aria-label="Close composer"
            >
              <X size={14} />
            </button>
          </div>

          {/* Chips row */}
          <Show when={chips().length > 0}>
            <div class={styles.chipsRow}>
              <For each={chips()}>
                {(chip) => (
                  <div class={styles.chip}>
                    <Show
                      when={chip.type === 'image' && chip.thumbnail}
                      fallback={<FileText size={14} class={styles.chipIcon} />}
                    >
                      <img
                        src={chip.thumbnail}
                        alt={chip.name}
                        class={styles.chipThumb}
                      />
                    </Show>
                    <span class={styles.chipName}>{chip.name}</span>
                    <button
                      class={styles.chipRemove}
                      onClick={() => removeChip(chip.id)}
                      aria-label={`Remove ${chip.name}`}
                    >
                      <X size={12} />
                    </button>
                  </div>
                )}
              </For>
            </div>
          </Show>

          {/* Textarea — full width, 3 rows default */}
          <div class={styles.textAreaWrap}>
            <TextField class={styles.textField}>
              <TextField.TextArea
                ref={textAreaRef}
                class={styles.textArea}
                autoResize
                rows={3}
                placeholder="Message Phantom..."
                value={prompt()}
                onInput={(e: InputEvent) =>
                  setPrompt((e.target as HTMLTextAreaElement).value)
                }
                onKeyDown={handleKeyDown}
              />
            </TextField>
          </div>

          {/* Bottom bar — paperclip left, send right */}
          <div class={styles.bottomBar}>
            <button
              class={styles.attachButton}
              onClick={handleAttachClick}
              aria-label="Attach file"
            >
              <Paperclip size={18} />
            </button>

            <div class={styles.bottomSpacer} />

            <button
              class={styles.sendButton}
              onClick={handleSubmit}
              disabled={!prompt().trim() && chips().length === 0}
              aria-label="Send prompt (Cmd+Enter)"
            >
              <ArrowUp size={18} />
            </button>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            class={styles.hidden}
            onChange={handleFileSelect}
          />

          {/* Drop overlay */}
          <Show when={dragOver()}>
            <div class={styles.dropOverlay}>Drop files here</div>
          </Show>
        </div>
      </Show>
    </Portal>

    {/* FAB — outside Portal so Tip tooltip positioning works */}
    <Show when={!props.visible && isTerminalActive()}>
      <Tip label="Prompt Composer (⌘I)" placement="left">
        <button
          class={styles.fab}
          style={{
            right: `${(rightSidebarCollapsed() ? 0 : rightSidebarWidth()) + 16}px`,
          }}
          onClick={openComposer}
        >
          <MessageSquarePlus size={20} />
        </button>
      </Tip>
    </Show>
    </>
  );
};
