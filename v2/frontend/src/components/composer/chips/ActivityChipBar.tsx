// Author: Subash Karki
import { For, Show, createMemo } from 'solid-js'
import type { ChipData } from '@/core/composer/types'
import { Chip } from './Chip'
import { activityBar } from './ActivityChipBar.css'

interface ActivityChipBarProps {
  chips: ChipData[]
  messageId?: string
}

export function ActivityChipBar(props: ActivityChipBarProps) {
  const activityChips = createMemo(() =>
    props.chips.filter((c) =>
      c.category === 'activity' &&
      (!props.messageId || c.messageId === props.messageId)
    )
  )

  return (
    <Show when={activityChips().length > 0}>
      <div class={activityBar}>
        <For each={activityChips()}>
          {(chip) => <Chip chip={chip} />}
        </For>
      </div>
    </Show>
  )
}
