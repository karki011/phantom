// Author: Subash Karki
// Model selector dropdown — Kobalte Select with pill styling and per-model icons.

import { type Component } from 'solid-js'
import { Select } from '@kobalte/core/select'
import { ChevronDown, Crown, Sparkles, Zap } from 'lucide-solid'
import * as css from './ComposerInput.css'

const MODELS = [
  { value: 'claude-opus-4-6[1m]', label: 'Opus 4.6 (1M)', Icon: Crown },
  { value: 'opusplan', label: 'Opus Plan', Icon: Crown },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6', Icon: Sparkles },
  { value: 'claude-haiku-4-5', label: 'Haiku 4.5', Icon: Zap },
] as const

type ModelEntry = (typeof MODELS)[number]

const findModel = (value: string): ModelEntry | undefined =>
  MODELS.find((m) => m.value === value)

interface ModelSelectorProps {
  model: string
  onChange: (model: string) => void
  disabled?: boolean
}

export const ModelSelector: Component<ModelSelectorProps> = (props) => {
  return (
    <Select<string>
      value={props.model}
      onChange={(val) => { if (val !== null) props.onChange(val) }}
      options={MODELS.map((m) => m.value)}
      itemComponent={(itemProps) => {
        const entry = findModel(itemProps.item.rawValue)
        return (
          <Select.Item item={itemProps.item} class={css.modelSelectItem}>
            <Select.ItemLabel class={css.modelSelectItemLabel}>
              {entry ? <entry.Icon size={10} /> : null}
              {entry?.label ?? itemProps.item.rawValue}
            </Select.ItemLabel>
          </Select.Item>
        )
      }}
    >
      <Select.Trigger
        class={css.modelSelectTrigger}
        title="Select Claude model"
        aria-label="Select Claude model"
        disabled={props.disabled}
      >
        <Select.Value<string> class={css.modelSelectValue}>
          {(state) => {
            const entry = findModel(state.selectedOption())
            return (
              <>
                {entry ? <entry.Icon size={10} /> : null}
                {entry?.label ?? state.selectedOption()}
              </>
            )
          }}
        </Select.Value>
        <Select.Icon class={css.modelSelectIcon}>
          <ChevronDown size={10} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content class={css.modelSelectContent}>
          <Select.Listbox class={css.modelSelectListbox} />
        </Select.Content>
      </Select.Portal>
    </Select>
  )
}
