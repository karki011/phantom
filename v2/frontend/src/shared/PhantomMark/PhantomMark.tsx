// PhantomOS v2 — Brand mark used on boot, onboarding, and chrome.
// Author: Subash Karki

import * as styles from './phantom-mark.css';

interface PhantomMarkProps {
  size?: number;
  pulse?: boolean;
  active?: boolean;
  class?: string;
}

export function PhantomMark(props: PhantomMarkProps) {
  const size = () => props.size ?? 96;

  const className = () => {
    const parts = [styles.mark];
    if (props.pulse) parts.push(styles.markPulse);
    if (props.active) parts.push(styles.markActive);
    if (props.class) parts.push(props.class);
    return parts.join(' ');
  };

  return (
    <svg
      class={className()}
      viewBox="0 0 1024 1024"
      width={size()}
      height={size()}
      role="img"
      aria-label="PhantomOS"
    >
      <path
        class={styles.body}
        d="M 512 200
           C 350 200, 250 320, 250 480
           L 250 800
           C 250 824, 278 836, 296 820
           L 348 772
           C 364 758, 388 758, 404 772
           L 456 820
           C 472 836, 500 836, 516 820
           L 568 772
           C 584 758, 608 758, 624 772
           L 676 820
           C 692 836, 716 836, 732 820
           L 774 776
           L 774 480
           C 774 320, 674 200, 512 200
           Z"
      />
      <ellipse class={styles.eye} cx="430" cy="460" rx="34" ry="48" />
      <ellipse class={styles.eye} cx="594" cy="460" rx="34" ry="48" />
    </svg>
  );
}
