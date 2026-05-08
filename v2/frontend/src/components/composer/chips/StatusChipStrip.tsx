// Author: Subash Karki
import { Show, createMemo } from 'solid-js'
import type { ComposerState } from '@/core/composer/types'
import { chipBase, chipStatus } from './Chip.css'
import { SessionLifecycleChip } from './SessionLifecycleChip'
import { statusStrip } from './StatusChipStrip.css'

interface StatusChipStripProps {
  state: ComposerState
  turnCount: number
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function formatCost(usd: number): string {
  if (usd < 0.01) return '<$0.01'
  return `$${usd.toFixed(2)}`
}

export function StatusChipStrip(props: StatusChipStripProps) {
  const s = () => props.state
  const totalTokens = createMemo(() => s().totalInputTokens + s().totalOutputTokens)
  const contextPct = createMemo(() => Math.round(s().contextUsedPct || 0))

  return (
    <div class={statusStrip}>
      <Show when={s().model}>
        <span class={`${chipBase} ${chipStatus.neutral}`}>
          Model: {s().model}
        </span>
      </Show>
      <Show when={totalTokens() > 0}>
        <span class={`${chipBase} ${chipStatus.neutral}`}>
          Tokens: {formatTokens(s().totalInputTokens)} in / {formatTokens(s().totalOutputTokens)} out
        </span>
      </Show>
      <Show when={s().totalCostUsd > 0}>
        <span class={`${chipBase} ${chipStatus.neutral}`}>
          Cost: {formatCost(s().totalCostUsd)}
        </span>
      </Show>
      <Show when={contextPct() > 0}>
        <span class={`${chipBase} ${contextPct() > 80 ? chipStatus.warning : chipStatus.neutral}`}>
          Context: {contextPct()}%
        </span>
      </Show>
      <Show when={props.turnCount > 0}>
        <span class={`${chipBase} ${chipStatus.neutral}`}>
          Turn: {props.turnCount}
        </span>
      </Show>
      <Show when={s().lifecycle !== 'active'}>
        <SessionLifecycleChip lifecycle={s().lifecycle} />
      </Show>
    </div>
  )
}
