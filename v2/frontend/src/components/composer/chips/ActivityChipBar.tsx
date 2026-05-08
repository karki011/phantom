// Author: Subash Karki
import { For, Show, createMemo } from 'solid-js'
import type { ChipData } from '@/core/composer/types'
import { Chip } from './Chip'
import { activityBar, activityLabel } from './ActivityChipBar.css'

interface ActivityChipBarProps {
  chips: ChipData[]
}

export function ActivityChipBar(props: ActivityChipBarProps) {
  const activityChips = createMemo(() =>
    props.chips.filter((c) => c.category === 'activity')
  )

  return (
    <Show when={activityChips().length > 0}>
      <div class={activityBar}>
        <span class={activityLabel}>Activity</span>
        <For each={activityChips()}>
          {(chip) => <Chip chip={chip} />}
        </For>
      </div>
    </Show>
  )
}
