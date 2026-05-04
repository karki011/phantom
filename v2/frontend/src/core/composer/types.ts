// Author: Subash Karki

// ---------------------------------------------------------------------------
// Stream-JSON event types (mirrors Go StreamEvent struct)
// ---------------------------------------------------------------------------

export type EventKind =
  // Real Claude CLI protocol kinds
  | 'system_init'
  | 'system_status'
  | 'strategy'              // AI engine strategy selection
  | 'assistant'             // complete assistant message
  | 'stream_event'          // partial message delta (--include-partial-messages)
  | 'result_success'
  | 'result_error'
  | 'control_request'       // permission requests from CLI
  | 'control_response'      // permission responses echoed back
  | 'user_replay'           // --replay-user-messages echo
  | 'error'
  | 'session_status_changed'
  | 'enriched_prompt'
  | 'compact_boundary'
  | 'unknown'
  // Legacy kinds (backward compat)
  | 'assistant_message_delta'
  | 'assistant_message_complete'
  | 'thinking_delta'
  | 'thinking_complete'
  | 'tool_use_start'
  | 'tool_use_complete'
  | 'tool_result'
  | 'permission_request'
  | 'permission_response'
  | 'session_resumed'
  | 'system_info'
  | 'cancelled'

export interface StreamEvent {
  kind: EventKind
  raw_type?: string
  raw_subtype?: string
  text?: string
  tool_use_id?: string
  tool_name?: string
  tool_input?: Record<string, unknown>
  tool_output?: string
  is_error?: boolean
  description?: string
  session_id?: string
  message_id?: string
  // Real Claude CLI protocol fields
  message?: AssistantMessage | string // object or JSON string (json.RawMessage via Wails)
  request?: ControlRequestPayload | string // object or JSON string
  response?: ControlResponsePayload | string // object or JSON string
  request_id?: string               // for control req/resp matching
  result?: string                   // final text from result
  duration_ms?: number              // from result
  total_cost_usd?: number           // from result
  input_tokens?: number             // from result usage
  output_tokens?: number            // from result usage
  model?: string                    // model identifier from system_init
  // stream_event inner event fields (populated by Go decoder)
  event?: unknown                   // raw inner Anthropic streaming event
  block_index?: number              // content block index from inner event
  // Enriched prompt fields (populated on kind=="enriched_prompt")
  enriched_text?: string
  // Strategy fields (populated on kind=="strategy")
  strategy_name?: string
  strategy_confidence?: number      // 0-1
  task_complexity?: string          // "simple" | "moderate" | "complex" | "critical"
  task_risk?: string                // "low" | "medium" | "high" | "critical"
  blast_radius?: number             // number of affected files
}

/** Shape of the assistant message from CLI's `"type":"assistant"` events. */
export interface AssistantMessage {
  role: 'assistant'
  content: AssistantContentBlock[]
  stop_reason?: string
  usage?: { input_tokens?: number; output_tokens?: number }
}

export type AssistantContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'thinking'; thinking: string }

export interface ControlRequestPayload {
  subtype: string
  tool_name?: string
  input?: Record<string, unknown>
  description?: string
}

export interface ControlResponsePayload {
  subtype: string
  request_id: string
  response?: { allowed: boolean; updatedInput?: Record<string, unknown> }
  error?: string
}

// ---------------------------------------------------------------------------
// Store types
// ---------------------------------------------------------------------------

export type SessionStatus = 'idle' | 'running' | 'stopped' | 'crashed' | 'paused'

export type ComposerMode = 'normal' | 'plan'

export type PermissionMode = 'default' | 'acceptEdits' | 'auto' | 'plan' | 'bypassPermissions' | 'dontAsk'

export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type ContentBlockType = 'text' | 'thinking' | 'tool_use' | 'tool_result' | 'error'

export type ContentBlockStatus = 'streaming' | 'complete'

export interface ContentBlock {
  type: ContentBlockType
  text: string
  status: ContentBlockStatus
  toolUseId?: string
}

export type MessageRole = 'user' | 'assistant' | 'system'

export type MessageStatus = 'streaming' | 'complete' | 'error'

export interface MessageUsage {
  input_tokens: number
  output_tokens: number
  cache_read_tokens?: number
  cache_write_tokens?: number
}

export interface Message {
  id: string
  role: MessageRole
  content: ContentBlock[]
  status: MessageStatus
  timestamp: number
  usage?: MessageUsage
  costUsd?: number
  durationMs?: number
  /** Per-turn strategy metadata — attached by the reducer when a strategy event
   *  arrives before the assistant message starts streaming. */
  strategy?: StrategyInfo
  /** Enriched prompt text — the full prompt after AI engine context injection.
   *  Attached to user messages so the user can see what was actually sent. */
  enrichedPrompt?: string
}

export type ToolUseStatus = 'running' | 'complete' | 'error'

export interface ToolUseState {
  id: string
  toolName: string
  input: Record<string, unknown>
  output: string
  status: ToolUseStatus
  isError: boolean
  startedAt: number
  completedAt?: number
}

export interface EditorContext {
  filePath: string | null
  selection: string | null
  cursor: string | null
  language: string | null
}

export interface PermissionRequest {
  requestId: string      // matches control_request.request_id
  toolName: string
  description: string
  input: Record<string, unknown>
  timestamp: number
}

export interface StreamingCursor {
  msgId: string
  blockIdx: number
}

/** AI engine strategy metadata, emitted once per turn before the CLI run starts. */
export interface StrategyInfo {
  name: string
  confidence: number       // 0-1
  complexity: string       // "simple" | "moderate" | "complex" | "critical"
  risk: string             // "low" | "medium" | "high" | "critical"
  blastRadius: number      // number of affected files
}

export interface ComposerState {
  sessionId: string | null
  worktreeId: string | null
  messages: Message[]
  toolUses: Record<string, ToolUseState>
  streaming: StreamingCursor | null
  permission: PermissionRequest | null
  strategy: StrategyInfo | null
  mode: ComposerMode
  permissionMode: PermissionMode
  effortLevel: EffortLevel
  fontSize: number
  editorContext: EditorContext | null
  status: SessionStatus
  label: string
  totalInputTokens: number
  totalOutputTokens: number
  totalCostUsd: number
  contextUsedPct: number
  model: string
}

export interface SessionListEntry {
  id: string
  cwd: string
  status: SessionStatus
}

// ---------------------------------------------------------------------------
// Wails binding request shapes
// ---------------------------------------------------------------------------

export interface OpenSessionRequest {
  session_id: string
  cwd: string
  mode: ComposerMode
  resume_id?: string
}

export interface SendMessageRequest {
  session_id: string
  content: unknown
}
