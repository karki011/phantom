// Author: Subash Karki
import { createSignal, Show } from 'solid-js'
import type { ChipData } from '@/core/composer/types'
import { chipBase, chipStatus, chipExpanded, chipTiming, chipExpandedContent } from './Chip.css'

interface ChipProps {
  chip: ChipData
}

export function Chip(props: ChipProps) {
  const [expanded, setExpanded] = createSignal(false)

  const statusClass = () => chipStatus[props.chip.status] || chipStatus.neutral

  return (
    <div
      class={`${chipBase} ${statusClass()} ${expanded() ? chipExpanded : ''}`}
      onClick={() => props.chip.expandable && setExpanded(!expanded())}
      title={props.chip.label}
    >
      <span>{props.chip.label}</span>
      <Show when={props.chip.timing > 0}>
        <span class={chipTiming}>{props.chip.timing}ms</span>
      </Show>
      <Show when={expanded() && props.chip.expandedContent}>
        <div class={chipExpandedContent}>
          {props.chip.expandedContent}
        </div>
      </Show>
    </div>
  )
}
