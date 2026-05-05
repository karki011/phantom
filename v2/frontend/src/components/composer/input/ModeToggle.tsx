// Author: Subash Karki
import { MessageSquare, ListTodo } from 'lucide-solid'
import { Tip } from '@/shared/Tip/Tip'
import type { ComposerMode } from '@/core/composer/types'
import * as css from './ComposerInput.css'

interface ModeToggleProps {
  mode: ComposerMode
  onChange: (mode: ComposerMode) => void
  disabled?: boolean
}

const MODE_CONFIG: { value: ComposerMode; label: string; tip: string; Icon: typeof MessageSquare }[] = [
  { value: 'normal', label: 'Normal', tip: 'Claude asks before making changes', Icon: MessageSquare },
  { value: 'plan', label: 'Plan', tip: 'Claude describes steps without writing code', Icon: ListTodo },
]

export const ModeToggle = (props: ModeToggleProps) => {
  return (
    <>
      {MODE_CONFIG.map((m) => (
        <Tip label={m.tip} placement="top" openDelay={400}>
          <button
            class={`${css.modePill} ${props.mode === m.value ? css.modePillActive : ''}`}
            type="button"
            onClick={() => props.onChange(m.value)}
            disabled={props.disabled}
            aria-pressed={props.mode === m.value}
          >
            <m.Icon size={11} />
            {m.label}
          </button>
        </Tip>
      ))}
    </>
  )
}
