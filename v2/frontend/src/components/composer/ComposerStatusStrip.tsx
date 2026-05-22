// Author: Subash Karki

import { type Component, Show } from 'solid-js'
import type { ComposerState } from '@/core/composer/types'
import { formatTokens, formatCostUsd } from '@/utils/format'
import * as css from './ComposerStatusStrip.css'

interface ComposerStatusStripProps {
  state: ComposerState
}

const ComposerStatusStrip: Component<ComposerStatusStripProps> = (props) => {
  const isStreaming = () => props.state.streaming !== null
  const isError = () => props.state.status === 'crashed'
  const totalTokens = () => props.state.totalInputTokens + props.state.totalOutputTokens
  const contextPct = () => props.state.contextUsedPct ?? 0

  const dotClass = () => {
    if (isError()) return `${css.statusDot} ${css.statusDotError}`
    if (!isStreaming()) return `${css.statusDot} ${css.statusDotIdle}`
    return css.statusDot
  }

  const statusLabel = () => {
    if (isError()) return 'Error'
    if (isStreaming()) return 'Running'
    return 'Idle'
  }

  const contextColor = () => {
    const pct = contextPct()
    if (pct > 80) return 'var(--color-danger, #ff627e)'
    if (pct > 60) return 'var(--color-warning, #f5a623)'
    return 'var(--color-success, #50e3c2)'
  }

  return (
    <div class={css.strip}>
      <span class={dotClass()} />
      <span>
        {statusLabel()} · {props.state.model || 'No model'}
      </span>
      <Show when={props.state.label}>
        <span class={css.separator}>·</span>
        <span>{props.state.label}</span>
      </Show>
      <span class={css.grow} />
      <Show when={totalTokens() > 0}>
        <span class={css.tokenCount}>
          {formatTokens(props.state.totalInputTokens)}↑ {formatTokens(props.state.totalOutputTokens)}↓
        </span>
      </Show>
      <Show when={props.state.totalCostUsd > 0}>
        <span class={css.separator}>·</span>
        <span class={css.tokenCount}>{formatCostUsd(props.state.totalCostUsd)}</span>
      </Show>
      <Show when={contextPct() > 0}>
        <span class={css.separator}>·</span>
        <span class={css.tokenCount} style={{ color: contextColor() }}>
          {Math.round(contextPct())}% ctx
        </span>
      </Show>
    </div>
  )
}

export default ComposerStatusStrip
