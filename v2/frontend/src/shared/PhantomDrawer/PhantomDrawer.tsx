// Phantom — Right-side drawer component (Kobalte Dialog — modal / non-modal, see
// https://kobalte.dev/docs/core/components/dialog/#api-reference )
// Author: Subash Karki

import type { Accessor, JSX } from 'solid-js';
import { Show, createMemo } from 'solid-js';
import { X } from 'lucide-solid';
import { Dialog } from '@kobalte/core/dialog';
import * as styles from './PhantomDrawer.css';

interface PhantomDrawerProps {
  open: Accessor<boolean>;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: JSX.Element;
  /** When false, the page behind stays interactive (Kobalte `modal={false}`). Default: always modal. */
  modal?: Accessor<boolean>;
  /** Optional controls between title and close (e.g. pin). */
  headerTrailing?: JSX.Element;
}

export function PhantomDrawer(props: PhantomDrawerProps) {
  const isModal = createMemo(() => props.modal?.() ?? true);

  return (
    <Dialog
      open={props.open()}
      onOpenChange={props.onOpenChange}
      modal={isModal()}
      // Kobalte: scroll can stay locked when modal=false unless explicitly disabled.
      preventScroll={isModal() ? undefined : false}
    >
      <Dialog.Portal>
        <Show when={isModal()}>
          <Dialog.Overlay class={styles.overlay} />
        </Show>
        <Dialog.Content
          class={styles.panel}
          // Kobalte: preventDefault on outside interaction stops dismiss while non-modal (pinned).
          onPointerDownOutside={(e) => {
            if (!isModal()) e.preventDefault();
          }}
          onInteractOutside={(e) => {
            if (!isModal()) e.preventDefault();
          }}
          onFocusOutside={(e) => {
            if (!isModal()) e.preventDefault();
          }}
        >
          <div class={styles.header}>
            <Dialog.Title class={styles.title}>{props.title}</Dialog.Title>
            <Show when={props.headerTrailing}>
              <div class={styles.headerTrailingWrap}>{props.headerTrailing}</div>
            </Show>
            <Dialog.CloseButton class={styles.closeButton}>
              <X size={16} />
            </Dialog.CloseButton>
          </div>
          <div class={styles.body}>
            {props.children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
