// Author: Subash Karki

import { Show, createSignal, type Component } from 'solid-js'
import { Brain, ChevronRight, ChevronDown } from 'lucide-solid'
import type { StrategyInfo } from '@/core/composer/types'
import * as s from './StrategyChip.css'

interface StrategyChipProps {
  strategy: StrategyInfo
}

const StrategyChip: Component<StrategyChipProps> = (props) => {
  const [open, setOpen] = createSignal(false)

  const toggle = () => setOpen(!open())

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggle()
    }
  }

  const hasDetails = () =>
    props.strategy.complexity !== '' ||
    props.strategy.risk !== '' ||
    props.strategy.blastRadius > 0

  return (
    <div
      class={s.strategyBlock}
      role="button"
      tabIndex={0}
      aria-expanded={open()}
      aria-label={`Strategy: ${props.strategy.name}`}
      onClick={toggle}
      onKeyDown={handleKeyDown}
    >
      <div class={s.strategyHeader}>
        <Brain size={11} />
        <Show when={open()} fallback={<ChevronRight size={11} />}>
          <ChevronDown size={11} />
        </Show>
        <span>Strategy: </span>
        <span class={s.strategyName}>{props.strategy.name}</span>
        <Show when={props.strategy.confidence > 0}>
          <span class={s.strategyConfidence}>
            ({(props.strategy.confidence * 100).toFixed(0)}%)
          </span>
        </Show>
      </div>
      <Show when={open() && hasDetails()}>
        <div class={s.strategyDetails}>
          <Show when={props.strategy.complexity}>
            <span class={s.strategyTag}>
              Complexity: {props.strategy.complexity}
            </span>
          </Show>
          <Show when={props.strategy.risk}>
            <span class={s.strategyTag}>
              Risk: {props.strategy.risk}
            </span>
          </Show>
          <Show when={props.strategy.blastRadius > 0}>
            <span class={s.strategyTag}>
              Blast radius: {props.strategy.blastRadius} files
            </span>
          </Show>
        </div>
      </Show>
    </div>
  )
}

export default StrategyChip
