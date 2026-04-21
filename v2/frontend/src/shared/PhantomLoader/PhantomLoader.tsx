// PhantomOS v2 — Reusable loading screen (onboarding-style glow + scanline)
// Author: Subash Karki

import * as styles from './PhantomLoader.css';

interface PhantomLoaderProps {
  message?: string;
}

export function PhantomLoader(props: PhantomLoaderProps) {
  return (
    <div class={styles.overlay}>
      <div class={styles.scanline} />
      <span class={styles.text}>{props.message ?? 'Loading…'}</span>
    </div>
  );
}
