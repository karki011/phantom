// Author: Subash Karki

import { onMount, onCleanup } from 'solid-js';
import { gsap } from 'gsap';

/**
 * Creates a GSAP context scoped to a SolidJS component lifecycle.
 * All tweens/timelines created inside the callback are auto-cleaned on unmount.
 */
export function createGsap(
  ref: () => HTMLElement | undefined,
  setup: (ctx: gsap.Context, el: HTMLElement) => void,
) {
  let ctx: gsap.Context | undefined;

  onMount(() => {
    const el = ref();
    if (!el) return;
    ctx = gsap.context(() => setup(ctx!, el), el);
  });

  onCleanup(() => {
    ctx?.revert();
  });
}
