// Author: Subash Karki

import type { Accessor } from 'solid-js';
import { Show } from 'solid-js';
import { PhantomModal } from '@/shared/PhantomModal/PhantomModal';
import * as styles from './ImageLightbox.css';

interface ImageLightboxProps {
  open: Accessor<boolean>;
  onOpenChange: (open: boolean) => void;
  src: Accessor<string>;
  alt: Accessor<string>;
}

/**
 * Full-screen image viewer for chat attachments.
 *
 * Behavior:
 * - Wraps PhantomModal (which routes ESC + outside click → onOpenChange(false)).
 * - Click on the image itself does NOT close (event stops propagation).
 * - Image is constrained to viewport via max-w / max-h in CSS.
 */
export function ImageLightbox(props: ImageLightboxProps) {
  const altText = () => props.alt() || 'Image';

  return (
    <PhantomModal
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={altText()}
      size="2xl"
    >
      <Show when={props.src()}>
        <div class={styles.viewer}>
          <figure class={styles.figure}>
            <img
              class={styles.image}
              src={props.src()}
              alt={altText()}
              onClick={(e) => e.stopPropagation()}
            />
            <Show when={props.alt()}>
              <figcaption class={styles.caption}>{props.alt()}</figcaption>
            </Show>
          </figure>
        </div>
      </Show>
    </PhantomModal>
  );
}
