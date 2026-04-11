/**
 * MCP Tool Handlers — Extracted logic for testability
 * Each handler takes a graphEngine-like interface and returns MCP content.
 * @author Subash Karki
 */
import { db, projects } from '@phantom-os/db';
import { eq } from 'drizzle-orm';
import type { GraphQuery } from '@phantom-os/ai-engine';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal interface for the graph engine — allows mocking in tests */
export interface GraphEngineAdapter {
  getQuery(projectId: string): GraphQuery | null;
  getStats(projectId: string): { projectId: string; fileCount: number; totalEdges: number; moduleCount: number; coverage: number; lastBuiltAt: number } | null;
  buildProject(projectId: string, repoPath: string): Promise<void>;
}

/**
 * MCP CallToolResult-compatible return type.
 * Uses index signature to satisfy the SDK's `[x: string]: unknown` requirement.
 */
export interface McpTextContent {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function textResult(data: unknown): McpTextContent {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(message: string): McpTextContent {
  return { content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }], isError: true };
}

// ---------------------------------------------------------------------------
// Tool Handlers
// ---------------------------------------------------------------------------

export function handleGraphContext(
  engine: GraphEngineAdapter,
  params: { projectId: string; file: string; depth?: number },
): McpTextContent {
  const query = engine.getQuery(params.projectId);
  if (!query) return errorResult('Project graph not found. Build the graph first.');

  const result = query.getContext(params.file, params.depth ?? 2);
  const files = result.files.map((f) => ({ path: f.path, relevance: result.scores.get(f.id) ?? 0 }));
  const edges = result.edges.map((e) => ({ source: e.sourceId, target: e.targetId, type: e.type }));
  const modules = result.modules.map((m) => m.name);

  return textResult({ files, edges, modules });
}

export function handleBlastRadius(
  engine: GraphEngineAdapter,
  params: { projectId: string; file: string },
): McpTextContent {
  const query = engine.getQuery(params.projectId);
  if (!query) return errorResult('Project graph not found. Build the graph first.');

  const result = query.getBlastRadius(params.file);
  return textResult({
    directlyAffected: result.direct.map((f) => f.path),
    transitivelyAffected: result.transitive.map((f) => f.path),
    impactScore: result.impactScore,
  });
}

export function handleRelated(
  engine: GraphEngineAdapter,
  params: { projectId: string; files: string[]; depth?: number },
): McpTextContent {
  const query = engine.getQuery(params.projectId);
  if (!query) return errorResult('Project graph not found. Build the graph first.');

  const result = query.getRelatedFiles(params.files, params.depth ?? 1);
  return textResult({ relatedFiles: result.map((f) => f.path) });
}

export function handleStats(
  engine: GraphEngineAdapter,
  params: { projectId: string },
): McpTextContent {
  const stats = engine.getStats(params.projectId);
  if (!stats) return errorResult('Project graph not found. Build the graph first.');

  return textResult({
    files: stats.fileCount,
    edges: stats.totalEdges,
    modules: stats.moduleCount,
    coverage: stats.coverage,
    lastBuiltAt: stats.lastBuiltAt,
  });
}

export function handlePath(
  engine: GraphEngineAdapter,
  params: { projectId: string; from: string; to: string },
): McpTextContent {
  const query = engine.getQuery(params.projectId);
  if (!query) return errorResult('Project graph not found. Build the graph first.');

  const result = query.findPath(params.from, params.to);
  return textResult({
    path: result.map((f) => f.path),
    length: result.length,
  });
}

export function handleBuild(
  engine: GraphEngineAdapter,
  params: { projectId: string },
): McpTextContent {
  const project = db.select().from(projects).where(eq(projects.id, params.projectId)).get();
  if (!project) return errorResult('Project not found in database.');

  // Fire-and-forget — don't await
  void engine.buildProject(params.projectId, project.repoPath);

  return textResult({ status: 'building', message: `Graph build started for ${params.projectId}` });
}

export function handleListProjects(): McpTextContent {
  const rows = db.select().from(projects).all();
  return textResult({
    projects: rows.map((p) => ({
      id: p.id,
      name: p.name,
      repoPath: p.repoPath,
    })),
  });
}
