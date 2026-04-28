// PhantomOS v2 — Reusable Kobalte tooltip wrapper
// Author: Subash Karki

import { Tooltip } from '@kobalte/core/tooltip';
import type { JSX } from 'solid-js';
import * as styles from './Tip.css';

interface TipProps {
  label?: string;
  content?: JSX.Element;
  children: JSX.Element;
  openDelay?: number;
  placement?: 'top' | 'bottom' | 'left' | 'right';
}

export function Tip(props: TipProps) {
  const contentClass = () => props.content ? styles.contentMultiline : styles.content;

  return (
    <Tooltip openDelay={props.openDelay ?? 0} closeDelay={0} placement={props.placement ?? 'top'}>
      <Tooltip.Trigger as="span" class={styles.trigger}>
        {props.children}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content class={contentClass()}>
          <Tooltip.Arrow class={styles.arrow} />
          {props.content ?? props.label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip>
  );
}
