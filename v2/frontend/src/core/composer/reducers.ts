// Author: Subash Karki

import type {
  AssistantMessage,
  ChipData,
  ComposerState,
  SessionLifecycle,
  SessionStatus,
  StreamEvent,
  ContentBlock,
  Message,
  AssistantContentBlock,
  StrategyInfo,
} from './types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SetState = (fn: (state: ComposerState) => void) => void

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let msgCounter = 0
const nextMsgId = () => 'msg_' + ++msgCounter

const MAX_MESSAGES = 500
function trimMessages(messages: Message[]) {
  if (messages.length > MAX_MESSAGES) {
    messages.splice(0, messages.length - MAX_MESSAGES)
  }
}

/** Reset counter — exposed for tests only. */
export const resetMsgCounter = () => {
  msgCounter = 0
}

const findStreamingMsgIdx = (state: ComposerState): number => {
  if (!state.streaming) return -1
  return state.messages.findIndex((m) => m.id === state.streaming!.msgId)
}

function createActivityChip(
  source: string,
  label: string,
  status: ChipData['status'],
  timing?: number,
  expandedContent?: string,
  messageId?: string
): ChipData {
  return {
    id: `activity-${source}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    category: 'activity',
    label,
    status,
    source,
    timing: timing ?? 0,
    tokens: 0,
    expandable: !!expandedContent,
    expandedContent,
    messageId,
  }
}

function formatToolLabel(toolName: string): string {
  const toolLabels: Record<string, string> = {
    Read: 'Reading',
    Edit: 'Editing',
    Write: 'Writing',
    Bash: 'Running',
    Grep: 'Searching',
    Glob: 'Searching',
    LS: 'Listing',
    Task: 'Sub-agent',
    Agent: 'Sub-agent',
    WebSearch: 'Searching web',
    WebFetch: 'Fetching',
  }
  if (toolLabels[toolName]) return toolLabels[toolName]
  if (toolName.startsWith('mcp__')) {
    const parts = toolName.split('__')
    const tool = parts[2] || toolName
    return `MCP: ${tool}`
  }
  return toolName
}

function basename(filePath: string): string {
  const parts = filePath.split('/')
  return parts[parts.length - 1] || filePath
}

// ---------------------------------------------------------------------------
// Reducers
// ---------------------------------------------------------------------------

export const reduceAssistantDelta = (
  setState: SetState,
  state: ComposerState,
  ev: StreamEvent
) => {
  const idx = findStreamingMsgIdx(state)

  if (idx === -1) {
    // No streaming message — create a new one
    const id = nextMsgId()
    setState((s) => {
      const msg: Message = {
        id,
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: ev.text ?? '',
            status: 'streaming',
          },
        ],
        status: 'streaming',
        timestamp: Date.now(),
      }
      // Attach pending strategy to this turn's assistant message
      if (s.strategy) {
        msg.strategy = s.strategy
        s.strategy = null
      }
      s.messages.push(msg)
      trimMessages(s.messages)
      s.streaming = { msgId: id, blockIdx: 0 }
    })
  } else {
    // Append text to existing streaming block
    const blockIdx = state.streaming!.blockIdx
    setState((s) => {
      s.messages[idx].content[blockIdx].text += ev.text ?? ''
    })
  }
}

export const reduceAssistantComplete = (
  setState: SetState,
  state: ComposerState,
  _ev: StreamEvent
) => {
  const idx = findStreamingMsgIdx(state)
  if (idx === -1) return

  setState((s) => {
    const msg = s.messages[idx]
    msg.status = 'complete'
    for (const block of msg.content) {
      block.status = 'complete'
    }
    s.streaming = null
  })
}

export const reduceThinkingDelta = (
  setState: SetState,
  state: ComposerState,
  ev: StreamEvent
) => {
  const idx = findStreamingMsgIdx(state)
  if (idx === -1) return

  const blocks = state.messages[idx].content
  const lastBlock = blocks[blocks.length - 1]
  const canAppend =
    lastBlock && lastBlock.type === 'thinking' && lastBlock.status === 'streaming'

  if (canAppend) {
    setState((s) => {
      const b = s.messages[idx].content
      b[b.length - 1].text += ev.text ?? ''
    })
  } else {
    setState((s) => {
      const block: ContentBlock = {
        type: 'thinking',
        text: ev.text ?? '',
        status: 'streaming',
      }
      s.messages[idx].content.push(block)
      s.streaming = {
        msgId: s.streaming!.msgId,
        blockIdx: s.messages[idx].content.length - 1,
      }
    })
  }
}

export const reduceToolUseStart = (
  setState: SetState,
  state: ComposerState,
  ev: StreamEvent
) => {
  const idx = findStreamingMsgIdx(state)
  const toolId = ev.tool_use_id ?? ''

  setState((s) => {
    // Add to toolUses map — guard against overwriting a completed entry
    // (e.g. from a replayed event or snapshot that already finalized it)
    if (!s.toolUses[toolId] || s.toolUses[toolId].status === 'running') {
      s.toolUses[toolId] = {
        id: toolId,
        toolName: ev.tool_name ?? '',
        input: ev.tool_input ?? {},
        output: '',
        status: 'running',
        isError: false,
        startedAt: Date.now(),
      }
    }

    // Push tool_use content block to streaming message
    if (idx !== -1) {
      const block: ContentBlock = {
        type: 'tool_use',
        text: '',
        status: 'streaming',
        toolUseId: toolId,
      }
      s.messages[idx].content.push(block)
    }

    // Emit active activity chip for this tool invocation (legacy path)
    const toolLabel = formatToolLabel(ev.tool_name ?? '')
    const currentMsgId = s.streaming?.msgId ?? s.messages[s.messages.length - 1]?.id
    s.chips.push(createActivityChip(`tool-${toolId}`, `${toolLabel}...`, 'active', undefined, undefined, currentMsgId))
  })
}

export const reduceToolUseComplete = (
  setState: SetState,
  state: ComposerState,
  ev: StreamEvent
) => {
  const toolId = ev.tool_use_id ?? ''
  const isError = ev.is_error ?? false

  setState((s) => {
    const entry = s.toolUses[toolId]
    if (entry) {
      entry.status = isError ? 'error' : 'complete'
      entry.output = ev.tool_output ?? ev.text ?? (ev as any).content ?? ''
      entry.isError = isError
      entry.completedAt = Date.now()

      // Update the active activity chip for this tool (legacy path)
      const timing = entry.completedAt && entry.startedAt
        ? entry.completedAt - entry.startedAt
        : 0
      let label = formatToolLabel(entry.toolName)
      const input = entry.input || {}
      if (entry.toolName === 'Read' && (input as Record<string, unknown>).file_path) {
        label = `Reading: ${basename(String((input as Record<string, unknown>).file_path))}`
      } else if (entry.toolName === 'Edit' && (input as Record<string, unknown>).file_path) {
        label = `Editing: ${basename(String((input as Record<string, unknown>).file_path))}`
      } else if (entry.toolName === 'Write' && (input as Record<string, unknown>).file_path) {
        label = `Writing: ${basename(String((input as Record<string, unknown>).file_path))}`
      } else if (entry.toolName === 'Bash' && (input as Record<string, unknown>).command) {
        const cmd = String((input as Record<string, unknown>).command)
        label = `Running: ${cmd.length > 40 ? cmd.slice(0, 40) + '...' : cmd}`
      } else if (
        (entry.toolName === 'Grep' || entry.toolName === 'Glob') &&
        (input as Record<string, unknown>).pattern
      ) {
        label = `Searching: "${(input as Record<string, unknown>).pattern}"`
      }

      const chipIdx = s.chips.findIndex(
        (c: ChipData) => c.source === `tool-${toolId}` && c.status === 'active'
      )
      if (chipIdx >= 0) {
        s.chips[chipIdx] = {
          ...s.chips[chipIdx],
          label,
          status: entry.isError ? 'error' : 'success',
          timing,
          expandable: true,
          expandedContent: entry.output
            ? entry.output.length > 500
              ? entry.output.slice(0, 500) + '...'
              : entry.output
            : undefined,
        }
      }
    }

    // Update corresponding content block status
    const idx = findStreamingMsgIdx(s)
    if (idx !== -1) {
      const block = s.messages[idx].content.find(
        (b) => b.type === 'tool_use' && b.toolUseId === toolId
      )
      if (block) {
        block.status = 'complete'
      }
    }
  })
}

export const reducePermissionRequest = (
  setState: SetState,
  _state: ComposerState,
  ev: StreamEvent
) => {
  setState((s) => {
    s.permission = {
      requestId: '',
      toolName: ev.tool_name ?? '',
      description: ev.description ?? '',
      input: ev.tool_input ?? {},
      timestamp: Date.now(),
    }
  })
}

export const reducePermissionResponse = (
  setState: SetState,
  _state: ComposerState,
  _ev: StreamEvent
) => {
  setState((s) => {
    s.permission = null
  })
}

// ---------------------------------------------------------------------------
// Real Claude CLI protocol reducers
// ---------------------------------------------------------------------------

/**
 * Handles assistant message snapshots from the CLI.
 *
 * With --include-partial-messages, the CLI sends progressive "assistant"
 * events — each one is a SNAPSHOT of the full message content at that point.
 * Without dedup, every snapshot would create a new message bubble. Instead,
 * we find the existing streaming assistant message (or the one created by
 * stream_event deltas) and REPLACE its content with the latest snapshot.
 * A new message is only created if none exists yet.
 *
 * When stop_reason is set (non-null), the message is finalized.
 */
export const reduceAssistantMessage = (
  setState: SetState,
  state: ComposerState,
  ev: StreamEvent
) => {
  // ev.message may be a string (json.RawMessage serialized by Wails) or object
  let msg = ev.message
  if (typeof msg === 'string') {
    try {
      msg = JSON.parse(msg) as AssistantMessage
    } catch {
      return
    }
  }
  const parsed = msg as AssistantMessage
  if (!parsed?.content) return

  const blocks: ContentBlock[] = parsed.content.map((block: AssistantContentBlock) => {
    switch (block.type) {
      case 'text':
        return { type: 'text' as const, text: block.text, status: 'complete' as const }
      case 'tool_use':
        return {
          type: 'tool_use' as const,
          text: '',
          status: 'complete' as const,
          toolUseId: block.id,
        }
      case 'thinking':
        return { type: 'thinking' as const, text: block.thinking, status: 'complete' as const }
      default:
        return { type: 'text' as const, text: '', status: 'complete' as const }
    }
  })

  // Also register tool_use entries in toolUses map
  const toolUseBlocks = parsed.content.filter(
    (b: AssistantContentBlock) => b.type === 'tool_use'
  )

  // Extract usage metrics from the assistant message
  const usage = parsed.usage
    ? {
        input_tokens: parsed.usage.input_tokens ?? 0,
        output_tokens: parsed.usage.output_tokens ?? 0,
      }
    : undefined

  const isFinal = !!parsed.stop_reason

  setState((s) => {
    // Find existing assistant message to update in-place.
    // With --include-partial-messages, we get many "assistant" snapshots;
    // updating avoids duplicate bubbles.
    //
    // Search order:
    //   1. The actively streaming message (tracked by s.streaming.msgId)
    //   2. Any streaming assistant message (e.g. streaming pointer was cleared
    //      by a prior message_stop but the assistant snapshot arrives after)
    //   3. The LAST assistant message that's already complete — this handles
    //      the race where message_stop finalizes the message before the
    //      assistant snapshot arrives, preventing duplicate creation.
    let existingIdx = -1
    if (s.streaming) {
      existingIdx = s.messages.findIndex((m) => m.id === s.streaming!.msgId)
    }
    if (existingIdx === -1) {
      existingIdx = s.messages.findLastIndex(
        (m) => m.role === 'assistant' && m.status === 'streaming'
      )
    }
    if (existingIdx === -1 && isFinal) {
      // Final snapshot after message_stop already finalized the message —
      // find the last complete assistant message to update (not create a dup).
      existingIdx = s.messages.findLastIndex(
        (m) => m.role === 'assistant' && m.status === 'complete'
      )
    }

    if (existingIdx !== -1) {
      // DON'T replace content if streaming built up tool_use/thinking blocks —
      // the assistant snapshot only has text blocks, not the full lifecycle.
      // Only replace if the existing message has no content yet (placeholder).
      const existing = s.messages[existingIdx]
      if (existing.content.length === 0 && blocks.length > 0) {
        existing.content = blocks
      } else if (isFinal && blocks.length > 0) {
        // On final snapshot, update text blocks but preserve tool_use/thinking
        for (const block of blocks) {
          if (block.type === 'text') {
            const textIdx = existing.content.findIndex((b) => b.type === 'text')
            if (textIdx !== -1) {
              existing.content[textIdx].text = block.text
              existing.content[textIdx].status = 'complete'
            }
          }
        }
      }
      if (isFinal) {
        existing.status = 'complete'
        existing.usage = usage
        // Finalize all blocks
        for (const b of existing.content) {
          b.status = 'complete'
        }
        s.streaming = null
      }
      if (s.streaming && !isFinal) {
        s.streaming = {
          msgId: s.streaming.msgId,
          blockIdx: Math.max(0, existing.content.length - 1),
        }
      }
    } else {
      // No existing message — create one
      const id = nextMsgId()
      const newMsg: Message = {
        id,
        role: 'assistant',
        content: blocks,
        status: isFinal ? 'complete' : 'streaming',
        timestamp: Date.now(),
        usage,
      }
      // Attach pending strategy to this turn's assistant message
      if (s.strategy) {
        newMsg.strategy = s.strategy
        s.strategy = null
      }
      s.messages.push(newMsg)
      trimMessages(s.messages)
      if (!isFinal) {
        s.streaming = { msgId: id, blockIdx: 0 }
      } else {
        s.streaming = null
      }
    }

    // Accumulate session totals from usage (only on final to avoid double-counting)
    if (isFinal && usage) {
      s.totalInputTokens += usage.input_tokens
      s.totalOutputTokens += usage.output_tokens
    }

    for (const tu of toolUseBlocks) {
      if (tu.type === 'tool_use' && !s.toolUses[tu.id]) {
        s.toolUses[tu.id] = {
          id: tu.id,
          toolName: tu.name,
          input: tu.input ?? {},
          output: '',
          status: 'running',
          isError: false,
          startedAt: Date.now(),
        }
      }
    }
  })
}

/**
 * Handles stream_event (partial message deltas from --include-partial-messages).
 *
 * The Go decoder unwraps the stream_event envelope and populates:
 *   - ev.raw_subtype: inner event type from the Anthropic streaming API
 *   - ev.block_index: content block index for block-level events
 *   - ev.text: extracted delta text (text_delta, thinking_delta, input_json_delta)
 *   - ev.tool_use_id, ev.tool_name: for tool_use content_block_start
 *
 * Subtypes handled:
 *   message_start       → create new assistant message
 *   thinking_start      → push thinking content block
 *   text_start          → push text content block
 *   tool_use_start      → push tool_use content block + toolUses entry
 *   thinking_delta      → append thinking text
 *   text_delta (default)→ append text
 *   input_json_delta    → accumulate tool input JSON
 *   content_block_stop  → finalize block at index
 *   message_delta       → capture stop_reason (no-op for now)
 *   message_stop        → finalize message, clear streaming cursor
 */
export const reduceStreamEvent = (
  setState: SetState,
  state: ComposerState,
  ev: StreamEvent
) => {
  const subtype = ev.raw_subtype ?? ''

  switch (subtype) {
    case 'message_start':
      handleStreamMessageStart(setState, state)
      break
    case 'thinking_start':
      handleStreamBlockStart(setState, state, 'thinking')
      // Emit active thinking activity chip (timing stores start timestamp for duration calc)
      setState((s) => {
        const currentMsgId = s.streaming?.msgId ?? s.messages[s.messages.length - 1]?.id
        s.chips.push(createActivityChip('thinking', 'Thinking...', 'active', Date.now(), undefined, currentMsgId))
      })
      break
    case 'text_start':
    case 'content_block_start':
      // text_start is set by Go for text blocks; content_block_start is
      // the raw inner type when no specific subtype override was applied.
      handleStreamBlockStart(setState, state, 'text')
      break
    case 'tool_use_start':
      handleStreamToolUseStart(setState, state, ev)
      break
    case 'thinking_delta':
      handleStreamDelta(setState, state, ev, 'thinking')
      break
    case 'input_json_delta':
      handleStreamInputJsonDelta(setState, state, ev)
      break
    case 'content_block_stop':
      handleStreamBlockStop(setState, state, ev)
      break
    case 'message_delta':
      // message_delta carries stop_reason and final usage — currently
      // the result_success event already covers this, so no-op for now.
      break
    case 'message_stop':
      handleStreamMessageStop(setState, state)
      break
    default:
      // Default: treat as text delta (covers "content_block_delta" with
      // text_delta where Go sets ev.text but keeps raw_subtype as
      // "content_block_delta", and any other unrecognized subtype with text).
      handleStreamDelta(setState, state, ev, 'text')
      break
  }
}

// ---------------------------------------------------------------------------
// stream_event sub-handlers
// ---------------------------------------------------------------------------

/** message_start — create a new streaming assistant message. */
const handleStreamMessageStart = (setState: SetState, state: ComposerState) => {
  const existingIdx = findStreamingMsgIdx(state)
  if (existingIdx !== -1) {
    // Reuse the placeholder — attach pending strategy if available
    setState((s) => {
      if (s.strategy && !s.messages[existingIdx].strategy) {
        s.messages[existingIdx].strategy = s.strategy
        s.strategy = null
      } else if (s.strategy && s.messages[existingIdx].strategy) {
        // Strategy already attached (by snapshot) — just clear the pending one
        s.strategy = null
      }
    })
    return
  }

  const id = nextMsgId()
  setState((s) => {
    const msg: Message = {
      id,
      role: 'assistant',
      content: [],
      status: 'streaming',
      timestamp: Date.now(),
    }
    if (s.strategy) {
      msg.strategy = s.strategy
      s.strategy = null
    }
    s.messages.push(msg)
    trimMessages(s.messages)
    s.streaming = { msgId: id, blockIdx: 0 }
  })
}

/** content_block_start — push a new content block of the given type. */
const handleStreamBlockStart = (
  setState: SetState,
  state: ComposerState,
  blockType: 'text' | 'thinking'
) => {
  let idx = findStreamingMsgIdx(state)

  // If no streaming message exists yet (e.g. message_start was missed),
  // create one implicitly so we don't lose content.
  if (idx === -1) {
    const id = nextMsgId()
    setState((s) => {
      const msg: Message = {
        id,
        role: 'assistant',
        content: [],
        status: 'streaming',
        timestamp: Date.now(),
      }
      // Attach pending strategy to this turn's assistant message
      if (s.strategy) {
        msg.strategy = s.strategy
        s.strategy = null
      }
      s.messages.push(msg)
      trimMessages(s.messages)
      s.streaming = { msgId: id, blockIdx: 0 }
    })
    // Re-find after creation — the state reference is stale but we need the
    // index for the next setState call. Since we just pushed, it's the last.
    idx = state.messages.length // will be the new last index after the push above
  }

  setState((s) => {
    const msgIdx = findStreamingMsgIdx(s)
    if (msgIdx === -1) return
    s.messages[msgIdx].content.push({
      type: blockType,
      text: '',
      status: 'streaming',
    })
    s.streaming = {
      msgId: s.streaming!.msgId,
      blockIdx: s.messages[msgIdx].content.length - 1,
    }
  })
}

/** content_block_start for tool_use — create tool entry and content block. */
const handleStreamToolUseStart = (
  setState: SetState,
  state: ComposerState,
  ev: StreamEvent
) => {
  if (!ev.tool_name) return
  const toolId = ev.tool_use_id ?? ''
  const idx = findStreamingMsgIdx(state)

  setState((s) => {
    // Guard against overwriting a completed/error entry from a prior event path
    if (!s.toolUses[toolId] || s.toolUses[toolId].status === 'running') {
      s.toolUses[toolId] = {
        id: toolId,
        toolName: ev.tool_name ?? '',
        input: ev.tool_input ?? {},
        output: '',
        status: 'running',
        isError: false,
        startedAt: Date.now(),
      }
    }
    const msgIdx = idx !== -1 ? idx : findStreamingMsgIdx(s)
    if (msgIdx !== -1) {
      s.messages[msgIdx].content.push({
        type: 'tool_use',
        text: '',
        status: 'streaming',
        toolUseId: toolId,
      })
      s.streaming = {
        msgId: s.streaming!.msgId,
        blockIdx: s.messages[msgIdx].content.length - 1,
      }
    }

    // Emit active activity chip for this tool invocation
    const toolLabel = formatToolLabel(ev.tool_name ?? '')
    const currentMsgId = s.streaming?.msgId ?? s.messages[s.messages.length - 1]?.id
    s.chips.push(createActivityChip(`tool-${toolId}`, `${toolLabel}...`, 'active', undefined, undefined, currentMsgId))
  })
}

/** content_block_delta — append text to the current streaming block. */
const handleStreamDelta = (
  setState: SetState,
  state: ComposerState,
  ev: StreamEvent,
  expectedType: 'text' | 'thinking'
) => {
  const deltaText = ev.text ?? ''
  if (!deltaText) return

  const idx = findStreamingMsgIdx(state)
  if (idx === -1) {
    // No streaming message yet — create one with an initial block.
    // This handles the case where message_start / content_block_start
    // events were missed (e.g., connection hiccup).
    const id = nextMsgId()
    setState((s) => {
      const msg: Message = {
        id,
        role: 'assistant',
        content: [{ type: expectedType, text: deltaText, status: 'streaming' }],
        status: 'streaming',
        timestamp: Date.now(),
      }
      // Attach pending strategy to this turn's assistant message
      if (s.strategy) {
        msg.strategy = s.strategy
        s.strategy = null
      }
      s.messages.push(msg)
      trimMessages(s.messages)
      s.streaming = { msgId: id, blockIdx: 0 }
    })
    return
  }

  const blocks = state.messages[idx].content
  const blockIdx = state.streaming!.blockIdx
  const currentBlock = blocks[blockIdx]

  if (currentBlock && currentBlock.type === expectedType) {
    // Happy path — append to current block of matching type
    setState((s) => {
      s.messages[idx].content[blockIdx].text += deltaText
    })
  } else if (!currentBlock || currentBlock.type !== expectedType) {
    // Current block doesn't match — push a new block.
    // This can happen when content_block_start was missed.
    setState((s) => {
      s.messages[idx].content.push({
        type: expectedType,
        text: deltaText,
        status: 'streaming',
      })
      s.streaming = {
        msgId: s.streaming!.msgId,
        blockIdx: s.messages[idx].content.length - 1,
      }
    })
  }
}

/** input_json_delta — accumulate partial JSON for tool use input. */
const handleStreamInputJsonDelta = (
  setState: SetState,
  state: ComposerState,
  ev: StreamEvent
) => {
  const partialJson = ev.text ?? ''
  if (!partialJson) return

  const idx = findStreamingMsgIdx(state)
  if (idx === -1) return

  // Append to the tool_use content block's text (used as JSON accumulator)
  const blockIdx = state.streaming!.blockIdx
  setState((s) => {
    const block = s.messages[idx].content[blockIdx]
    if (block && block.type === 'tool_use') {
      block.text += partialJson
    }
  })
}

/** content_block_stop — finalize the block at the given index. */
const handleStreamBlockStop = (
  setState: SetState,
  state: ComposerState,
  ev: StreamEvent
) => {
  const idx = findStreamingMsgIdx(state)
  if (idx === -1) return

  const blockIndex = ev.block_index ?? 0

  setState((s) => {
    const block = s.messages[idx].content[blockIndex]
    if (block) {
      block.status = 'complete'

      // For tool_use blocks, parse the accumulated JSON input and
      // finalize the toolUses map entry so the ToolUseChip shows
      // the correct status (complete instead of perpetual "running").
      if (block.type === 'tool_use' && block.toolUseId) {
        const entry = s.toolUses[block.toolUseId]
        if (entry) {
          if (block.text) {
            try {
              entry.input = JSON.parse(block.text)
            } catch {
              // Partial JSON — leave as-is
            }
          }
          // Mark tool_use as complete in the map — the CLI sends
          // tool results separately, but the content block stop
          // means the assistant finished emitting the tool_use.
          entry.status = 'complete'

          // Update the active activity chip for this tool to show completion
          const timing = entry.completedAt && entry.startedAt
            ? entry.completedAt - entry.startedAt
            : 0
          let label = formatToolLabel(entry.toolName)
          const input = entry.input || {}
          if (entry.toolName === 'Read' && (input as Record<string, unknown>).file_path) {
            label = `Reading: ${basename(String((input as Record<string, unknown>).file_path))}`
          } else if (entry.toolName === 'Edit' && (input as Record<string, unknown>).file_path) {
            label = `Editing: ${basename(String((input as Record<string, unknown>).file_path))}`
          } else if (entry.toolName === 'Write' && (input as Record<string, unknown>).file_path) {
            label = `Writing: ${basename(String((input as Record<string, unknown>).file_path))}`
          } else if (entry.toolName === 'Bash' && (input as Record<string, unknown>).command) {
            const cmd = String((input as Record<string, unknown>).command)
            label = `Running: ${cmd.length > 40 ? cmd.slice(0, 40) + '...' : cmd}`
          } else if (
            (entry.toolName === 'Grep' || entry.toolName === 'Glob') &&
            (input as Record<string, unknown>).pattern
          ) {
            label = `Searching: "${(input as Record<string, unknown>).pattern}"`
          }

          const chipIdx = s.chips.findIndex(
            (c: ChipData) => c.source === `tool-${block.toolUseId}` && c.status === 'active'
          )
          if (chipIdx >= 0) {
            s.chips[chipIdx] = {
              ...s.chips[chipIdx],
              label,
              status: entry.isError ? 'error' : 'success',
              timing,
              expandable: true,
              expandedContent: entry.output
                ? entry.output.length > 500
                  ? entry.output.slice(0, 500) + '...'
                  : entry.output
                : undefined,
            }
          }
        }
      }

      // For thinking blocks, update the active thinking chip to show completion
      if (block.type === 'thinking') {
        const chipIdx = s.chips.findIndex(
          (c: ChipData) => c.source === 'thinking' && c.status === 'active'
        )
        if (chipIdx >= 0) {
          const startTime = s.chips[chipIdx].timing || Date.now()
          const duration = Date.now() - startTime
          s.chips[chipIdx] = {
            ...s.chips[chipIdx],
            label: `Thinking: ${(duration / 1000).toFixed(1)}s`,
            status: 'success',
            timing: duration,
            expandable: block.text.length > 0,
            expandedContent: block.text.length > 500
              ? block.text.slice(0, 500) + '...'
              : block.text || undefined,
          }
        }
      }
    }
  })
}

/** message_stop — finalize the streaming message and clear cursor. */
const handleStreamMessageStop = (setState: SetState, state: ComposerState) => {
  const idx = findStreamingMsgIdx(state)
  if (idx === -1) return

  setState((s) => {
    const msg = s.messages[idx]
    msg.status = 'complete'
    for (const block of msg.content) {
      if (block.status === 'streaming') {
        block.status = 'complete'
      }
    }
    s.streaming = null

    // Also finalize any tool_use entries still marked 'running' for this message
    for (const block of msg.content) {
      if (block.type === 'tool_use' && block.toolUseId) {
        const entry = s.toolUses[block.toolUseId]
        if (entry && entry.status === 'running') {
          entry.status = 'complete'
        }
      }
    }
  })
}

/**
 * Handles control_request events (permission requests from CLI).
 * Checks request.subtype === 'can_use_tool' for tool permission prompts.
 */
export const reduceControlRequest = (
  setState: SetState,
  _state: ComposerState,
  ev: StreamEvent
) => {
  // ev.request may be a string (json.RawMessage via Wails) or parsed object
  let req = ev.request as any
  if (typeof req === 'string') {
    try {
      req = JSON.parse(req)
    } catch {
      return
    }
  }
  if (!req || req.subtype !== 'can_use_tool') return

  setState((s) => {
    s.permission = {
      requestId: ev.request_id ?? '',
      toolName: req.tool_name ?? ev.tool_name ?? '',
      description: req.description ?? ev.description ?? '',
      input: req.input ?? ev.tool_input ?? {},
      timestamp: Date.now(),
    }
  })
}

/**
 * Handles result_success and result_error events.
 * Finalizes the current streaming message and clears streaming state.
 */
export const reduceResult = (
  setState: SetState,
  state: ComposerState,
  ev: StreamEvent
) => {
  let idx = findStreamingMsgIdx(state)

  // Extract per-turn metrics from result event
  const costUsd = ev.total_cost_usd ?? 0
  const durationMs = ev.duration_ms ?? 0
  const inputTokens = ev.input_tokens ?? 0
  const outputTokens = ev.output_tokens ?? 0

  setState((s) => {
    // If no streaming message found (it was already finalized by
    // message_stop or the final assistant snapshot), find the last
    // assistant message to attach metrics to.
    let targetIdx = idx !== -1
      ? idx
      : s.messages.findLastIndex((m) => m.role === 'assistant')

    // Finalize the target message
    if (targetIdx !== -1) {
      s.messages[targetIdx].status = 'complete'
      for (const block of s.messages[targetIdx].content) {
        block.status = 'complete'
      }
      // Attach result-level metrics to the finalized message
      if (costUsd > 0) s.messages[targetIdx].costUsd = costUsd
      if (durationMs > 0) s.messages[targetIdx].durationMs = durationMs
      if (inputTokens > 0 || outputTokens > 0) {
        s.messages[targetIdx].usage = {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
        }
      }

      // Finalize non-BG tool_use entries. BG agents may still be running
      // after result_success — they send task_notification when truly done.
      for (const block of s.messages[targetIdx].content) {
        if (block.type === 'tool_use' && block.toolUseId) {
          const entry = s.toolUses[block.toolUseId]
          if (entry && entry.status === 'running') {
            const isBg = (entry.input as Record<string, unknown>)?.run_in_background
            if (!isBg) {
              entry.status = 'complete'
            }
          }
        }
      }
    }
    s.streaming = null
    s.strategy = null // clear per-turn strategy metadata
    s.status = 'idle' // result event = turn complete, session is idle

    // Remove active status chips — they are ephemeral per-turn indicators
    s.chips = s.chips.filter((c) => c.category !== 'status' || c.status !== 'active')

    // Force-complete any BG agents still running after turn ends.
    // task_notification events may not arrive in all CLI modes.
    const bgRunning: string[] = []
    for (const [id, entry] of Object.entries(s.toolUses)) {
      if (entry.status === 'running') {
        const isBg = (entry.input as Record<string, unknown>)?.run_in_background
        if (isBg) bgRunning.push(id)
      }
    }
    if (bgRunning.length > 0) {
      console.log('[reducer] result: BG agents still running after turn complete:', bgRunning.length)
      // Force-complete after short delay via setTimeout outside setState
      setTimeout(() => {
        setState((s2) => {
          for (const id of bgRunning) {
            const entry = s2.toolUses[id]
            if (entry && entry.status === 'running') {
              console.log('[reducer] force-completing BG agent:', id)
              entry.status = 'complete'
              entry.output = entry.output || '[turn complete]'
              entry.completedAt = Date.now()
            }
          }
        })
      }, 5000)
    }

    // Update session totals from result-level usage
    if (costUsd > 0) s.totalCostUsd += costUsd
    if (inputTokens > 0) s.totalInputTokens += inputTokens
    if (outputTokens > 0) s.totalOutputTokens += outputTokens

    // Estimate context usage percentage using highest input token count
    // (input_tokens in result reflects the full conversation context sent)
    if (inputTokens > 0) {
      const MODEL_CONTEXT: Record<string, number> = {
        sonnet: 200_000,
        opus: 1_000_000,
        haiku: 200_000,
      }
      const modelKey = (s.model || 'opus').toLowerCase()
      let contextLimit = 200_000
      // Parse "[Xk]" or "[Xm]" from model string
      const bracketMatch = modelKey.match(/\[(\d+)(k|m)\]/i)
      if (bracketMatch) {
        const num = parseInt(bracketMatch[1], 10)
        contextLimit = bracketMatch[2].toLowerCase() === 'm' ? num * 1_000_000 : num * 1_000
      } else {
        for (const [key, limit] of Object.entries(MODEL_CONTEXT)) {
          if (modelKey.includes(key)) { contextLimit = limit; break }
        }
      }
      s.contextUsedPct = Math.min(100, (inputTokens / contextLimit) * 100)
    }
  })
}

export const reduceError = (
  setState: SetState,
  _state: ComposerState,
  ev: StreamEvent
) => {
  const id = nextMsgId()
  setState((s) => {
    const msg: Message = {
      id,
      role: 'system',
      content: [
        {
          type: 'error',
          text: ev.text ?? 'Unknown error',
          status: 'complete',
        },
      ],
      status: 'error',
      timestamp: Date.now(),
    }
    s.messages.push(msg)
    trimMessages(s.messages)
    s.streaming = null
  })
}

export const reduceSessionStatus = (
  setState: SetState,
  _state: ComposerState,
  ev: StreamEvent
) => {
  const newStatus = (ev.text ?? 'idle') as SessionStatus
  setState((s) => {
    s.status = newStatus
  })
}

/**
 * Handles strategy events from the AI engine.
 * Sets strategy metadata on the session state so the UI can render
 * a StrategyChip. Cleared when the next result completes.
 */
export const reduceStrategy = (
  setState: SetState,
  _state: ComposerState,
  ev: StreamEvent
) => {
  const info: StrategyInfo = {
    name: ev.strategy_name ?? '',
    confidence: ev.strategy_confidence ?? 0,
    complexity: ev.task_complexity ?? '',
    risk: ev.task_risk ?? '',
    blastRadius: ev.blast_radius ?? 0,
  }
  if (!info.name) return

  setState((s) => {
    s.strategy = info
  })
}

/**
 * Handles enriched_prompt events from the AI engine.
 * Stores the enriched (context-injected) prompt text on the last user message
 * so the UI can render a transparency chip showing what was actually sent.
 */
export const reduceEnrichedPrompt = (
  setState: SetState,
  _state: ComposerState,
  ev: StreamEvent
) => {
  const text = ev.enriched_text ?? ev.text ?? ''
  if (!text) return

  setState((s) => {
    const lastUserIdx = s.messages.findLastIndex((m) => m.role === 'user')
    if (lastUserIdx !== -1) {
      s.messages[lastUserIdx].enrichedPrompt = text
    }
  })
}

/**
 * Handles compact_boundary events — the CLI compacted the conversation context.
 * Resets contextUsedPct to a lower value and adds a system message so the user
 * knows the context was compacted.
 */
export const reduceCompactBoundary = (
  setState: SetState,
  _state: ComposerState,
  _ev: StreamEvent
) => {
  const id = nextMsgId()
  setState((s) => {
    // Reset context gauge — compaction typically halves usage
    s.contextUsedPct = Math.min(s.contextUsedPct * 0.5, 50)

    const msg: Message = {
      id,
      role: 'system',
      content: [
        {
          type: 'text',
          text: 'Context compacted — conversation history was summarized to free context window.',
          status: 'complete',
        },
      ],
      status: 'complete',
      timestamp: Date.now(),
    }
    s.messages.push(msg)
    trimMessages(s.messages)
  })
}

export const reduceChipEvent = (
  setState: SetState,
  _state: ComposerState,
  ev: StreamEvent
): void => {
  const chip = ev.data as ChipData
  if (!chip || !chip.source) return
  const id = `${chip.source}-${Date.now()}`
  setState((s) => {
    s.chips.push({ ...chip, id, expandable: true })
  })
}

export const reduceLifecycleEvent = (
  setState: SetState,
  _state: ComposerState,
  ev: StreamEvent
): void => {
  const lifecycle = (ev.data as { lifecycle?: SessionLifecycle })?.lifecycle
  if (lifecycle) {
    setState((s) => {
      s.lifecycle = lifecycle
    })
  }
}

// ---------------------------------------------------------------------------
// Master dispatcher
// ---------------------------------------------------------------------------

export const dispatchEvent = (
  setState: SetState,
  state: ComposerState,
  ev: StreamEvent
) => {
  switch (ev.kind) {
    // ── Real Claude CLI protocol ───────────────────────────────────
    case 'strategy':
      return reduceStrategy(setState, state, ev)
    case 'assistant':
      return reduceAssistantMessage(setState, state, ev)
    case 'stream_event':
      return reduceStreamEvent(setState, state, ev)
    case 'control_request':
      return reduceControlRequest(setState, state, ev)
    case 'control_response':
      return reducePermissionResponse(setState, state, ev)
    case 'result_success':
    case 'result_error':
      return reduceResult(setState, state, ev)
    case 'system_init':
      // Capture model + Claude session UUID from system_init
      setState((s) => {
        if (ev.model) s.model = ev.model!
        if (ev.session_id) s.sessionId = ev.session_id!
      })
      break
    case 'enriched_prompt':
      return reduceEnrichedPrompt(setState, state, ev)
    case 'compact_boundary':
      return reduceCompactBoundary(setState, state, ev)
    case 'system_status':
      if (ev.raw_subtype === 'task_notification' && ev.tool_use_id) {
        // BG agent completed — match by tool_use_id from the event.
        // Status may already be 'complete' from content_block_stop,
        // but output is empty — setting it makes statusMapped() show ✓.
        setState((s) => {
          const entry = s.toolUses[ev.tool_use_id!]
          if (entry) {
            entry.status = 'complete'
            entry.output = entry.output || '[agent completed]'
            entry.completedAt = entry.completedAt || Date.now()
          }
        })
      } else if (ev.raw_subtype === 'task_notification' && !ev.tool_use_id) {
        // Fallback: no tool_use_id, complete all BG agents
        setState((s) => {
          for (const entry of Object.values(s.toolUses)) {
            if (!entry.output) {
              const isBg = (entry.input as Record<string, unknown>)?.run_in_background
              if (isBg) {
                entry.status = 'complete'
                entry.output = '[agent completed]'
                entry.completedAt = Date.now()
              }
            }
          }
        })
      }
      break
    case 'user_replay':
      break

    // ── Legacy event kinds (backward compat) ───────────────────────
    case 'assistant_message_delta':
      return reduceAssistantDelta(setState, state, ev)
    case 'assistant_message_complete':
      return reduceAssistantComplete(setState, state, ev)
    case 'thinking_delta':
      return reduceThinkingDelta(setState, state, ev)
    case 'tool_use_start':
      return reduceToolUseStart(setState, state, ev)
    case 'tool_use_complete':
    case 'tool_result':
      return reduceToolUseComplete(setState, state, ev)
    case 'permission_request':
      return reducePermissionRequest(setState, state, ev)
    case 'permission_response':
      return reducePermissionResponse(setState, state, ev)
    case 'error':
      return reduceError(setState, state, ev)
    case 'session_status_changed':
      return reduceSessionStatus(setState, state, ev)
    case 'chip_event':
      return reduceChipEvent(setState, state, ev)
    case 'lifecycle_event':
      return reduceLifecycleEvent(setState, state, ev)
    // Silently ignore unhandled event kinds
    default:
      break
  }
}
