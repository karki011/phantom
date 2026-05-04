// Author: Subash Karki

import { Show, For, createMemo, createSignal, type Component } from 'solid-js'
import { X, Bot, History } from 'lucide-solid'
import {
  listSessionIds,
  getSessionStore,
  activeSessionId,
  setActiveSessionId,
} from '@/core/composer/store'
import {
  composerDrawerOpen,
  setComposerDrawerOpen,
} from '@/core/composer/signals'
import { composerListSessions, type ComposerSessionSummary } from '@/core/bindings/composer'
import { composerPaneKind } from '@/core/composer/preferences'
import { focusOrCreateTab, addTabWithData } from '@/core/panes/signals'
import { activeWorktreeId } from '@/core/signals/app'
import { activeWorktree } from '@/core/signals/worktrees'
import * as css from './ComposerDrawer.css'

const ComposerDrawer: Component = () => {
  const sessionIds = createMemo(() => listSessionIds())
  const [pastSessions, setPastSessions] = createSignal<ComposerSessionSummary[]>([])

  // Fetch past sessions from DB whenever the drawer opens
  const refreshPastSessions = async () => {
    const list = await composerListSessions()
    // Filter out sessions that are already live in-memory
    const liveIds = new Set(listSessionIds())
    setPastSessions(list.filter((s) => !liveIds.has(s.session_id)))
  }

  // Refresh past sessions each time drawer opens
  const prevOpen = { value: false }
  createMemo(() => {
    const isOpen = composerDrawerOpen()
    if (isOpen && !prevOpen.value) {
      void refreshPastSessions()
    }
    prevOpen.value = isOpen
    return isOpen
  })

  const closeDrawer = () => setComposerDrawerOpen(false)

  /**
   * Ensure a Composer pane/tab exists before switching sessions.
   * If one is already open, focus it; otherwise create a new one.
   */
  const ensureComposerPane = () => {
    const kind = composerPaneKind()
    focusOrCreateTab(kind, 'Composer', {
      cwd: activeWorktree()?.worktree_path ?? '',
      worktreeId: activeWorktreeId() ?? '',
      workspaceId: activeWorktreeId() ?? '',
    })
  }

  const selectSession = (id: string) => {
    ensureComposerPane()
    setActiveSessionId(id)
    closeDrawer()
  }

  /**
   * Select a past DB session — opens it in a Composer tab with the
   * session's cwd and sessionId so the pane rehydrates history.
   */
  const selectPastSession = (s: ComposerSessionSummary) => {
    addTabWithData(composerPaneKind(), `Composer · ${s.name || 'session'}`, {
      cwd: s.cwd,
      sessionId: s.session_id,
      worktreeId: activeWorktreeId() ?? '',
      workspaceId: activeWorktreeId() ?? '',
    })
    closeDrawer()
  }

  const getStatusClass = (id: string): string => {
    const tuple = getSessionStore(id)
    if (!tuple) return css.statusIdle
    const [state] = tuple
    if (state.permission !== null) return css.statusPermission
    if (state.streaming !== null) return css.statusStreaming
    return css.statusIdle
  }

  const getSessionLabel = (id: string): string => {
    const tuple = getSessionStore(id)
    if (!tuple) return id
    const [state] = tuple
    return state.label || id
  }

  const getSessionWorktree = (id: string): string => {
    const tuple = getSessionStore(id)
    if (!tuple) return ''
    const [state] = tuple
    return state.worktreeId ?? ''
  }

  const getSessionStatus = (id: string): string => {
    const tuple = getSessionStore(id)
    if (!tuple) return 'idle'
    const [state] = tuple
    return state.status
  }

  return (
    <Show when={composerDrawerOpen()}>
      <div class={css.overlay} onClick={closeDrawer} />
      <div class={css.drawer}>
        <div class={css.header}>
          <span>Composer Sessions</span>
          <button class={css.closeButton} onClick={closeDrawer}>
            <X size={16} />
          </button>
        </div>

        <div class={css.sessionList}>
          <Show
            when={sessionIds().length > 0 || pastSessions().length > 0}
            fallback={<div class={css.emptyState}>No sessions yet</div>}
          >
            {/* Live in-memory sessions */}
            <Show when={sessionIds().length > 0}>
              <For each={sessionIds()}>
                {(id) => (
                  <div
                    class={`${css.sessionItem} ${
                      activeSessionId() === id ? css.sessionItemActive : ''
                    }`}
                    onClick={() => selectSession(id)}
                  >
                    <div class={css.sessionIcon}>
                      <Bot size={18} />
                    </div>
                    <div class={css.sessionInfo}>
                      <div class={css.sessionLabel}>{getSessionLabel(id)}</div>
                      <div class={css.sessionMeta}>
                        {getSessionWorktree(id) || getSessionStatus(id)}
                      </div>
                    </div>
                    <div class={`${css.statusDot} ${getStatusClass(id)}`} />
                  </div>
                )}
              </For>
            </Show>

            {/* Past sessions from DB */}
            <Show when={pastSessions().length > 0}>
              <div style={{ padding: '8px 12px 4px', 'font-size': '10px', 'text-transform': 'uppercase', color: 'var(--textTertiary, #666)', 'letter-spacing': '0.5px', display: 'flex', 'align-items': 'center', gap: '4px' }}>
                <History size={10} />
                Past Sessions
              </div>
              <For each={pastSessions()}>
                {(s) => (
                  <div
                    class={css.sessionItem}
                    onClick={() => selectPastSession(s)}
                  >
                    <div class={css.sessionIcon}>
                      <History size={18} />
                    </div>
                    <div class={css.sessionInfo}>
                      <div class={css.sessionLabel}>{s.name || 'Untitled'}</div>
                      <div class={css.sessionMeta}>
                        {s.turn_count} turn{s.turn_count !== 1 ? 's' : ''}
                        {s.first_prompt ? ` · ${s.first_prompt.slice(0, 40)}${s.first_prompt.length > 40 ? '…' : ''}` : ''}
                      </div>
                    </div>
                  </div>
                )}
              </For>
            </Show>
          </Show>
        </div>
      </div>
    </Show>
  )
}

export default ComposerDrawer
