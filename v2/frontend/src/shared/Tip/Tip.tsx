// PhantomOS v2 — Reusable Kobalte tooltip wrapper
// Author: Subash Karki

import { Tooltip } from '@kobalte/core/tooltip';
import type { JSX } from 'solid-js';
import * as styles from './Tip.css';

interface TipProps {
  label: string;
  children: JSX.Element;
}

export function Tip(props: TipProps) {
  return (
    <Tooltip openDelay={0} closeDelay={0}>
      <Tooltip.Trigger as="span" class={styles.trigger}>
        {props.children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content class={styles.content}>
          <Tooltip.Arrow class={styles.arrow} />
          {props.label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip>
  );
}
