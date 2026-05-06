// Author: Subash Karki

import { createSignal, createEffect, onMount, For, Show } from 'solid-js'
import { History, Plus, ChevronLeft, ChevronRight, AlertTriangle, X, Terminal } from 'lucide-solid'
import {
  composerListSessions,
  composerDeleteSession,
  listClaudeProjectSessions,
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
  /** Called to close an open tab matching a session (by Claude UUID) */
  onCloseSession?: (claudeSessionId: string) => void
  /** The currently active session id (for highlighting) */
  activeSessionId?: string | null
  /** Current worktree CWD — used to filter sessions to only those for this project */
  cwd?: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function ComposerSessionSidebar(props: ComposerSessionSidebarProps) {
  const [collapsed, setCollapsed] = createSignal(true)
  const [sessions, setSessions] = createSignal<ComposerSessionSummary[]>([])
  const [resumingId, setResumingId] = createSignal<string | null>(null)

  const refreshSessions = async () => {
    const cwd = props.cwd

    // Fetch both sources in parallel.
    const [phantomList, jsonlList] = await Promise.all([
      composerListSessions(),
      cwd ? listClaudeProjectSessions(cwd) : Promise.resolve([]),
    ])

    // Build lookup of session IDs already present from Phantom/CLI source.
    const knownIds = new Set(phantomList.map((s) => s.session_id))

    // Convert JSONL sessions to ComposerSessionSummary shape, skipping duplicates.
    const jsonlSessions: ComposerSessionSummary[] = jsonlList
      .filter((s) => !knownIds.has(s.session_id))
      .map((s) => ({
        session_id: s.session_id,
        name: s.title || 'Untitled',
        first_pane_id: '',
        first_prompt: s.title || '',
        turn_count: 0,
        last_activity: s.last_activity,
        total_cost: 0,
        cwd: cwd || '',
        was_interrupted: false,
        source: 'cli' as const,
      }))

    // Merge and sort by last_activity descending, cap at 50.
    let merged = [...phantomList, ...jsonlSessions]
    merged.sort((a, b) => b.last_activity - a.last_activity)
    if (merged.length > 50) merged = merged.slice(0, 50)

    if (!cwd) {
      setSessions(merged)
      return
    }
    // Filter to sessions for this project's CWD.
    const filtered = merged.filter((s) => {
      if (!s.cwd) return true // unknown cwd — include it
      return s.cwd === cwd || s.cwd.startsWith(cwd + '/')
    })
    setSessions(filtered)
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
      setSessions((prev) => prev.filter((row) => row.session_id !== s.session_id))
      // Close matching open tab + kill CLI process
      props.onCloseSession?.(s.session_id)
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

        <div class={css.sectionLabel}>
          <History size={10} style={{ 'vertical-align': 'middle', 'margin-right': '4px' }} />
          Sessions
        </div>

        <div class={css.list} role="list" aria-label="Sessions">
          <Show
            when={sessions().length > 0}
            fallback={<div class={css.empty}>No sessions yet</div>}
          >
            <For each={sessions()}>
              {(s) => {
                const isActive = () => s.session_id === props.activeSessionId
                const displayName = () => {
                  const prompt = s.first_prompt?.trim()
                  if (prompt) return prompt.length > 50 ? prompt.slice(0, 50) + '…' : prompt
                  return s.name || 'Untitled'
                }
                const isLive = () => !s.was_interrupted && s.last_activity > (Date.now() / 1000) - 300
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
                    title={`${s.name ? s.name + '\n' : ''}${s.first_prompt || s.session_id}`}
                  >
                    <div class={css.rowContent}>
                      <span class={css.rowName}>
                        <Show when={isLive()}>
                          <span style={{
                            display: 'inline-block',
                            width: '6px',
                            height: '6px',
                            'border-radius': '50%',
                            background: 'var(--success)',
                            'margin-right': '4px',
                            animation: 'pulse 2s ease-in-out infinite',
                            'vertical-align': 'middle',
                          }} />
                        </Show>
                        {resumingId() === s.session_id ? 'Restoring...' : displayName()}
                      </span>
                      <Show when={s.source === 'cli'}>
                        <span
                          title="Started outside Phantom (terminal / VS Code / Claude Desktop)"
                          style={{
                            display: 'inline-flex',
                            'align-items': 'center',
                            'margin-left': '4px',
                            color: 'var(--textSecondary, #888)',
                            'flex-shrink': '0',
                          }}
                        >
                          <Terminal size={9} />
                        </span>
                      </Show>
                    </div>
                    <Show when={s.was_interrupted}>
                      <span class={css.interruptedBadge} title="Session interrupted">
                        <AlertTriangle size={8} />
                      </span>
                    </Show>
                    <div class={css.rowMeta}>
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
