// Author: Subash Karki

import { For, Show, Switch, Match, type Component } from 'solid-js';
import type { Message } from '@/core/composer/types';
import TextBlock from './blocks/TextBlock';
import ThinkingBlock from './blocks/ThinkingBlock';
import ErrorBlock from './blocks/ErrorBlock';
import { ToolUseChip } from './blocks/ToolUseCard';
import StrategyChip from './StrategyChip';
import EnrichedPromptChip from './EnrichedPromptChip';
import TurnMetrics from './TurnMetrics';
import * as s from './MessageBubble.css';

interface MessageBubbleProps {
  message: Message;
  prevRole?: string;
  onRetry?: () => void;
}

const roleClass: Record<string, string> = {
  user: s.userBubble,
  assistant: s.assistantBubble,
  system: s.systemBubble,
};

const MessageBubble: Component<MessageBubbleProps> = (props) => {
  const cls = () => `${s.bubble} ${roleClass[props.message.role] ?? s.assistantBubble}`;

  // Show bouncing dots ONLY when assistant is streaming with zero content blocks
  const showPendingPulse = () => {
    if (props.message.role !== 'assistant') return false;
    if (props.message.status !== 'streaming') return false;
    return props.message.content.length === 0;
  };

  return (
    <div class={cls()}>
      {/* Role labels — only show when role changes from previous message */}
      <Show when={props.message.role === 'user' && props.prevRole !== 'user'}>
        <span class={s.userLabel}>YOU</span>
      </Show>
      <Show when={props.message.role === 'assistant' && props.prevRole !== 'assistant'}>
        <span class={s.assistantLabel}>ASSISTANT</span>
      </Show>

      {/* Per-turn strategy chip — shown inline above assistant content */}
      <Show when={props.message.role === 'assistant' && props.message.strategy}>
        {(strategy) => <StrategyChip strategy={strategy()} />}
      </Show>

      {/* Streaming indicator — shown before first text arrives */}
      <Show when={showPendingPulse()}>
        <div class={s.pendingPulse} aria-live="polite">
          <span class={s.pendingDot} />
          <span class={s.pendingDot} />
          <span class={s.pendingDot} />
          <span>thinking...</span>
        </div>
      </Show>

      <For each={props.message.content}>
        {(block) => (
          <Switch fallback={<div style={{ 'font-size': '12px', opacity: 0.6 }}>[{block.type}]</div>}>
            <Match when={block.type === 'text'}>
              <TextBlock block={block} />
            </Match>
            <Match when={block.type === 'thinking'}>
              <ThinkingBlock block={block} />
            </Match>
            <Match when={block.type === 'error'}>
              <ErrorBlock block={block} onRetry={props.onRetry} />
            </Match>
            <Match when={block.type === 'tool_use' && block.toolUseId}>
              <ToolUseChip toolUseId={block.toolUseId!} />
            </Match>
            <Match when={block.type === 'tool_result'}>
              {/* tool_result blocks are rendered inline by their paired ToolUseChip */}
              <></>
            </Match>
          </Switch>
        )}
      </For>

      {/* Enriched prompt chip — shows injected context on user messages */}
      <Show when={props.message.role === 'user' && props.message.enrichedPrompt}>
        {(text) => <EnrichedPromptChip text={text()} />}
      </Show>

      {/* Per-turn metrics — shown after each completed assistant message */}
      <Show when={props.message.role === 'assistant' && props.message.status === 'complete'}>
        <TurnMetrics message={props.message} />
      </Show>
    </div>
  );
};

export default MessageBubble;
