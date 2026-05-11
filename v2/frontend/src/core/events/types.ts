// Author: Subash Karki

// Event type registry — single source of truth for event names and payloads.
// Mirrors constants defined in internal/app/events.go (and scattered const blocks).
// Full codegen is deferred; keep this file in sync with Go changes manually.

import { onWailsEvent } from './index';

// ---------------------------------------------------------------------------
// Payload shapes
// ---------------------------------------------------------------------------

export interface PRMergePayload {
  worktreeId: string;
  prNumber: number;
  autoMerge?: boolean;
}

export interface MergeFailedPayload {
  worktreeId: string;
  prNumber: number;
  message: string;
}

export interface TerminalSessionLinkedPayload {
  paneId: string;
  sessionId: string;
  sessionName?: string;
}

export interface TerminalSessionUnlinkedPayload {
  paneId: string;
  sessionId: string;
}

export interface TerminalActivityPayload {
  pane_id: string;
  session_id: string;
  summary: string;
}

export interface ProviderChangedPayload {
  name: string;
  display_name: string;
}

export interface SessionForkedPayload {
  session_id: string;
  parent_session_id: string;
}

export interface MCPRegistrationFailedPayload {
  phase: 'register' | 'enable-projects';
  error: string;
  hint?: string;
}

export interface EmbeddingDownloadProgressPayload {
  file: string;
  percent: number;
  totalMB: number;
}

export interface EmbeddingSetupFailedPayload {
  error: string;
}

export interface JournalEnrichedPayload {
  date: string;
  project: string;
}

// ---------------------------------------------------------------------------
// Event registry — maps event name → payload type
// ---------------------------------------------------------------------------

/**
 * Complete registry of typed Phantom events.
 * Key   = event name string (matches Go constant value)
 * Value = payload type received by the frontend handler
 */
export interface PhantomEvents {
  // App lifecycle
  'app:ready': Record<string, unknown>;
  'health:pulse': unknown;
  'ws:status': unknown;

  // Session lifecycle
  'session:new': unknown;
  'session:update': unknown;
  'session:end': unknown;
  'session:stale': unknown;
  'session:context': unknown;
  'session:forked': SessionForkedPayload;

  // Tasks
  'task:new': unknown;
  'task:update': unknown;

  // Activity
  'activity': unknown;

  // JSONL scanning
  'jsonl:scan-complete': unknown;
  'jsonl:rescan': unknown;

  // Terminal
  'terminal:data': string; // base64-encoded bytes
  'terminal:exit': { sessionId: string };
  'terminal:session-linked': TerminalSessionLinkedPayload;
  'terminal:session-unlinked': TerminalSessionUnlinkedPayload;
  'terminal:activity': TerminalActivityPayload;

  // Git
  'git:status': void;
  'git:branch-changed': void;

  // Worktrees
  'worktree:created': void;
  'worktree:removed': void;
  'worktree:updated': void;

  // Pull requests
  'pr:created': unknown;
  'pr:updated': unknown; // git.PrStatus | null
  'prs:list-updated': unknown[]; // git.PrStatus[]
  'pr:merging': PRMergePayload;
  'pr:merged': PRMergePayload;
  'pr:merge-failed': MergeFailedPayload;

  // CI
  'ci:updated': unknown[]; // git.CiRun[]

  // MCP
  'mcp:registration-failed': MCPRegistrationFailedPayload;

  // Conflict detection
  'conflict:repo': unknown;
  'conflict:file': unknown;

  // Hook relay
  'hook:tool-event': unknown;

  // Provider
  'provider:changed': ProviderChangedPayload;
  'provider:reload': void;

  // Embeddings
  'embedding:download-progress': EmbeddingDownloadProgressPayload;
  'embedding:setup-complete': void;
  'embedding:setup-failed': EmbeddingSetupFailedPayload;

  // Journal
  'journal:enriched': JournalEnrichedPayload;

  // Projects
  'project:created': string; // projectId
}

// ---------------------------------------------------------------------------
// Type-safe listener helper
// ---------------------------------------------------------------------------

/**
 * Subscribe to a typed Phantom event. Automatically unsubscribes on component
 * cleanup (delegates to onWailsEvent which calls Solid's onCleanup internally).
 *
 * @example
 * onPhantomEvent('git:status', () => refetchStatus());
 * onPhantomEvent('pr:merging', ({ worktreeId }) => setMerging(worktreeId));
 */
export function onPhantomEvent<K extends keyof PhantomEvents>(
  event: K,
  handler: (data: PhantomEvents[K]) => void,
): void {
  onWailsEvent<PhantomEvents[K]>(event, handler);
}
