// Author: Subash Karki

import { Show, For, createSignal, createEffect, on, onMount } from 'solid-js';
import { ChevronRight, Plus, StickyNote } from 'lucide-solid';
import { gsap } from '@/core/animation/gsap-setup';
import { projectNotes } from '@/core/signals/notes';
import { activeProject } from '@/core/signals/worktrees';
import { getPref, setPref, loadPref } from '@/core/signals/preferences';
import { NoteCard } from './NoteCard';
import { CreateNoteDialog } from './CreateNoteDialog';
import * as styles from './ProjectNotes.css';

const PREF_KEY = 'home.notesCollapsed';

export function ProjectNotes() {
  const [collapsed, setCollapsed] = createSignal(true);
  const [dialogOpen, setDialogOpen] = createSignal(false);
  let gridRef!: HTMLDivElement;
  let chevronRef!: SVGSVGElement;

  onMount(async () => {
    const saved = await loadPref(PREF_KEY);
    if (saved === 'true') {
      setCollapsed(true);
      // Set initial state without animation
      if (gridRef) gsap.set(gridRef, { height: 0, opacity: 0 });
      if (chevronRef) gsap.set(chevronRef, { rotation: 0 });
    } else {
      if (chevronRef) gsap.set(chevronRef, { rotation: 90 });
    }
  });

  function toggleCollapse(e: MouseEvent) {
    // Don't toggle if clicking the Add button
    if ((e.target as HTMLElement).closest(`.${styles.notesAddBtn}`)) return;

    const next = !collapsed();
    setCollapsed(next);
    void setPref(PREF_KEY, next ? 'true' : 'false');

    if (next) {
      // Collapse
      gsap.to(chevronRef, { rotation: 0, duration: 0.2, ease: 'power2.inOut' });
      gsap.to(gridRef, { height: 0, opacity: 0, duration: 0.25, ease: 'power2.inOut' });
    } else {
      // Expand
      gsap.to(chevronRef, { rotation: 90, duration: 0.2, ease: 'power2.inOut' });
      gsap.killTweensOf(gridRef);
      gsap.fromTo(gridRef,
        { height: 0, opacity: 0 },
        { height: 'auto', opacity: 1, duration: 0.25, ease: 'power2.inOut', clearProps: 'opacity' },
      );
      const cards = gridRef.children;
      if (cards.length > 0) {
        gsap.killTweensOf(cards);
        gsap.fromTo(cards,
          { opacity: 0, y: 8, scale: 0.95 },
          { opacity: 1, y: 0, scale: 1, stagger: 0.04, duration: 0.3, ease: 'back.out(1.2)', delay: 0.1, clearProps: 'opacity,transform' },
        );
      }
    }
  }

  // Auto-expand and animate when a new note is added
  createEffect(on(() => projectNotes().length, (len, prevLen) => {
    if (prevLen === undefined || !gridRef) return;
    if (len > (prevLen ?? 0)) {
      if (collapsed()) {
        setCollapsed(false);
        void setPref(PREF_KEY, 'false');
        gsap.to(chevronRef, { rotation: 90, duration: 0.2, ease: 'power2.inOut' });
        gsap.killTweensOf(gridRef);
        gsap.fromTo(gridRef,
          { height: 0, opacity: 0 },
          { height: 'auto', opacity: 1, duration: 0.25, ease: 'power2.inOut', clearProps: 'opacity' },
        );
        const cards = gridRef.children;
        if (cards.length > 0) {
          gsap.killTweensOf(cards);
          gsap.fromTo(cards,
            { opacity: 0, y: 8, scale: 0.95 },
            { opacity: 1, y: 0, scale: 1, stagger: 0.04, duration: 0.3, ease: 'back.out(1.2)', delay: 0.1, clearProps: 'opacity,transform' },
          );
        }
      } else {
        const lastCard = gridRef.children[gridRef.children.length - 1];
        if (lastCard) {
          gsap.killTweensOf(lastCard);
          gsap.fromTo(lastCard,
            { opacity: 0, y: 8, scale: 0.95 },
            { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: 'back.out(1.2)', clearProps: 'opacity,transform' },
          );
        }
      }
    }
  }));

  function handleAdd(e: MouseEvent) {
    e.stopPropagation();
    setDialogOpen(true);
  }

  return (
    <Show when={activeProject()}>
      <div class={styles.notesSection}>
        <div class={styles.notesHeader} onClick={toggleCollapse}>
          <ChevronRight
            ref={chevronRef!}
            class={styles.notesHeaderChevron}
            size={14}
          />
          <span class={styles.notesHeaderTitle}>Notes</span>
          <span class={styles.notesCountBadge}>({projectNotes().length})</span>
          <button
            type="button"
            class={styles.notesAddBtn}
            onClick={handleAdd}
          >
            <Plus size={12} />
            Add
          </button>
        </div>

        <div ref={gridRef!} class={styles.notesGrid}>
          <Show
            when={projectNotes().length > 0}
            fallback={
              <div class={styles.notesEmpty}>
                <StickyNote size={20} style={{ 'margin-bottom': '8px', opacity: '0.5' }} />
                <div>No notes yet — click + Add to create one</div>
              </div>
            }
          >
            <For each={projectNotes()}>
              {(note) => <NoteCard note={note} />}
            </For>
          </Show>
        </div>

        <CreateNoteDialog
          open={() => dialogOpen()}
          onClose={() => setDialogOpen(false)}
        />
      </div>
    </Show>
  );
}
