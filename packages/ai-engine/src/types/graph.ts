/**
 * Graph Data Model Types
 * Layer 1: File-level nodes and edges
 * Layer 2: AST-enriched nodes (functions, classes, components)
 *
 * @author Subash Karki
 */

// ---------------------------------------------------------------------------
// Node Types
// ---------------------------------------------------------------------------

export type NodeType = 'file' | 'module' | 'function' | 'class' | 'type' | 'component';

export interface BaseNode {
  id: string;
  type: NodeType;
  projectId: string;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

/** Layer 1: A source file in the project */
export interface FileNode extends BaseNode {
  type: 'file';
  path: string;
  /** File extension without dot (ts, tsx, json, md, etc.) */
  extension: string;
  size: number;
  contentHash: string;
  lastModified: number;
}

/** Layer 1: An external npm module dependency */
export interface ModuleNode extends BaseNode {
  type: 'module';
  name: string;
  version: string;
  isExternal: true;
}

/** Layer 2: A function/method extracted from AST */
export interface FunctionNode extends BaseNode {
  type: 'function';
  name: string;
  fileId: string;
  params: string[];
  returnType: string | null;
  lineStart: number;
  lineEnd: number;
  isExported: boolean;
  complexity: number;
}

/** Layer 2: A class extracted from AST */
export interface ClassNode extends BaseNode {
  type: 'class';
  name: string;
  fileId: string;
  methods: string[];
  properties: string[];
  implements: string[];
  lineStart: number;
  lineEnd: number;
  isExported: boolean;
}

/** Layer 2: A type/interface/enum extracted from AST */
export interface TypeDefinitionNode extends BaseNode {
  type: 'type';
  name: string;
  fileId: string;
  kind: 'interface' | 'type' | 'enum';
  fields: string[];
  lineStart: number;
  lineEnd: number;
  isExported: boolean;
}

/** Layer 2: A React component extracted from AST */
export interface ComponentNode extends BaseNode {
  type: 'component';
  name: string;
  fileId: string;
  props: string[];
  hooks: string[];
  lineStart: number;
  lineEnd: number;
  isExported: boolean;
}

export type GraphNode =
  | FileNode
  | ModuleNode
  | FunctionNode
  | ClassNode
  | TypeDefinitionNode
  | ComponentNode;

// ---------------------------------------------------------------------------
// Edge Types
// ---------------------------------------------------------------------------

export type EdgeType =
  | 'imports'
  | 'depends_on'
  | 'exports'
  | 'co_changed'
  | 'calls'
  | 'implements'
  | 'renders'
  | 'uses_hook';

export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: EdgeType;
  projectId: string;
  /** Edge weight (e.g., co-change frequency) */
  weight: number;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Graph Query Types
// ---------------------------------------------------------------------------

export interface GraphStats {
  projectId: string;
  totalNodes: number;
  totalEdges: number;
  fileCount: number;
  moduleCount: number;
  layer2Count: number;
  lastBuiltAt: number;
  lastUpdatedAt: number;
  coverage: number;
}

export interface ContextResult {
  /** Primary files relevant to the query */
  files: FileNode[];
  /** Edges connecting the relevant files */
  edges: GraphEdge[];
  /** Modules depended on by relevant files */
  modules: ModuleNode[];
  /** Relevance score (0-1) for each file */
  scores: Map<string, number>;
}

export interface BlastRadiusResult {
  /** Files directly affected */
  direct: FileNode[];
  /** Files transitively affected */
  transitive: FileNode[];
  /** Total impact score */
  impactScore: number;
}
