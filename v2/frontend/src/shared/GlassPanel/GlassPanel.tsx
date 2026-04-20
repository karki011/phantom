// Author: Subash Karki

import { JSX } from 'solid-js';
import * as styles from './GlassPanel.css';

interface GlassPanelProps {
  children: JSX.Element;
  class?: string;
}

export function GlassPanel(props: GlassPanelProps) {
  return (
    <div class={`${styles.glass} ${props.class ?? ''}`}>
      {props.children}
    </div>
  );
}
