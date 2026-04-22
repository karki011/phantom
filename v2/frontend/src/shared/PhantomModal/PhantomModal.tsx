// Author: Subash Karki

import type { Accessor, JSX } from 'solid-js';
import { Dialog } from '@kobalte/core/dialog';
import * as styles from './PhantomModal.css';

interface PhantomModalProps {
  open: Accessor<boolean>;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  size?: 'sm' | 'md' | 'lg';
  children: JSX.Element;
}

const sizeMap = { sm: styles.sm, md: styles.md, lg: styles.lg };

export function PhantomModal(props: PhantomModalProps) {
  const sizeClass = () => sizeMap[props.size ?? 'md'];

  return (
    <Dialog open={props.open()} onOpenChange={props.onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay class={styles.overlay} />
        <Dialog.Content class={`${styles.content} ${sizeClass()}`}>
          <div class={styles.header}>
            <Dialog.Title class={styles.title}>{props.title}</Dialog.Title>
            {props.description && (
              <Dialog.Description class={styles.description}>
                {props.description}
              </Dialog.Description>
            )}
            <div class={styles.separator} />
          </div>
          {props.children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}

export { styles as phantomModalStyles };
