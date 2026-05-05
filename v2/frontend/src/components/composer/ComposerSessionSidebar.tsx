// Author: Subash Karki

import { createSignal, createEffect, onMount, For, Show } from 'solid-js'
import { History, Plus, ChevronLeft, ChevronRight, AlertTriangle, X, Radio } from 'lucide-solid'
import {
  composerListSessions,
  composerDeleteSession,
  type ComposerSessionSummary,
} from '@/core/bindings/composer'
import { listSessionIds, getSessionStore, setActiveSessionId } from '@/core/composer/store'
import { loadPref, setPref } from '@/core/signals/preferences'
import * as css from './ComposerSessionSidebar.css'

// ---------------------------------------------------------------------------
// Relative timestamp helper — matches V1 format: "5s", "3m", "2h", "4d"
// ---------------------------------------------------------------------------
const relTime = (unixSec: number): string => {
  if (!unixSec) return ''
  const diffSec = Math.max(0, Math.floor(Date.now() / 1000) - unixSec)
  if (diffSec < 60) return `${diffSec}s`
  const m = Math.floor(diffSec / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface ComposerSessionSidebarProps {
  /** Called when user wants to start a fresh session */
  onNewSession: () => void
  /** Called when user clicks a past session to resume it */
  onResumeSession: (sessionId: string) => void
  /** Called when a past session is deleted and was the active one */
  onActiveSessionDeleted?: () => void
  /** The currently active session id (for highlighting) */
  activeSessionId?: string | null
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function ComposerSessionSidebar(props: ComposerSessionSidebarProps) {
  const [collapsed, setCollapsed] = createSignal(true)
  const [sessions, setSessions] = createSignal<ComposerSessionSummary[]>([])
  const [resumingId, setResumingId] = createSignal<string | null>(null)

  const refreshSessions = async () => {
    const list = await composerListSessions()
    setSessions(list)
  }

  const toggle = () => {
    const next = !collapsed()
    setCollapsed(next)
    void setPref('composerv2_sidebar_collapsed', next ? 'true' : 'false')
  }

  const handleDelete = async (s: ComposerSessionSummary, e: MouseEvent) => {
    e.stopPropagation()
    const ok = await composerDeleteSession(s.session_id)
    if (ok) {
      const wasActive = s.session_id === props.activeSessionId
      setSessions((prev) => prev.filter((row) => row.session_id !== s.session_id))
      if (wasActive) {
        props.onActiveSessionDeleted?.()
      }
    }
  }

  onMount(async () => {
    const saved = await loadPref('composerv2_sidebar_collapsed')
    if (saved === 'false') setCollapsed(false)
    void refreshSessions()
  })

  // Re-fetch session list whenever the active session changes.
  // This catches new sessions that were created after the initial mount,
  // as well as sessions whose turn data was just persisted to the DB.
  createEffect(() => {
    const _id = props.activeSessionId
    setResumingId(null)
    void refreshSessions()
  })

  return (
    <>
      <aside
        class={`${css.sidebar} ${collapsed() ? css.sidebarCollapsed : ''}`}
        role="complementary"
        aria-label="Past sessions"
      >
        <div class={css.header}>
          <button
            class={css.newBtn}
            type="button"
            onClick={() => props.onNewSession()}
            title="Start a new session"
            aria-label="New chat"
          >
            <Plus size={12} />
            <span>New chat</span>
          </button>
        </div>

        {/* Active V2 sessions — not yet in the V1 DB */}
        <Show when={listSessionIds().length > 0}>
          <div class={css.sectionLabel}>
            <Radio size={10} style={{ 'vertical-align': 'middle', 'margin-right': '4px' }} />
            Live
          </div>
          <div class={css.list} role="list" aria-label="Active sessions">
            <For each={listSessionIds()}>
              {(id) => {
                const store = getSessionStore(id)
                if (!store) return null
                const [st] = store
                const isActive = () => id === props.activeSessionId
                const displayName = () => st.label || id.slice(0, 8)
                return (
                  <div
                    role="listitem"
                    class={`${css.row} ${isActive() ? css.rowActive : ''}`}
                    onClick={() => setActiveSessionId(id)}
                    title={displayName()}
                  >
                    <div class={css.rowContent}>
                      <span class={css.rowName}>
                        <span class={css.liveBadge}>LIVE</span>
                        {displayName()}
                      </span>
                    </div>
                    <div class={css.rowMeta}>
                      <span class={css.rowTurns}>{st.messages.filter((m) => m.role === 'user').length}t</span>
                    </div>
                  </div>
                )
              }}
            </For>
          </div>
        </Show>

        <div class={css.sectionLabel}>
          <History size={10} style={{ 'vertical-align': 'middle', 'margin-right': '4px' }} />
          Recents
        </div>

        {/* Interrupted sessions banner */}
        <Show when={sessions().some((s) => s.was_interrupted)}>
          {(() => {
            const interrupted = () => sessions().filter((s) => s.was_interrupted)
            const first = () => interrupted()[0]
            return (
              <div
                class={css.interruptedBanner}
                onClick={() => {
                  const s = first()
                  if (s) props.onResumeSession(s.session_id)
                }}
                title="Click to resume the most recent interrupted session"
                role="button"
              >
                <AlertTriangle size={12} />
                <span>{interrupted().length} interrupted — Resume?</span>
              </div>
            )
          })()}
        </Show>

        <div class={css.list} role="list" aria-label="Session history">
          <Show
            when={sessions().length > 0}
            fallback={<div class={css.empty}>No past sessions yet</div>}
          >
            <For each={sessions()}>
              {(s) => {
                const isActive = () => s.session_id === props.activeSessionId
                const displayName = () => s.name || 'Untitled'
                const promptPreview = () =>
                  s.first_prompt?.trim()
                    ? s.first_prompt.trim().length > 60
                      ? s.first_prompt.trim().slice(0, 60) + '...'
                      : s.first_prompt.trim()
                    : ''
                return (
                  <div
                    role="listitem"
                    class={`${css.row} ${isActive() ? css.rowActive : ''}`}
                    onClick={() => {
                      setResumingId(s.session_id)
                      props.onResumeSession(s.session_id)
                    }}
                    title={`${s.name ? s.name + '\n' : ''}${s.first_prompt || s.session_id}\n${s.turn_count} turn${s.turn_count !== 1 ? 's' : ''}`}
                  >
                    <div class={css.rowContent}>
                      <span class={css.rowName}>
                        {resumingId() === s.session_id ? 'Restoring...' : displayName()}
                      </span>
                      <Show when={promptPreview() && resumingId() !== s.session_id}>
                        <span class={css.rowPrompt}>{promptPreview()}</span>
                      </Show>
                    </div>
                    <Show when={s.was_interrupted}>
                      <span class={css.interruptedBadge} title="Session interrupted">
                        <AlertTriangle size={8} />
                      </span>
                    </Show>
                    <div class={css.rowMeta}>
                      <span class={css.rowTurns}>{s.turn_count}t</span>
                      <span class={css.rowTime}>{relTime(s.last_activity)}</span>
                    </div>
                    <button
                      class={css.deleteBtn}
                      type="button"
                      onClick={(e) => handleDelete(s, e)}
                      title="Delete session"
                      aria-label={`Delete session ${s.name || s.session_id}`}
                    >
                      <X size={10} />
                    </button>
                  </div>
                )
              }}
            </For>
          </Show>
        </div>

        <div class={css.footer}>
          <button
            class={css.toggleBtn}
            type="button"
            onClick={toggle}
            title="Hide sidebar"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft size={12} />
            <span>Collapse</span>
          </button>
        </div>
      </aside>

      {/* Floating expand button when collapsed */}
      <Show when={collapsed()}>
        <button
          class={css.expandFloating}
          type="button"
          onClick={toggle}
          title="Show past sessions"
          aria-label="Show past sessions"
        >
          <ChevronRight size={12} />
        </button>
      </Show>
    </>
  )
}
