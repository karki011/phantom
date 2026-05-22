// Author: Subash Karki

import { Show, createMemo, type Component } from 'solid-js';
import type { ComposerState } from '@/core/composer/types';
import { formatTokens } from '@/utils/format';
import * as s from './ContextGauge.css';

interface ContextGaugeProps {
  state: ComposerState;
}

const ContextGauge: Component<ContextGaugeProps> = (props) => {
  const pct = createMemo(() => props.state.contextUsedPct);
  const totalIn = createMemo(() => props.state.totalInputTokens);
  const totalOut = createMemo(() => props.state.totalOutputTokens);
  const cost = createMemo(() => props.state.totalCostUsd);

  const gaugeColor = createMemo(() => {
    const p = pct();
    if (p >= 80) return 'var(--gauge-color-danger)';
    if (p >= 60) return 'var(--gauge-color-warning)';
    return 'var(--gauge-color-accent)';
  });

  const hasData = createMemo(() => totalIn() > 0 || totalOut() > 0 || pct() > 0);

  return (
    <Show when={hasData()}>
      <div class={s.gaugeContainer}>
        {/* Warning banner at >80% */}
        <Show when={pct() > 80}>
          <div
            class={`${s.warningBanner} ${pct() > 90 ? s.warningBannerCritical : ''}`}
          >
            <span>
              {pct() > 90
                ? `Context nearly full (${pct().toFixed(0)}%). Auto-compacting recommended.`
                : `Context is ${pct().toFixed(0)}% full. Consider compacting.`}
            </span>
          </div>
        </Show>

        {/* Thin progress bar */}
        <div
          class={s.gauge}
          role="progressbar"
          aria-valuenow={pct()}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Context window usage: ${pct().toFixed(0)}%`}
          title={`Session: ${formatTokens(totalIn())} in / ${formatTokens(totalOut())} out · $${cost().toFixed(4)} · ${pct().toFixed(0)}% context`}
        >
          <div
            class={s.gaugeFill}
            style={{
              width: `${pct()}%`,
              background: gaugeColor(),
            }}
          />
          <span class={s.gaugeLabel}>
            {formatTokens(totalIn())} in / {formatTokens(totalOut())} out · ${cost().toFixed(4)} · {pct().toFixed(0)}%
          </span>
        </div>
      </div>
    </Show>
  );
};

export default ContextGauge;
