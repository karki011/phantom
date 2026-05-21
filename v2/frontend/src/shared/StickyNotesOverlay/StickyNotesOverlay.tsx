// Author: Subash Karki

import { For, Show, createSignal } from 'solid-js';
import { StickyNote, Plus } from 'lucide-solid';
import { PhantomDrawer } from '../PhantomDrawer/PhantomDrawer';
import { stickyOverlayVisible, toggleStickyOverlay, projectNotes } from '@/core/signals/notes';
import { NotesDrawerCard } from './NotesDrawerCard';
import { CreateNoteDialog } from '../ProjectNotes/CreateNoteDialog';
import * as styles from './StickyNotesOverlay.css';

export function StickyNotesOverlay() {
  const [createOpen, setCreateOpen] = createSignal(false);

  return (
    <>
      <PhantomDrawer
        open={stickyOverlayVisible}
        onOpenChange={(open) => { if (!open) toggleStickyOverlay(); }}
        title="NOTES"
        modal={() => false}
        headerTrailing={
          <button
            class={styles.addNoteBtn}
            onClick={() => setCreateOpen(true)}
            title="New note"
          >
            <Plus size={14} />
          </button>
        }
      >
        <div class={styles.drawerContent}>
          <Show
            when={projectNotes().length > 0}
            fallback={
              <div class={styles.emptyState}>
                <StickyNote size={32} />
                <p class={styles.emptyText}>No notes yet</p>
                <button class={styles.emptyCreateBtn} onClick={() => setCreateOpen(true)}>
                  <Plus size={14} />
                  Create a note
                </button>
              </div>
            }
          >
            <div class={styles.notesList}>
              <For each={projectNotes()}>
                {(note) => <NotesDrawerCard note={note} />}
              </For>
            </div>
          </Show>
        </div>
      </PhantomDrawer>
      <CreateNoteDialog
        open={() => createOpen()}
        onClose={() => setCreateOpen(false)}
      />
    </>
  );
}
