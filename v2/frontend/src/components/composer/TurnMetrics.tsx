// Author: Subash Karki

import { Show, type Component } from 'solid-js';
import type { Message } from '@/core/composer/types';
import * as s from './TurnMetrics.css';

interface TurnMetricsProps {
  message: Message;
}

const formatTokenCount = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
};

const formatDuration = (ms: number): string => {
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const remainder = sec % 60;
  return `${m}m ${remainder}s`;
};

const TurnMetrics: Component<TurnMetricsProps> = (props) => {
  const usage = () => props.message.usage;
  const cost = () => props.message.costUsd;
  const duration = () => props.message.durationMs;

  const hasMetrics = () =>
    !!(usage()?.input_tokens || usage()?.output_tokens || cost() || duration());

  return (
    <Show when={hasMetrics()}>
      <div class={s.turnMetrics}>
        <Show when={usage()}>
          <span>
            {formatTokenCount(usage()!.input_tokens)} in / {formatTokenCount(usage()!.output_tokens)} out
          </span>
        </Show>
        <Show when={cost() && cost()! > 0}>
          <span class={s.metricsDot}>&middot;</span>
          <span class={s.costLabel}>${cost()!.toFixed(4)}</span>
        </Show>
        <Show when={duration() && duration()! > 0}>
          <span class={s.metricsDot}>&middot;</span>
          <span>{formatDuration(duration()!)}</span>
        </Show>
      </div>
    </Show>
  );
};

export default TurnMetrics;
