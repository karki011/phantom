// Author: Subash Karki

import { Show, createSignal, createMemo, createEffect, onMount, onCleanup, type Component } from 'solid-js'
import { getSessionStore } from '@/core/composer/store'
import {
  composerNoContext,
  setComposerModel,
  setComposerPermissionMode,
  setComposerEffortLevel,
  setComposerFontSize,
  setComposerNoContext,
} from '@/core/composer/preferences'
import type { ComposerMode, PermissionMode, EffortLevel, ToolUseState } from '@/core/composer/types'
import MessageList from './MessageList'
import ComposerStatusStrip from './ComposerStatusStrip'
import { ComposerInput } from './input/ComposerInput'
import { PermissionModal } from './PermissionModal'
import SearchOverlay from './SearchOverlay'
import ContextGauge from './ContextGauge'
import ContextInfoPanel from './ContextInfoPanel'
import ComposerAgentPanel, { type AgentInfo } from '../panes/ComposerAgentPanel'
import { toggleBadge as toggleBadgeCss, pendingHint as pendingHintCss, statusSpinner as spinnerCss } from '../panes/ComposerAgentPanel.css'
import { Bot } from 'lucide-solid'

interface ComposerSessionProps {
  sessionId: string
  cwd?: string
}

const ComposerV2 = () => (window as any).go?.['composer']?.Bindings

// Plan-mode directive prepended to user messages (matches V1 PLAN_MODE_PREFIX).
const PLAN_MODE_PREFIX = 'Plan only — do NOT write any code or make any changes. Just describe what you would do step by step.\n\n'

// Map store ToolUseStatus → AgentInfo status.
// Store uses 'running' | 'complete' | 'error'; agent panel uses
// 'spawning' | 'running' | 'completed' | 'failed'.
const toolUseStatusToAgentStatus = (
  status: 'running' | 'complete' | 'error'
): AgentInfo['status'] => {
  switch (status) {
    case 'running': return 'running'
    case 'complete': return 'completed'
    case 'error': return 'failed'
    default: return 'running'
  }
}

const ComposerSession: Component<ComposerSessionProps> = (props) => {
  const [searchOpen, setSearchOpen] = createSignal(false)
  const [noContext, setNoContext] = createSignal(composerNoContext())
  const [showContextPanel, setShowContextPanel] = createSignal(false)
  let messageListRef: HTMLDivElement | undefined

  // ── Cmd+F / Ctrl+F handler ──────────────────────────────────────────
  const handleGlobalKeydown = (e: KeyboardEvent) => {
    const isMod = e.metaKey || e.ctrlKey
    if (isMod && e.key === 'f') {
      e.preventDefault()
      e.stopPropagation()
      setSearchOpen(true)
    }
  }

  onMount(() => {
    document.addEventListener('keydown', handleGlobalKeydown, true)
  })

  onCleanup(() => {
    document.removeEventListener('keydown', handleGlobalKeydown, true)
  })

  const storeTuple = createMemo(() => getSessionStore(props.sessionId))

  const state = createMemo(() => {
    const tuple = storeTuple()
    return tuple ? tuple[0] : null
  })

  const setState = createMemo(() => {
    const tuple = storeTuple()
    return tuple ? tuple[1] : null
  })

  // ── Agent panel state ──────────────────────────────────────────────────
  const AGENT_TOOL_NAMES = new Set(['Agent', 'Task', 'agent', 'task'])
  const AUTO_HIDE_DELAY_MS = 10_000

  const [agentPanelOpen, setAgentPanelOpen] = createSignal(false)
  const [agentPanelPinned, setAgentPanelPinned] = createSignal(false)
  const [agentPanelDismissed, setAgentPanelDismissed] = createSignal(false)
  const [bgResultsPending, setBgResultsPending] = createSignal(false)
  let autoHideTimer: ReturnType<typeof setTimeout> | undefined
  let prevAgentCount = 0

  /** Derive AgentInfo[] from the store's toolUses map. */
  const agentInfos = createMemo((): AgentInfo[] => {
    const s = state()
    if (!s) return []
    const toolUses = s.toolUses
    const agents: AgentInfo[] = []
    for (const [id, tu] of Object.entries(toolUses) as [string, ToolUseState][]) {
      if (!AGENT_TOOL_NAMES.has(tu.toolName)) continue
      const input = tu.input ?? {}
      const isBg = Boolean(input.run_in_background)
      // BG agents: content_block_stop marks tool_use as 'complete' but the
      // actual agent is still running. Keep status as 'running' until
      // tool_result arrives (tu.output is non-empty).
      let agentStatus = toolUseStatusToAgentStatus(tu.status)
      if (isBg && tu.status === 'complete' && !tu.output) {
        agentStatus = 'running'
      }
      agents.push({
        toolUseId: id,
        description: (input.description as string) ?? (input.prompt as string)?.slice(0, 120) ?? tu.toolName,
        subagentType: (input.subagent_type as string) ?? (input.type as string) ?? '',
        model: (input.model as string) ?? '',
        isBackground: isBg,
        status: agentStatus,
        startedAt: tu.startedAt,
        completedAt: tu.completedAt ?? 0,
        result: tu.output ?? '',
        tokenEstimate: 0,
      })
    }
    return agents
  })

  /** Number of actively running agents. */
  const runningAgentCount = createMemo(() =>
    agentInfos().filter(a => a.status === 'spawning' || a.status === 'running').length
  )

  /** Auto-show panel when NEW agents spawn, auto-hide when all done (unless pinned). */
  createEffect(() => {
    const agents = agentInfos()
    const running = runningAgentCount()
    const count = agents.length

    // Only auto-open when agent count INCREASES (new agent spawned)
    if (count > prevAgentCount && !agentPanelOpen()) {
      setAgentPanelOpen(true)
      setAgentPanelDismissed(false)
    }
    prevAgentCount = count

    // Clear any pending auto-hide if agents are still running
    if (running > 0 && autoHideTimer !== undefined) {
      clearTimeout(autoHideTimer)
      autoHideTimer = undefined
    }

    // Mark BG results as pending when BG agents finish
    if (count > 0 && running === 0 && agents.some(a => a.isBackground && a.status === 'completed')) {
      setBgResultsPending(true)
    }

    // Schedule auto-hide when all agents are done (and panel is not pinned/dismissed)
    if (count > 0 && running === 0 && !agentPanelPinned() && !agentPanelDismissed()) {
      if (autoHideTimer !== undefined) clearTimeout(autoHideTimer)
      autoHideTimer = setTimeout(() => {
        setAgentPanelOpen(false)
        autoHideTimer = undefined
      }, AUTO_HIDE_DELAY_MS)
    }
  })

  onCleanup(() => {
    if (autoHideTimer !== undefined) clearTimeout(autoHideTimer)
  })

  const handleSend = async (text: string) => {
    setBgResultsPending(false)

    const entry = getSessionStore(props.sessionId)
    if (!entry) return
    const [s, set] = entry

    const bindings = ComposerV2()
    if (!bindings?.ComposerV2Send) return

    // Optimistic echo — render user bubble + placeholder assistant bubble
    // so "thinking..." dots show immediately (no dead gap after send)
    const placeholderId = `pending_${Date.now()}`
    set('messages', (msgs: any) => [
      ...msgs,
      {
        id: `user_${Date.now()}`,
        role: 'user' as const,
        content: [{ type: 'text' as const, text, status: 'complete' as const }],
        status: 'complete' as const,
        timestamp: Date.now(),
      },
      {
        id: placeholderId,
        role: 'assistant' as const,
        content: [],
        status: 'streaming' as const,
        timestamp: Date.now(),
      },
    ])
    set('streaming', { msgId: placeholderId, blockIdx: 0 })

    // Update tab label from first user message (or if still default)
    if (s.messages.length <= 1 || !s.label || s.label.startsWith('cv2_')) {
      const label = text.length > 50 ? text.slice(0, 50) + '…' : text
      set('label', label)
    }

    // Prepend plan-only directive when plan mode is active (matches V1).
    const prompt = s.mode === 'plan' ? PLAN_MODE_PREFIX + text : text

    try {
      await bindings.ComposerV2Send({
        session_id: props.sessionId,
        content: {
          type: 'user',
          session_id: '',
          message: {
            role: 'user',
            content: [{ type: 'text', text: prompt }],
          },
          parent_tool_use_id: null,
        },
      })
    } catch (err) {
      console.error('[ComposerSession] Send failed', err)
    }
  }

  const handleStop = async () => {
    const bindings = ComposerV2()
    if (!bindings?.ComposerV2Send) return

    try {
      await bindings.ComposerV2Send({
        session_id: props.sessionId,
        content: {
          type: 'control_request',
          request_id: crypto.randomUUID(),
          request: { subtype: 'interrupt' },
        },
      })
    } catch (err) {
      console.error('[ComposerSession] Stop failed', err)
    }
  }

  const handleRetry = () => {
    const s = state()
    if (!s) return
    // Find the last user message and resend its text
    for (let i = s.messages.length - 1; i >= 0; i--) {
      const msg = s.messages[i]
      if (msg.role === 'user') {
        const textBlock = msg.content.find((b) => b.type === 'text')
        if (textBlock?.text) {
          void handleSend(textBlock.text)
        }
        return
      }
    }
  }

  const handleModeChange = (mode: ComposerMode) => {
    const set = setState()
    if (set) set('mode', mode)
  }

  const handleNoContextChange = (value: boolean) => {
    setNoContext(value)
    void setComposerNoContext(value)
  }

  const handleModelChange = (model: string) => {
    const set = setState()
    if (set) set('model', model)
    void setComposerModel(model)
  }

  const handlePermissionModeChange = (mode: PermissionMode) => {
    const set = setState()
    if (set) set('permissionMode', mode)
    void setComposerPermissionMode(mode)
  }

  const handleEffortLevelChange = (level: EffortLevel) => {
    const set = setState()
    if (set) set('effortLevel', level)
    void setComposerEffortLevel(level)
  }

  const handleFontSizeChange = (size: number) => {
    const set = setState()
    if (set) set('fontSize', size)
    void setComposerFontSize(size)
  }

  const handlePermissionResponse = async (approved: boolean) => {
    const bindings = ComposerV2()
    if (!bindings?.ComposerV2Send) return

    const entry = getSessionStore(props.sessionId)
    if (!entry) return
    const [s] = entry
    const requestId = s.permission?.requestId ?? ''

    try {
      if (approved) {
        await bindings.ComposerV2Send({
          session_id: props.sessionId,
          content: {
            type: 'control_response',
            response: {
              subtype: 'success',
              request_id: requestId,
              response: { allowed: true, updatedInput: {} },
            },
          },
        })
      } else {
        await bindings.ComposerV2Send({
          session_id: props.sessionId,
          content: {
            type: 'control_response',
            response: {
              subtype: 'error',
              request_id: requestId,
              error: 'User denied permission',
            },
          },
        })
      }
      // Only clear permission after successful send
      const set = setState()
      if (set) set('permission', null)
    } catch (err) {
      console.error('[ComposerSession] Permission response failed', err)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        'flex-direction': 'row',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Main column */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          'flex-direction': 'column',
          flex: '1 1 0',
          'min-width': 0,
          overflow: 'hidden',
        }}
      >
        {/* Search overlay — floats at top-right, walks MessageList DOM */}
        <Show when={searchOpen()}>
          <SearchOverlay
            containerRef={messageListRef}
            onClose={() => setSearchOpen(false)}
          />
        </Show>

        <Show when={state()}>
          {(s) => (
            <>
              <ComposerStatusStrip state={s()} />

              {/* Agent panel toggle — visible when agents exist but panel is closed */}
              <Show when={agentInfos().length > 0 && !agentPanelOpen()}>
                <div style={{
                  display: 'flex',
                  'align-items': 'center',
                  'justify-content': 'flex-end',
                  padding: '0 8px',
                  'border-bottom': '1px solid var(--divider)',
                  background: 'var(--bg-secondary)',
                }}>
                  <button
                    type="button"
                    onClick={() => setAgentPanelOpen(true)}
                    title={`${agentInfos().length} agent(s) — click to show panel`}
                    aria-label="Show agent panel"
                    style={{
                      position: 'relative',
                      display: 'inline-flex',
                      'align-items': 'center',
                      gap: '4px',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-disabled)',
                      cursor: 'pointer',
                      padding: '3px 8px',
                      'border-radius': '4px',
                      'font-size': '11px',
                      'font-family': 'var(--font-mono)',
                    }}
                  >
                    <Bot size={13} />
                    <span>{agentInfos().length} agent{agentInfos().length !== 1 ? 's' : ''}</span>
                    <Show when={runningAgentCount() > 0}>
                      <span class={toggleBadgeCss}>{runningAgentCount()}</span>
                    </Show>
                  </button>
                </div>
              </Show>

              <ContextGauge state={s()} />

              <MessageList
                messages={s().messages}
                fontSize={s().fontSize}
                isStreaming={s().streaming !== null}
                currentTool={(() => {
                  const tools = Object.values(s().toolUses)
                  const running = tools.find((t) => t.status === 'running')
                  return running?.toolName
                })()}
                onScrollRef={(el) => { messageListRef = el }}
                onRetry={s().streaming === null ? handleRetry : undefined}
              />

              {/* Indicator: BG agents still working while Claude is idle */}
              <Show when={
                s().streaming === null &&
                runningAgentCount() > 0
              }>
                <div class={pendingHintCss} style={{ display: 'flex', 'align-items': 'center', 'justify-content': 'center', gap: '8px' }}>
                  <span class={spinnerCss} />
                  {runningAgentCount() === 1
                    ? '1 agent working in the background...'
                    : `${runningAgentCount()} agents working in the background...`}
                </div>
              </Show>

              {/* Hint: BG agents done but results not yet integrated */}
              <Show when={
                s().status === 'idle' &&
                s().streaming === null &&
                bgResultsPending() &&
                runningAgentCount() === 0
              }>
                <div class={pendingHintCss}>
                  Send a message to integrate agent results
                </div>
              </Show>

              <Show when={s().permission !== null}>
                <PermissionModal
                  permission={s().permission!}
                  onApprove={() => handlePermissionResponse(true)}
                  onDeny={() => handlePermissionResponse(false)}
                />
              </Show>

              <ComposerInput
                onSend={handleSend}
                onStop={handleStop}
                mode={s().mode}
                model={s().model}
                permissionMode={s().permissionMode}
                effortLevel={s().effortLevel}
                fontSize={s().fontSize}
                noContext={noContext()}
                showContextPanel={showContextPanel()}
                onModeChange={handleModeChange}
                onModelChange={handleModelChange}
                onPermissionModeChange={handlePermissionModeChange}
                onEffortLevelChange={handleEffortLevelChange}
                onFontSizeChange={handleFontSizeChange}
                onNoContextChange={handleNoContextChange}
                onToggleContextPanel={() => setShowContextPanel((v) => !v)}
                isStreaming={s().streaming !== null}
                isPermissionPending={s().permission !== null}
                editorContext={s().editorContext ?? null}
                cwd={props.cwd}
              />
            </>
          )}
        </Show>
      </div>

      {/* Context info panel — right rail */}
      <Show when={showContextPanel()}>
        <ContextInfoPanel
          cwd={props.cwd ?? ''}
          onClose={() => setShowContextPanel(false)}
        />
      </Show>

      {/* Agent panel — right rail, shown when agents are spawned */}
      <Show when={agentPanelOpen() && agentInfos().length > 0}>
        <ComposerAgentPanel
          agents={agentInfos()}
          pinned={agentPanelPinned()}
          sessionIdle={state()?.status === 'idle' && state()?.streaming === null}
          onTogglePin={() => setAgentPanelPinned((v) => !v)}
          onClose={() => {
            setAgentPanelOpen(false)
            setAgentPanelPinned(false)
            setAgentPanelDismissed(true)
            if (autoHideTimer !== undefined) {
              clearTimeout(autoHideTimer)
              autoHideTimer = undefined
            }
          }}
        />
      </Show>
    </div>
  )
}

export default ComposerSession
