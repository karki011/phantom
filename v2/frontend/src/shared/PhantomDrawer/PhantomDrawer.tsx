// Phantom — Right-side drawer component
// Author: Subash Karki

import type { Accessor, JSX } from 'solid-js';
import { X } from 'lucide-solid';
import { Dialog } from '@kobalte/core/dialog';
import * as styles from './PhantomDrawer.css';

interface PhantomDrawerProps {
  open: Accessor<boolean>;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: JSX.Element;
}

export function PhantomDrawer(props: PhantomDrawerProps) {
  return (
    <Dialog open={props.open()} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay class={styles.overlay} />
        <Dialog.Content class={styles.panel}>
          <div class={styles.header}>
            <Dialog.Title class={styles.title}>{props.title}</Dialog.Title>
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
