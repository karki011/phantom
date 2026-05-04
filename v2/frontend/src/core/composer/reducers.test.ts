// Author: Subash Karki

import { describe, it, expect, beforeEach } from 'vitest'
import { createStore, produce } from 'solid-js/store'
import { createDefaultState } from './store'
import type { ComposerState, StreamEvent } from './types'
import {
  reduceAssistantDelta,
  reduceAssistantComplete,
  reduceThinkingDelta,
  reduceToolUseStart,
  reduceToolUseComplete,
  reducePermissionRequest,
  reducePermissionResponse,
  reduceError,
  dispatchEvent,
  resetMsgCounter,
} from './reducers'

type SetState = (fn: (state: ComposerState) => void) => void

const makeStore = () => {
  const [state, setStore] = createStore(createDefaultState('test', '/tmp'))
  const setState: SetState = (fn) => setStore(produce(fn))
  return { state, setState }
}

describe('reduceAssistantDelta', () => {
  it('creates a new message on first delta', () => {
    const { state, setState } = makeStore()

    reduceAssistantDelta(setState, state, {
      kind: 'assistant_message_delta',
      text: 'Hello',
    })

    expect(state.messages).toHaveLength(1)
    expect(state.messages[0].role).toBe('assistant')
    expect(state.messages[0].status).toBe('streaming')
    expect(state.messages[0].content).toHaveLength(1)
    expect(state.messages[0].content[0].type).toBe('text')
    expect(state.messages[0].content[0].text).toBe('Hello')
    expect(state.messages[0].content[0].status).toBe('streaming')
    expect(state.streaming).not.toBeNull()
    expect(state.streaming!.msgId).toBe(state.messages[0].id)
    expect(state.streaming!.blockIdx).toBe(0)
  })

  it('appends text on subsequent delta', () => {
    const { state, setState } = makeStore()

    reduceAssistantDelta(setState, state, {
      kind: 'assistant_message_delta',
      text: 'Hello',
    })
    reduceAssistantDelta(setState, state, {
      kind: 'assistant_message_delta',
      text: ' world',
    })

    expect(state.messages).toHaveLength(1)
    expect(state.messages[0].content[0].text).toBe('Hello world')
  })
})

describe('reduceAssistantComplete', () => {
  it('flips streaming message to complete and clears cursor', () => {
    const { state, setState } = makeStore()

    reduceAssistantDelta(setState, state, {
      kind: 'assistant_message_delta',
      text: 'Done',
    })
    reduceAssistantComplete(setState, state, {
      kind: 'assistant_message_complete',
    })

    expect(state.messages[0].status).toBe('complete')
    expect(state.messages[0].content[0].status).toBe('complete')
    expect(state.streaming).toBeNull()
  })

  it('is a no-op when no streaming message exists', () => {
    const { state, setState } = makeStore()

    reduceAssistantComplete(setState, state, {
      kind: 'assistant_message_complete',
    })

    expect(state.messages).toHaveLength(0)
    expect(state.streaming).toBeNull()
  })
})

describe('reduceThinkingDelta', () => {
  it('appends text when last block is thinking+streaming', () => {
    const { state, setState } = makeStore()

    // Create a streaming message first
    reduceAssistantDelta(setState, state, {
      kind: 'assistant_message_delta',
      text: '',
    })
    // Add first thinking delta
    reduceThinkingDelta(setState, state, {
      kind: 'thinking_delta',
      text: 'Let me think',
    })
    // Should have 2 blocks now (text + thinking)
    expect(state.messages[0].content).toHaveLength(2)
    expect(state.messages[0].content[1].type).toBe('thinking')

    // Append to thinking
    reduceThinkingDelta(setState, state, {
      kind: 'thinking_delta',
      text: ' more',
    })
    expect(state.messages[0].content).toHaveLength(2)
    expect(state.messages[0].content[1].text).toBe('Let me think more')
  })

  it('pushes new thinking block if last block is not thinking', () => {
    const { state, setState } = makeStore()

    reduceAssistantDelta(setState, state, {
      kind: 'assistant_message_delta',
      text: 'Hello',
    })
    reduceThinkingDelta(setState, state, {
      kind: 'thinking_delta',
      text: 'Reasoning...',
    })

    expect(state.messages[0].content).toHaveLength(2)
    expect(state.messages[0].content[1].type).toBe('thinking')
    expect(state.messages[0].content[1].text).toBe('Reasoning...')
    expect(state.messages[0].content[1].status).toBe('streaming')
  })
})

describe('reduceToolUseStart', () => {
  it('adds entry to toolUses map with status running', () => {
    const { state, setState } = makeStore()

    reduceAssistantDelta(setState, state, {
      kind: 'assistant_message_delta',
      text: '',
    })

    reduceToolUseStart(setState, state, {
      kind: 'tool_use_start',
      tool_use_id: 'tu_1',
      tool_name: 'read_file',
      tool_input: { path: '/foo' },
    })

    expect(state.toolUses['tu_1']).toBeDefined()
    expect(state.toolUses['tu_1'].status).toBe('running')
    expect(state.toolUses['tu_1'].toolName).toBe('read_file')
    expect(state.toolUses['tu_1'].input).toEqual({ path: '/foo' })
    // Should also push a tool_use content block
    const blocks = state.messages[0].content
    const toolBlock = blocks.find((b) => b.type === 'tool_use')
    expect(toolBlock).toBeDefined()
    expect(toolBlock!.toolUseId).toBe('tu_1')
  })
})

describe('reduceToolUseComplete', () => {
  it('marks tool use complete with output', () => {
    const { state, setState } = makeStore()

    reduceAssistantDelta(setState, state, {
      kind: 'assistant_message_delta',
      text: '',
    })
    reduceToolUseStart(setState, state, {
      kind: 'tool_use_start',
      tool_use_id: 'tu_2',
      tool_name: 'write_file',
      tool_input: {},
    })
    reduceToolUseComplete(setState, state, {
      kind: 'tool_use_complete',
      tool_use_id: 'tu_2',
      tool_output: 'File written',
      is_error: false,
    })

    expect(state.toolUses['tu_2'].status).toBe('complete')
    expect(state.toolUses['tu_2'].output).toBe('File written')
    expect(state.toolUses['tu_2'].isError).toBe(false)
    expect(state.toolUses['tu_2'].completedAt).toBeGreaterThan(0)
  })

  it('marks tool use as error when is_error is true', () => {
    const { state, setState } = makeStore()

    reduceAssistantDelta(setState, state, {
      kind: 'assistant_message_delta',
      text: '',
    })
    reduceToolUseStart(setState, state, {
      kind: 'tool_use_start',
      tool_use_id: 'tu_3',
      tool_name: 'bash',
      tool_input: {},
    })
    reduceToolUseComplete(setState, state, {
      kind: 'tool_use_complete',
      tool_use_id: 'tu_3',
      tool_output: 'Command failed',
      is_error: true,
    })

    expect(state.toolUses['tu_3'].status).toBe('error')
    expect(state.toolUses['tu_3'].isError).toBe(true)
  })
})

describe('reducePermissionRequest', () => {
  it('sets permission on state', () => {
    const { state, setState } = makeStore()

    reducePermissionRequest(setState, state, {
      kind: 'permission_request',
      tool_name: 'bash',
      description: 'Run rm -rf /',
    })

    expect(state.permission).not.toBeNull()
    expect(state.permission!.toolName).toBe('bash')
    expect(state.permission!.description).toBe('Run rm -rf /')
    expect(state.permission!.timestamp).toBeGreaterThan(0)
  })
})

describe('reducePermissionResponse', () => {
  it('clears permission', () => {
    const { state, setState } = makeStore()

    reducePermissionRequest(setState, state, {
      kind: 'permission_request',
      tool_name: 'bash',
      description: 'Run something',
    })
    expect(state.permission).not.toBeNull()

    reducePermissionResponse(setState, state, {
      kind: 'permission_response',
    })
    expect(state.permission).toBeNull()
  })
})

describe('reduceError', () => {
  it('creates system message with error block', () => {
    const { state, setState } = makeStore()

    reduceError(setState, state, {
      kind: 'error',
      text: 'Something broke',
    })

    expect(state.messages).toHaveLength(1)
    expect(state.messages[0].role).toBe('system')
    expect(state.messages[0].status).toBe('error')
    expect(state.messages[0].content).toHaveLength(1)
    expect(state.messages[0].content[0].type).toBe('error')
    expect(state.messages[0].content[0].text).toBe('Something broke')
    expect(state.streaming).toBeNull()
  })

  it('clears streaming cursor when error occurs during streaming', () => {
    const { state, setState } = makeStore()

    reduceAssistantDelta(setState, state, {
      kind: 'assistant_message_delta',
      text: 'partial',
    })
    expect(state.streaming).not.toBeNull()

    reduceError(setState, state, {
      kind: 'error',
      text: 'Connection lost',
    })
    expect(state.streaming).toBeNull()
    expect(state.messages).toHaveLength(2)
  })
})

describe('dispatchEvent', () => {
  beforeEach(() => resetMsgCounter())

  it('dispatches assistant_message_delta', () => {
    const { state, setState } = makeStore()

    dispatchEvent(setState, state, {
      kind: 'assistant_message_delta',
      text: 'Hi',
    })

    expect(state.messages).toHaveLength(1)
    expect(state.messages[0].content[0].text).toBe('Hi')
  })

  it('dispatches assistant_message_complete', () => {
    const { state, setState } = makeStore()

    dispatchEvent(setState, state, {
      kind: 'assistant_message_delta',
      text: 'Done',
    })
    dispatchEvent(setState, state, {
      kind: 'assistant_message_complete',
    })

    expect(state.messages[0].status).toBe('complete')
  })

  it('silently ignores unknown event kinds', () => {
    const { state, setState } = makeStore()

    dispatchEvent(setState, state, {
      kind: 'unknown',
      text: 'ignored',
    })

    expect(state.messages).toHaveLength(0)
  })

  it.each([
    'session_resumed',
    'system_info',
    'cancelled',
    'thinking_complete',
    'tool_result',
  ] as const)('silently ignores %s event kind', (kind) => {
    const { state, setState } = makeStore()

    dispatchEvent(setState, state, { kind, text: 'ignored' })

    expect(state.messages).toHaveLength(0)
  })
})
