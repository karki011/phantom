// Author: Subash Karki
import { For, Show, createSignal, createMemo } from 'solid-js'
import type { ChipData } from '@/core/composer/types'
import { Chip } from './Chip'
import { chipBar, overflowPill } from './ContextChipBar.css'

interface ContextChipBarProps {
  chips: ChipData[]
  maxVisible?: number
}

const DEFAULT_MAX_VISIBLE = 5

export function ContextChipBar(props: ContextChipBarProps) {
  const [showAll, setShowAll] = createSignal(false)

  const maxVisible = () => props.maxVisible ?? DEFAULT_MAX_VISIBLE

  const contextChips = createMemo(() =>
    props.chips.filter((c) => c.category === 'context')
  )

  const visibleChips = createMemo(() =>
    showAll() ? contextChips() : contextChips().slice(0, maxVisible())
  )

  const overflowCount = createMemo(() =>
    Math.max(0, contextChips().length - maxVisible())
  )

  return (
    <Show when={contextChips().length > 0}>
      <div class={chipBar}>
        <For each={visibleChips()}>
          {(chip) => <Chip chip={chip} />}
        </For>
        <Show when={!showAll() && overflowCount() > 0}>
          <span class={overflowPill} onClick={() => setShowAll(true)}>
            +{overflowCount()} more
          </span>
        </Show>
      </div>
    </Show>
  )
}
