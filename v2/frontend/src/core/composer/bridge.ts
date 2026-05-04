// Author: Subash Karki

// ---------------------------------------------------------------------------
// Wails Event Bridge — connects Go-side stream events to SolidJS stores
// ---------------------------------------------------------------------------

import { produce } from 'solid-js/store'
import { getOrCreateSessionStore } from './store'
import { dispatchEvent } from './reducers'
import { refreshGlobalSignals } from './signals'
import type { StreamEvent } from './types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WailsEventListener {
  channel: string
  unsub: () => void
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

const listeners = new Map<string, WailsEventListener>()

// ---------------------------------------------------------------------------
// Runtime accessor
// ---------------------------------------------------------------------------

const getRuntime = (): Window['runtime'] => window.runtime

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Subscribe to Wails events for a composer session.
 * Incoming `StreamEvent` payloads are routed through the reducer pipeline
 * into the session's SolidJS store, then global signals are refreshed.
 *
 * No-op if the session is already connected.
 */
export const connectSession = (sessionId: string, worktreeId: string): void => {
  if (listeners.has(sessionId)) return

  const runtime = getRuntime()
  if (!runtime?.EventsOn) return

  const [state, setStore] = getOrCreateSessionStore(sessionId, worktreeId)
  const channel = `composer:event:${sessionId}`

  const unsub = runtime.EventsOn(channel, (...args: unknown[]) => {
    const ev = args[0] as StreamEvent

    // Bridge SetStoreFunction → reducer's SetState via produce
    const setState = (fn: (s: typeof state) => void) => setStore(produce(fn))

    dispatchEvent(setState, state, ev)
    refreshGlobalSignals()
  })

  listeners.set(sessionId, { channel, unsub })
}

/**
 * Unsubscribe from Wails events for a session and remove the listener entry.
 */
export const disconnectSession = (sessionId: string): void => {
  const entry = listeners.get(sessionId)
  if (!entry) return

  entry.unsub()
  listeners.delete(sessionId)
}

/**
 * Tear down all active session listeners.
 */
export const disconnectAll = (): void => {
  for (const sessionId of Array.from(listeners.keys())) {
    disconnectSession(sessionId)
  }
}
