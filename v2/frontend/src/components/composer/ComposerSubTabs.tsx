// Author: Subash Karki

import { createSignal, For, Show } from 'solid-js'
import { X, Plus } from 'lucide-solid'
import {
  activeSessionId,
  setActiveSessionId,
  listSessionIds,
  getSessionStore,
} from '@/core/composer/store'
import * as css from './ComposerSubTabs.css'

interface ComposerSubTabsProps {
  onNew: () => void
  onClose: (sessionId: string) => void
}

export default function ComposerSubTabs(props: ComposerSubTabsProps) {
  const [editingId, setEditingId] = createSignal<string | null>(null)

  const tabLabel = (id: string): string => {
    const store = getSessionStore(id)
    if (store) {
      const [state] = store
      if (state.label) return state.label
    }
    return id.slice(0, 8)
  }

  const isStreaming = (id: string): boolean => {
    const store = getSessionStore(id)
    if (!store) return false
    const [state] = store
    return state.streaming !== null
  }

  const hasPermission = (id: string): boolean => {
    const store = getSessionStore(id)
    if (!store) return false
    const [state] = store
    return state.permission !== null
  }

  const commitRename = (id: string, value: string) => {
    const trimmed = value.trim()
    if (trimmed) {
      const store = getSessionStore(id)
      if (store) store[1]('label', trimmed)
    }
    setEditingId(null)
  }

  return (
    <div class={css.tabStrip}>
      <For each={listSessionIds()}>
        {(id) => (
          <div
            class={`${css.tab} ${activeSessionId() === id ? css.tabActive : ''}`}
            onClick={() => setActiveSessionId(id)}
            onDblClick={() => setEditingId(id)}
          >
            <Show when={isStreaming(id)}>
              <span class={css.activityDot} />
            </Show>
            <Show when={hasPermission(id)}>
              <span class={css.permissionDot} />
            </Show>
            <Show
              when={editingId() === id}
              fallback={<span>{tabLabel(id)}</span>}
            >
              <input
                class={css.tabRenameInput}
                value={tabLabel(id)}
                autofocus
                onBlur={(e) => commitRename(id, e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename(id, e.currentTarget.value)
                  if (e.key === 'Escape') setEditingId(null)
                }}
                onClick={(e) => e.stopPropagation()}
              />
            </Show>
            <span
              class={css.tabClose}
              onClick={(e) => {
                e.stopPropagation()
                props.onClose(id)
              }}
            >
              <X size={12} />
            </span>
          </div>
        )}
      </For>
      <div class={css.addButton} onClick={() => props.onNew()}>
        <Plus size={16} />
      </div>
    </div>
  )
}
