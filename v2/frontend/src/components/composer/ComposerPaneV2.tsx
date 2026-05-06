// Author: Subash Karki

import { onMount, Show, createMemo } from 'solid-js'
import {
  activeSessionId,
  setActiveSessionId,
  getOrCreateSessionStore,
  getSessionStore,
  removeSessionStore,
  listSessionIds,
} from '@/core/composer/store'
import { composerNoContext } from '@/core/composer/preferences'
import { connectSession, disconnectSession } from '@/core/composer/bridge'
import { closePane } from '@/core/panes/signals'
import { composerHistoryBySession, readSessionJSONL } from '@/core/bindings/composer'
import { convertHistoryToMessages } from '@/core/composer/history'
import ComposerSubTabs from './ComposerSubTabs'
import ComposerSession from './ComposerSession'
import ComposerSessionSidebar from './ComposerSessionSidebar'
import * as css from './ComposerPaneV2.css'

interface ComposerPaneV2Props {
  paneId: string
  worktreeId: string
  cwd: string
}

const ComposerV2 = () => (window as any).go?.['composer']?.Bindings

const generateSessionId = (): string =>
  `cv2_${Date.now()}`

const sanitizeLabel = (raw: string): string => {
  let text = raw
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.startsWith('/')) text = text.slice(1)
  return text.length > 50 ? text.slice(0, 50) + '…' : text
}

export default function ComposerPaneV2(props: ComposerPaneV2Props) {
  const openNewSession = async (resumeId?: string) => {
    const id = generateSessionId()
    const bindings = ComposerV2()

    // Initialise store entry — reads persisted preferences for initial values
    const [initialState, setInitialState] = getOrCreateSessionStore(id, props.worktreeId)

    // If resuming a past session, pre-set both sessionId and resumeId so
    // handleResumeSession can match this tab. system_init may overwrite
    // sessionId with a new UUID, but resumeId is stable.
    if (resumeId) {
      setInitialState('sessionId', resumeId)
      setInitialState('resumeId', resumeId)
    }

    // Wire up stream bridge BEFORE starting Go process to avoid race
    connectSession(id, props.worktreeId)

    // Read persisted noContext preference from Go DB signal
    const noContext = composerNoContext()

    // Start Go-side session (optionally resuming a past session)
    // Pass current model, permission mode, effort level, and noContext
    // so the CLI subprocess spawns with the correct flags.
    if (bindings?.ComposerV2Open) {
      try {
        const info = await bindings.ComposerV2Open({
          session_id: id,
          cwd: props.cwd,
          mode: initialState.mode || 'normal',
          resume_id: resumeId,
          model: initialState.model || '',
          permission_mode: initialState.permissionMode || 'ask',
          effort: initialState.effortLevel || 'high',
          no_context: noContext,
        })
        // Don't set Pokémon name as label — wait for first user message
        // to set a descriptive label (handled in ComposerSession.handleSend)
      } catch (err) {
        console.error('[ComposerPaneV2] Failed to open session', id, err)
      }
    }

    // Rehydrate past conversation so the user sees old messages immediately.
    // Try Phantom's own DB first, fall back to Claude CLI JSONL files.
    if (resumeId) {
      try {
        const history = await composerHistoryBySession(resumeId)
        const entry = getSessionStore(id)
        if (history.length > 0 && entry) {
          const { messages, toolUses } = convertHistoryToMessages(history)
          entry[1]('messages', messages)
          if (Object.keys(toolUses).length > 0) {
            entry[1]('toolUses', toolUses)
          }
          const firstUser = messages.find(m => m.role === 'user')
          if (firstUser?.content?.[0]?.text) {
            entry[1]('label', sanitizeLabel(firstUser.content[0].text))
          }
        } else if (entry) {
          // No Phantom DB history — try reading from Claude CLI JSONL
          const jsonlMessages = await readSessionJSONL(props.cwd, resumeId)
          if (jsonlMessages.length > 0) {
            const msgs = jsonlMessages.map((m, i) => ({
              id: `jsonl_${i}`,
              role: m.role as 'user' | 'assistant',
              content: [{ type: 'text' as const, text: m.content, status: 'complete' as const }],
              status: 'complete' as const,
              timestamp: new Date(m.timestamp).getTime() || Date.now(),
            }))
            entry[1]('messages', msgs)
            const firstUser = jsonlMessages.find(m => m.role === 'user')
            if (firstUser) {
              entry[1]('label', sanitizeLabel(firstUser.content))
            }
          }
        }
      } catch (err) {
        console.error('[ComposerPaneV2] Failed to rehydrate session history', resumeId, err)
      }
    }

    // Activate + scroll to bottom after a tick (DOM needs to render)
    setActiveSessionId(id)
    requestAnimationFrame(() => {
      const scrollAreas = document.querySelectorAll('[class*="scrollArea"]')
      scrollAreas.forEach(el => { el.scrollTop = el.scrollHeight })
    })
  }

  const closeSession = async (id: string) => {
    // Tear down bridge
    disconnectSession(id)

    // Close Go-side session
    const bindings = ComposerV2()
    if (bindings?.ComposerV2Close) {
      try {
        await bindings.ComposerV2Close(id)
      } catch (err) {
        console.error('[ComposerPaneV2] Failed to close session', id, err)
      }
    }

    // Clean up store
    removeSessionStore(id)

    // Clear active if it was this one
    const remaining = listSessionIds()
    if (remaining.length === 0) {
      setActiveSessionId(null)
      closePane(props.paneId)
      return
    }
    if (activeSessionId() === id) {
      setActiveSessionId(remaining[0])
    }
  }

  const handleResumeSession = (sessionId: string): boolean => {
    const openIds = listSessionIds()
    for (const id of openIds) {
      const store = getSessionStore(id)
      if (!store) continue
      const [st] = store
      if (id === sessionId || st.sessionId === sessionId || st.resumeId === sessionId) {
        setActiveSessionId(id)
        return true
      }
    }
    void openNewSession(sessionId)
    return false
  }

  // Derive the Claude UUID for the active session so the sidebar can highlight it.
  // st.sessionId starts as cv2_XXXX but is overwritten with the Claude UUID either
  // immediately (on resume open) or when the first system_init event fires.
  const activeClaudeSessionId = createMemo(() => {
    const id = activeSessionId()
    if (!id) return null
    const store = getSessionStore(id)
    if (!store) return null
    const [st] = store
    return st.resumeId ?? (st.sessionId?.startsWith('cv2_') ? null : st.sessionId) ?? null
  })

  // Don't auto-open — let the user pick from the sidebar or click "+ New chat"

  return (
    <div class={css.paneRoot}>
      <ComposerSessionSidebar
        onNewSession={() => openNewSession()}
        onResumeSession={handleResumeSession}
        onCloseSession={(claudeId) => {
          // Find and close the open tab matching this Claude UUID
          for (const id of listSessionIds()) {
            const store = getSessionStore(id)
            if (!store) continue
            const [st] = store
            if (st.sessionId === claudeId || st.resumeId === claudeId || id === claudeId) {
              void closeSession(id)
              return
            }
          }
        }}
        onActiveSessionDeleted={() => {
          const id = activeSessionId()
          if (id) void closeSession(id)
        }}
        activeSessionId={activeClaudeSessionId()}
        cwd={props.cwd}
      />
      <div class={css.mainColumn}>
        <ComposerSubTabs onNew={() => openNewSession()} onClose={closeSession} />
        <div class={css.sessionContent}>
          <Show
            when={activeSessionId()}
            fallback={
              <div style={{ padding: '16px', color: 'var(--textSecondary, #888)' }}>
                No active session. Click + to start one.
              </div>
            }
          >
            <ComposerSession sessionId={activeSessionId()!} cwd={props.cwd} />
          </Show>
        </div>
      </div>
    </div>
  )
}
