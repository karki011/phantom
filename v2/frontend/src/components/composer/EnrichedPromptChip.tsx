// Author: Subash Karki

import { createSignal, Show, type Component } from 'solid-js';
import { Wand2, ChevronRight, ChevronDown } from 'lucide-solid';
import * as s from './EnrichedPromptChip.css';

interface EnrichedPromptChipProps {
  text: string;
}

const EnrichedPromptChip: Component<EnrichedPromptChipProps> = (props) => {
  const [open, setOpen] = createSignal(false);

  const charCount = () => props.text.length;

  const previewText = () => {
    const flat = props.text.replace(/\n/g, ' ').trim();
    return flat.length > 80 ? flat.slice(0, 80) + '...' : flat;
  };

  const toggle = () => setOpen(!open());

  return (
    <div
      class={open() ? s.expanded : s.collapsed}
      role="button"
      tabIndex={0}
      aria-expanded={open()}
      aria-label="Enriched prompt — context injected by AI engine"
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      }}
    >
      <div class={s.header}>
        <Wand2 size={11} style={{ 'flex-shrink': '0' }} />
        <Show when={open()} fallback={<ChevronRight size={11} style={{ 'flex-shrink': '0' }} />}>
          <ChevronDown size={11} style={{ 'flex-shrink': '0' }} />
        </Show>
        <span class={s.label}>Prompt Sent</span>
        <span class={s.charCount}>({charCount().toLocaleString()} chars)</span>
        <Show when={!open()}>
          <span class={s.preview}>— {previewText()}</span>
        </Show>
      </div>
      <Show when={open()}>
        <pre class={s.content}>{props.text}</pre>
      </Show>
    </div>
  );
};

export default EnrichedPromptChip;
