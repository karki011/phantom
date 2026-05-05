// Author: Subash Karki
// Port of V1 ThinkingChip component from ComposerPane.tsx

import { createSignal, Show, type Component } from 'solid-js';
import { Brain, ChevronRight, ChevronDown } from 'lucide-solid';
import type { ContentBlock } from '@/core/composer/types';
import * as s from './ThinkingBlock.css';

interface ThinkingBlockProps {
  block: ContentBlock;
}

const ThinkingBlock: Component<ThinkingBlockProps> = (props) => {
  const [open, setOpen] = createSignal(false);

  const previewText = () => {
    const text = props.block.text.trim();
    if (!text) return 'Reasoning...';
    const flat = text.replace(/\n/g, ' ');
    return flat.length > 100 ? flat.slice(0, 100) + '…' : flat;
  };

  const lines = () => props.block.text.split('\n').filter((l) => l.trim()).length;

  const toggle = () => setOpen(!open());

  return (
    <div
      class={open() ? s.expanded : s.collapsed}
      role="button"
      tabIndex={0}
      aria-expanded={open()}
      aria-label="Thinking block"
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      }}
    >
      <div class={s.header}>
        <Brain size={11} style={{ 'flex-shrink': '0' }} />
        <Show when={open()} fallback={<ChevronRight size={11} style={{ 'flex-shrink': '0' }} />}>
          <ChevronDown size={11} style={{ 'flex-shrink': '0' }} />
        </Show>
        <span class={s.label}>
          {props.block.status === 'streaming' ? 'Thinking…' : 'Thinking'}
        </span>
        <Show when={lines() > 1}>
          <span class={s.lineCount}>({lines()} lines)</span>
        </Show>
        <Show when={!open() && props.block.text}>
          <span class={s.preview}>— {previewText()}</span>
        </Show>
      </div>
      <Show when={open()}>
        <pre class={s.content}>{props.block.text}</pre>
      </Show>
    </div>
  );
};

export default ThinkingBlock;
