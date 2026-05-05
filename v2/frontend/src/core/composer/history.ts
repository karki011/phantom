// Author: Subash Karki
//
// Converts V1's ComposerHistoryTurn[] (persisted in SQLite) into V2's
// Message[] so a resumed session renders its old conversation immediately.

import type { ComposerHistoryTurn } from '@/core/bindings/composer'
import type { Message, ContentBlock, StrategyInfo, ToolUseState } from './types'

/** Result from history conversion — includes both messages and the toolUses map
 *  so the store can be fully rehydrated for ToolUseChip rendering. */
export interface HistoryConversionResult {
  messages: Message[]
  toolUses: Record<string, ToolUseState>
}

/**
 * Map a list of history turns into the flat Message[] array used by V2's store.
 * Each turn produces up to two messages:
 *   1. A user message (from the turn's prompt)
 *   2. An assistant message (from response_text, events, or edits)
 *
 * Also returns a toolUses map so ToolUseChip can look up tool call metadata.
 */
export const convertHistoryToMessages = (
  turns: ComposerHistoryTurn[]
): HistoryConversionResult => {
  const messages: Message[] = []
  const toolUses: Record<string, ToolUseState> = {}

  for (const { turn, edits: rawEdits, events: rawEvents } of turns) {
    const edits = rawEdits ?? []
    const events = rawEvents ?? []
    // ── User message ────────────────────────────────────────────────
    if (turn.prompt) {
      // Check for enriched_prompt event to attach to user message
      const sortedForEnriched = [...events].sort((a, b) => a.seq - b.seq)
      const enrichedEvent = sortedForEnriched.find((e) => e.type === 'enriched_prompt')
      let enrichedPrompt: string | undefined
      if (enrichedEvent?.content) {
        try {
          const parsed = JSON.parse(enrichedEvent.content)
          enrichedPrompt = parsed.enriched_text ?? parsed.text ?? enrichedEvent.content
        } catch {
          // Content is plain text, not JSON
          enrichedPrompt = enrichedEvent.content
        }
      }

      const userMsg: Message = {
        id: `hist_user_${turn.id}`,
        role: 'user',
        content: [
          { type: 'text', text: turn.prompt, status: 'complete' },
        ],
        status: 'complete',
        timestamp: turn.started_at * 1000,
      }
      if (enrichedPrompt) {
        userMsg.enrichedPrompt = enrichedPrompt
      }
      messages.push(userMsg)
    }

    // ── Assistant message ───────────────────────────────────────────
    const blocks: ContentBlock[] = []

    // Sort events by sequence so they appear in correct order
    const sorted = [...events].sort((a, b) => a.seq - b.seq)

    // Extract strategy metadata from events (if present)
    let strategy: StrategyInfo | undefined
    const strategyEvent = sorted.find((e) => e.type === 'strategy')
    if (strategyEvent) {
      // Strategy fields are serialised as JSON in event content
      try {
        const parsed = strategyEvent.content ? JSON.parse(strategyEvent.content) : {}
        strategy = {
          name: parsed.strategy_name ?? parsed.name ?? '',
          confidence: parsed.strategy_confidence ?? parsed.confidence ?? 0,
          complexity: parsed.task_complexity ?? parsed.complexity ?? '',
          risk: parsed.task_risk ?? parsed.risk ?? '',
          blastRadius: parsed.blast_radius ?? parsed.blastRadius ?? 0,
        }
        if (!strategy.name) strategy = undefined
      } catch {
        // Malformed strategy JSON — skip
      }
    }

    // 1) Reconstruct thinking blocks from events
    //    Go persists thinking as content_block_start (subtype=thinking)
    //    and content_block_delta (subtype=thinking_delta), not type=thinking.
    const thinkingEvents = sorted.filter(
      (e) =>
        e.type === 'thinking' ||
        e.subtype === 'thinking' ||
        e.subtype === 'thinking_delta'
    )
    if (thinkingEvents.length > 0) {
      // Only delta events carry actual text; block-start has metadata only
      const deltaEvents = thinkingEvents.filter(
        (e) =>
          e.type === 'content_block_delta' ||
          e.subtype === 'thinking_delta' ||
          e.type === 'thinking'
      )
      const combined = deltaEvents.map((e) => e.content).join('')
      if (combined) {
        blocks.push({
          type: 'thinking',
          text: combined,
          status: 'complete',
        })
      }
    }

    // 2) Persisted response_text (available after migration 010)
    if (turn.response_text) {
      blocks.push({
        type: 'text',
        text: turn.response_text,
        status: 'complete',
      })
    } else {
      // 3) Fallback: stitch together delta events in sequence order
      const deltas = sorted.filter(
        (e) => e.type === 'delta' || e.subtype === 'delta'
      )

      if (deltas.length > 0) {
        const combined = deltas.map((e) => e.content).join('')
        if (combined) {
          blocks.push({
            type: 'text',
            text: combined,
            status: 'complete',
          })
        }
      }
    }

    // 4) Render tool-use summary blocks so the user can see what happened.
    //    Also populate the toolUses map so ToolUseChip can render details.
    //    Go persists tool starts as content_block_start (subtype=tool_use).
    const toolEvents = sorted.filter(
      (e) =>
        e.type === 'tool_use' ||
        e.type === 'tool_result' ||
        (e.type === 'content_block_start' && e.subtype === 'tool_use')
    )
    // Build a map of tool_use_id → tool_result for pairing
    const resultsByToolId = new Map<string, { content: string; isError: boolean }>()
    for (const te of toolEvents) {
      if (te.type === 'tool_result' && te.tool_use_id) {
        resultsByToolId.set(te.tool_use_id, {
          content: te.content ?? '',
          isError: te.subtype === 'error',
        })
      }
    }
    for (const te of toolEvents) {
      const isToolUse =
        (te.type === 'tool_use' || (te.type === 'content_block_start' && te.subtype === 'tool_use'))
      if (isToolUse && te.tool_name) {
        const toolUseId = te.tool_use_id || undefined
        blocks.push({
          type: 'tool_use',
          text: `${te.tool_name}`,
          status: 'complete',
          toolUseId,
        })
        // Populate toolUses map entry so ToolUseChip can render
        if (toolUseId) {
          let input: Record<string, unknown> = {}
          if (te.content) {
            try { input = JSON.parse(te.content) } catch { /* non-JSON input */ }
          }
          const result = resultsByToolId.get(toolUseId)
          toolUses[toolUseId] = {
            id: toolUseId,
            toolName: te.tool_name ?? '',
            input,
            output: result?.content ?? '',
            status: result?.isError ? 'error' : 'complete',
            isError: result?.isError ?? false,
            startedAt: (te.created_at ?? turn.started_at) * 1000,
            completedAt: (turn.completed_at || turn.started_at) * 1000,
          }
        }
      }
      if (te.type === 'tool_result' && te.content) {
        blocks.push({
          type: 'tool_result',
          text: te.content.length > 500
            ? te.content.slice(0, 500) + '…'
            : te.content,
          status: 'complete',
          toolUseId: te.tool_use_id || undefined,
        })
      }
    }

    // 5) Edit cards as inline summaries
    for (const edit of edits) {
      const label = `Edit: ${edit.path} (+${edit.lines_added} -${edit.lines_removed}) [${edit.status}]`
      blocks.push({
        type: 'tool_use',
        text: label,
        status: 'complete',
      })
    }

    // Only add assistant message if we have content
    if (blocks.length > 0) {
      const assistantMsg: Message = {
        id: `hist_asst_${turn.id}`,
        role: 'assistant',
        content: blocks,
        status: turn.status === 'error' ? 'error' : 'complete',
        timestamp: (turn.completed_at || turn.started_at) * 1000,
        usage: {
          input_tokens: turn.input_tokens,
          output_tokens: turn.output_tokens,
        },
        costUsd: turn.cost_usd,
      }
      if (strategy) {
        assistantMsg.strategy = strategy
      }
      messages.push(assistantMsg)
    }
  }

  return { messages, toolUses }
}
