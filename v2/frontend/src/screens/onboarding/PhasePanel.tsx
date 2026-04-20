// Author: Subash Karki

import { JSX, Show, createSignal, onMount } from 'solid-js';
import * as styles from './styles/panel.css';
import { GlassPanel } from '../../shared/GlassPanel/GlassPanel';

interface PhasePanelProps {
  title: string;
  subtitle?: string;
  children: JSX.Element;
}

export function PhasePanel(props: PhasePanelProps) {
  const [visible, setVisible] = createSignal(false);

  onMount(() => {
    requestAnimationFrame(() => setVisible(true));
  });

  return (
    <div class={styles.wrapper} classList={{ [styles.wrapperVisible]: visible() }}>
      <GlassPanel class={styles.panel}>
        <div class={styles.header}>
          <h2 class={styles.title}>{props.title}</h2>
          <Show when={props.subtitle}>
            <p class={styles.subtitle}>{props.subtitle}</p>
          </Show>
        </div>
        <div class={styles.content}>
          {props.children}
        </div>
      </GlassPanel>
    </div>
  );
}
