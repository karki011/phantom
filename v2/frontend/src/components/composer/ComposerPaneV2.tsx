// Author: Subash Karki

import { onMount, Show } from 'solid-js'
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
import { composerHistoryBySession } from '@/core/bindings/composer'
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

export default function ComposerPaneV2(props: ComposerPaneV2Props) {
  const openNewSession = async (resumeId?: string) => {
    const id = generateSessionId()
    const bindings = ComposerV2()

    // Initialise store entry — reads persisted preferences for initial values
    const [initialState] = getOrCreateSessionStore(id, props.worktreeId)

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

    // Rehydrate past conversation so the user sees old messages immediately
    if (resumeId) {
      try {
        const history = await composerHistoryBySession(resumeId)
        console.log('[ComposerPaneV2] rehydrate', resumeId, 'turns:', history.length)
        if (history.length > 0) {
          const { messages, toolUses } = convertHistoryToMessages(history)
          const entry = getSessionStore(id)
          if (entry) {
            entry[1]('messages', messages)
            if (Object.keys(toolUses).length > 0) {
              entry[1]('toolUses', toolUses)
            }
            // Set tab label from first user message in history
            const firstUser = messages.find(m => m.role === 'user')
            if (firstUser?.content?.[0]?.text) {
              const text = firstUser.content[0].text
              entry[1]('label', text.length > 50 ? text.slice(0, 50) + '…' : text)
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

  const handleResumeSession = (sessionId: string) => {
    // Check if this session is already open in a tab — just focus it
    const openIds = listSessionIds()
    for (const id of openIds) {
      const store = getSessionStore(id)
      if (!store) continue
      const [st] = store
      // Match by session ID in messages (history has the Claude UUID)
      // or by the worktree session mapping
      if (id === sessionId || st.sessionId === sessionId) {
        setActiveSessionId(id)
        return
      }
    }
    void openNewSession(sessionId)
  }

  // Auto-open first session on mount
  onMount(() => {
    if (listSessionIds().length === 0) {
      openNewSession()
    }
  })

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
            if (st.sessionId === claudeId || id === claudeId) {
              void closeSession(id)
              return
            }
          }
        }}
        onActiveSessionDeleted={() => {
          const id = activeSessionId()
          if (id) void closeSession(id)
        }}
        activeSessionId={activeSessionId()}
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
