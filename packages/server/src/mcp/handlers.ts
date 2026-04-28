/**
 * MCP Tool Handlers — Extracted logic for testability
 * Each handler takes a graphEngine-like interface and returns MCP content.
 * @author Subash Karki
 */
import { db, projects } from '@phantom-os/db';
import { eq } from 'drizzle-orm';
import type { GraphQuery, GoalInput } from '@phantom-os/ai-engine';
import type { BuildStatus } from '../services/graph-engine.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskStatusResult = BuildStatus;

/** Minimal interface for the graph engine — allows mocking in tests */
export interface GraphEngineAdapter {
  getQuery(projectId: string): GraphQuery | null;
  getStats(projectId: string): { projectId: string; fileCount: number; totalEdges: number; moduleCount: number; coverage: number; lastBuiltAt: number } | null;
  buildProject(projectId: string, repoPath: string): Promise<void>;
  getBuildStatus(projectId: string): TaskStatusResult;
}

/** Minimal interface for the orchestrator engine — allows mocking in tests */
export interface OrchestratorEngineAdapter {
  process(input: GoalInput): Promise<import('@phantom-os/ai-engine').OrchestratorResult>;
  getStrategies(projectId: string): Array<{ id: string; name: string; enabled: boolean; description: string }>;
  getHistory(projectId: string, limit?: number): Array<Record<string, unknown>>;
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
  const files = (result.files ?? []).map((f) => ({ path: f.path, relevance: result.scores.get(f.id) ?? 0 }));
  const edges = (result.edges ?? []).map((e) => ({ source: e.sourceId, target: e.targetId, type: e.type }));
  const modules = (result.modules ?? []).map((m) => m.name);

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
    directlyAffected: (result.direct ?? []).map((f) => f.path),
    transitivelyAffected: (result.transitive ?? []).map((f) => f.path),
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

// ---------------------------------------------------------------------------
// Orchestrator Handlers
// ---------------------------------------------------------------------------

export async function handleOrchestratorProcess(
  orchestrator: OrchestratorEngineAdapter,
  params: { projectId: string; goal: string; activeFiles?: string[]; hints?: GoalInput['hints'] },
): Promise<McpTextContent> {
  try {
    const result = await orchestrator.process({
      projectId: params.projectId,
      goal: params.goal,
      activeFiles: params.activeFiles,
      hints: params.hints,
    });

    return textResult({
      strategy: result.strategy,
      alternatives: result.alternatives,
      context: {
        files: result.context.files.slice(0, 15),
        blastRadius: result.context.blastRadius,
        relatedFiles: result.context.relatedFiles.slice(0, 10),
      },
      taskAssessment: {
        complexity: result.taskContext.complexity,
        risk: result.taskContext.risk,
        isAmbiguous: result.taskContext.isAmbiguous,
      },
      confidence: result.output.confidence,
      durationMs: result.totalDurationMs,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Orchestrator processing failed';
    return errorResult(message);
  }
}

export function handleOrchestratorStrategies(
  orchestrator: OrchestratorEngineAdapter,
  params: { projectId: string },
): McpTextContent {
  const strategies = orchestrator.getStrategies(params.projectId);
  if (strategies.length === 0) {
    return errorResult('No orchestrator available for this project. Ensure the graph is built first.');
  }
  return textResult({ strategies });
}

export function handleOrchestratorHistory(
  orchestrator: OrchestratorEngineAdapter,
  params: { projectId: string; limit?: number },
): McpTextContent {
  const history = orchestrator.getHistory(params.projectId, params.limit ?? 20);
  return textResult({ decisions: history, count: history.length });
}

// ---------------------------------------------------------------------------
// Composite Handler — phantom_before_edit
// ---------------------------------------------------------------------------

/**
 * Composite handler that combines graph context + blast radius + related files
 * and optionally runs the orchestrator — all in a single call.
 */
export async function handleBeforeEdit(
  engine: GraphEngineAdapter,
  orchestrator: OrchestratorEngineAdapter | undefined,
  params: { projectId: string; files: string[]; goal?: string },
): Promise<McpTextContent> {
  const query = engine.getQuery(params.projectId);
  if (!query) return errorResult('Project graph not found. Build the graph first.');

  // 1. Graph context for ALL files — merge results, keep highest relevance per path
  const mergedScores = new Map<string, number>();
  const allEdges: Array<{ source: string; target: string; type: string }> = [];
  const moduleSet = new Set<string>();

  for (const file of params.files) {
    const ctx = query.getContext(file, 2);
    for (const f of ctx.files ?? []) {
      const existing = mergedScores.get(f.path) ?? 0;
      const score = ctx.scores.get(f.id) ?? 0;
      if (score > existing) mergedScores.set(f.path, score);
    }
    for (const e of ctx.edges ?? []) {
      allEdges.push({ source: e.sourceId, target: e.targetId, type: e.type });
    }
    for (const m of ctx.modules ?? []) {
      moduleSet.add(m.name);
    }
  }

  const files = Array.from(mergedScores.entries())
    .map(([path, relevance]) => ({ path, relevance }))
    .sort((a, b) => b.relevance - a.relevance);

  // 2. Blast radius for ALL files — union affected, keep max impact score
  const directSet = new Set<string>();
  const transitiveSet = new Set<string>();
  let maxImpactScore = 0;

  for (const file of params.files) {
    const blast = query.getBlastRadius(file);
    for (const f of blast.direct ?? []) directSet.add(f.path);
    for (const f of blast.transitive ?? []) transitiveSet.add(f.path);
    if (blast.impactScore > maxImpactScore) maxImpactScore = blast.impactScore;
  }

  // 3. Related files
  const related = query.getRelatedFiles(params.files, 1);
  const relatedFiles = related.map((f) => f.path);

  // 4. Optional orchestrator assessment
  let strategy: Record<string, unknown> | undefined;
  if (params.goal && orchestrator) {
    try {
      const result = await orchestrator.process({
        projectId: params.projectId,
        goal: params.goal,
        activeFiles: params.files,
      });
      strategy = {
        name: result.strategy,
        alternatives: result.alternatives,
        complexity: result.taskContext.complexity,
        risk: result.taskContext.risk,
        confidence: result.output.confidence,
      };
    } catch {
      // Orchestrator may not have context for this project — skip gracefully
    }
  }

  return textResult({
    context: { files, edges: allEdges, modules: Array.from(moduleSet) },
    blastRadius: {
      directlyAffected: Array.from(directSet),
      transitivelyAffected: Array.from(transitiveSet),
      maxImpactScore,
    },
    relatedFiles,
    ...(strategy ? { strategy } : {}),
  });
}

// ---------------------------------------------------------------------------
// Evaluation Handler — Heuristic quality assessment (Task 13)
// ---------------------------------------------------------------------------

/**
 * Evaluate a strategy output for quality using heuristic signals.
 *
 * MCP SDK v1.29 does not support Sampling (server.createMessage), so we
 * cannot delegate evaluation to Claude via the existing connection. Instead,
 * this handler uses lightweight heuristics: output length, structural signals,
 * and goal-keyword overlap to produce a confidence score and feedback.
 *
 * This is intentionally simple — the value is in surfacing a "second opinion"
 * prompt, not in replacing human or LLM judgment.
 */
export function handleEvaluateOutput(
  params: { goal: string; output: string },
): McpTextContent {
  const { goal, output } = params;

  if (!output || output.trim().length === 0) {
    return textResult({ confidence: 0, feedback: 'Empty output — no content to evaluate.' });
  }

  let confidence = 0.5;
  const feedback: string[] = [];

  // Signal 1: Output length — very short outputs are suspicious
  const wordCount = output.split(/\s+/).length;
  if (wordCount < 10) {
    confidence -= 0.15;
    feedback.push('Output is very short — may lack detail.');
  } else if (wordCount > 50) {
    confidence += 0.1;
    feedback.push('Output has good depth.');
  }

  // Signal 2: Goal-keyword overlap — does the output reference the goal?
  const goalWords = goal.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
  const outputLower = output.toLowerCase();
  const matches = goalWords.filter((w) => outputLower.includes(w));
  const overlapRatio = goalWords.length > 0 ? matches.length / goalWords.length : 0;

  if (overlapRatio > 0.5) {
    confidence += 0.15;
    feedback.push('Output aligns well with goal keywords.');
  } else if (overlapRatio < 0.2) {
    confidence -= 0.1;
    feedback.push('Output has low keyword overlap with the goal — may be off-topic.');
  }

  // Signal 3: Structural indicators — code blocks, lists, file paths
  const hasCodeBlock = /```/.test(output);
  const hasFilePaths = /[\w/-]+\.\w{1,5}/.test(output);
  const hasListItems = /^[-*•]\s/m.test(output);

  if (hasCodeBlock || hasFilePaths) {
    confidence += 0.1;
    feedback.push('Output contains concrete references (code/files).');
  }
  if (hasListItems) {
    confidence += 0.05;
    feedback.push('Output is well-structured with list items.');
  }

  // Clamp to [0, 1]
  confidence = Math.max(0, Math.min(1, Math.round(confidence * 100) / 100));

  return textResult({
    confidence,
    feedback: feedback.join(' ') || 'No strong quality signals detected.',
    note: 'Heuristic evaluation — MCP Sampling not available in SDK v1.29. Use Claude judgment for nuanced assessment.',
  });
}

// ---------------------------------------------------------------------------
// Task Status Handler
// ---------------------------------------------------------------------------

/**
 * Returns the build lifecycle status for a project.
 * Clients use this to poll after a fire-and-forget phantom_graph_build call.
 *
 * Response shape: { projectId, status: 'idle'|'building'|'ready'|'error',
 *                   startedAt?, finishedAt?, durationMs?, error? }
 */
export function handleTaskStatus(
  engine: GraphEngineAdapter,
  params: { projectId: string },
): McpTextContent {
  const status = engine.getBuildStatus(params.projectId);
  return textResult(status);
}
