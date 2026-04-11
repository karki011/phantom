/**
 * AI Engine Event Types
 * Used for progress indicators and observability
 *
 * @author Subash Karki
 */

export type GraphBuildPhase = 'layer1' | 'layer2';
export type GraphEventType =
  | 'graph:build:start'
  | 'graph:build:progress'
  | 'graph:build:complete'
  | 'graph:build:error'
  | 'graph:update:start'
  | 'graph:update:complete'
  | 'graph:stale';

export interface GraphBuildStartEvent {
  type: 'graph:build:start';
  projectId: string;
  phase: GraphBuildPhase;
  totalFiles: number;
  timestamp: number;
}

export interface GraphBuildProgressEvent {
  type: 'graph:build:progress';
  projectId: string;
  phase: GraphBuildPhase;
  current: number;
  total: number;
  currentFile: string;
  timestamp: number;
}

export interface GraphBuildCompleteEvent {
  type: 'graph:build:complete';
  projectId: string;
  phase: GraphBuildPhase;
  stats: {
    files: number;
    edges: number;
    durationMs: number;
  };
  timestamp: number;
}

export interface GraphBuildErrorEvent {
  type: 'graph:build:error';
  projectId: string;
  phase: GraphBuildPhase;
  error: string;
  file?: string;
  timestamp: number;
}

export interface GraphUpdateStartEvent {
  type: 'graph:update:start';
  projectId: string;
  changedFiles: string[];
  timestamp: number;
}

export interface GraphUpdateCompleteEvent {
  type: 'graph:update:complete';
  projectId: string;
  updatedNodes: number;
  updatedEdges: number;
  durationMs: number;
  timestamp: number;
}

export interface GraphStaleEvent {
  type: 'graph:stale';
  projectId: string;
  staleFiles: number;
  timestamp: number;
}

export type GraphEvent =
  | GraphBuildStartEvent
  | GraphBuildProgressEvent
  | GraphBuildCompleteEvent
  | GraphBuildErrorEvent
  | GraphUpdateStartEvent
  | GraphUpdateCompleteEvent
  | GraphStaleEvent;

/** Listener for graph events */
export type GraphEventListener = (event: GraphEvent) => void;
