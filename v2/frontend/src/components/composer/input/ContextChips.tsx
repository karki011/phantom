// Author: Subash Karki
import { Show } from 'solid-js'
import { FileCode, X } from 'lucide-solid'
import type { EditorContext } from '@/core/composer/types'
import * as css from './ComposerInput.css'

interface ContextChipsProps {
  editorContext: EditorContext | null
  onDismiss: () => void
}

const getFileName = (filePath: string): string => {
  const segments = filePath.split('/')
  return segments[segments.length - 1] ?? filePath
}

const getLineRange = (cursor: string | null, selection: string | null): string | null => {
  if (selection) return selection
  if (cursor) return cursor
  return null
}

export const ContextChips = (props: ContextChipsProps) => {
  return (
    <Show when={props.editorContext?.filePath}>
      {(filePath) => {
        const lineRange = getLineRange(
          props.editorContext?.cursor ?? null,
          props.editorContext?.selection ?? null,
        )

        return (
          <div class={css.chipsRow}>
            <span class={css.chip}>
              <FileCode size={12} />
              {getFileName(filePath())}
              <Show when={lineRange}>
                {(range) => <span>:{range()}</span>}
              </Show>
              <button
                onClick={props.onDismiss}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '0',
                  cursor: 'pointer',
                  display: 'flex',
                  'align-items': 'center',
                  color: 'inherit',
                }}
              >
                <X size={10} />
              </button>
            </span>
          </div>
        )
      }}
    </Show>
  )
}
