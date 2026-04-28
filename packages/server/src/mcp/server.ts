/**
 * PhantomOS MCP Server — Exposes code graph tools to external AI agents
 * Runs as stdio transport alongside the Hono HTTP server
 * @author Subash Karki
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { graphEngine } from '../services/graph-engine.js';
import { orchestratorEngine } from '../services/orchestrator-engine.js';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// MCP Server Instructions — injected into Claude's system prompt on connect
// ---------------------------------------------------------------------------

const MCP_INSTRUCTIONS = `## PhantomOS AI Engine — Automatic Codebase Intelligence

You have access to a dependency-graph-backed AI engine that tracks every file relationship,
predicts blast radius of changes, and learns from past decisions.

### REQUIRED WORKFLOW
Before modifying ANY file, call \`phantom_before_edit\` with the file paths.
This gives you everything in one call: dependencies, blast radius, related files, and strategy guidance.

### AVAILABLE TOOLS
- phantom_before_edit: ONE call gives you everything (context + blast radius + strategy). Use this first.
- phantom_graph_context: Deep-dive into a specific file's dependencies
- phantom_graph_blast_radius: What breaks if this file changes
- phantom_graph_related: Find all files involved in a feature
- phantom_graph_stats: Graph coverage statistics
- phantom_graph_path: Shortest dependency path between two files
- phantom_orchestrator_process: Route complex goals through the strategy pipeline
- phantom_orchestrator_history: Learn from past decisions

### WHAT YOU GET
The engine automatically tracks your decisions and outcomes. Over time, it learns
which approaches work for this codebase and warns you about approaches that failed before.`;
import {
  handleGraphContext,
  handleBlastRadius,
  handleRelated,
  handleStats,
  handlePath,
  handleBuild,
  handleListProjects,
  handleOrchestratorProcess,
  handleOrchestratorStrategies,
  handleOrchestratorHistory,
  handleTaskStatus,
  handleBeforeEdit,
  handleEvaluateOutput,
} from './handlers.js';
import type { GraphEngineAdapter, OrchestratorEngineAdapter } from './handlers.js';
import type { GraphEvent } from '@phantom-os/ai-engine';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let mcpServer: McpServer | null = null;
let transport: StdioServerTransport | null = null;

// ---------------------------------------------------------------------------
// Input Schemas
// ---------------------------------------------------------------------------

const ContextInput = z.object({
  projectId: z.string().describe('Project ID'),
  file: z.string().describe('File path relative to project root'),
  depth: z.number().optional().describe('BFS traversal depth (default 2)'),
});

const BlastRadiusInput = z.object({
  projectId: z.string().describe('Project ID'),
  file: z.string().describe('File path to analyze'),
});

const RelatedInput = z.object({
  projectId: z.string().describe('Project ID'),
  files: z.array(z.string()).describe('Array of file paths to find related files for'),
  depth: z.number().optional().describe('Neighbor traversal depth (default 1)'),
});

const ProjectIdInput = z.object({
  projectId: z.string().describe('Project ID'),
});

const PathInput = z.object({
  projectId: z.string().describe('Project ID'),
  from: z.string().describe('Source file path'),
  to: z.string().describe('Target file path'),
});

const OrchestratorProcessInput = z.object({
  projectId: z.string().describe('Project ID'),
  goal: z.string().describe('What the user wants to accomplish'),
  activeFiles: z.array(z.string()).optional().describe('Files the user is currently working with'),
  hints: z.object({
    isAmbiguous: z.boolean().optional(),
    isCritical: z.boolean().optional(),
    estimatedComplexity: z.enum(['simple', 'moderate', 'complex', 'critical']).optional(),
  }).optional().describe('Optional hints about the task'),
});

const OrchestratorHistoryInput = z.object({
  projectId: z.string().describe('Project ID'),
  limit: z.number().optional().describe('Max results (default 20)'),
});

const BeforeEditInput = z.object({
  projectId: z.string().describe('Project ID'),
  files: z.array(z.string()).describe('File paths you plan to modify'),
  goal: z.string().optional().describe('What you are trying to accomplish'),
});

const EvaluateOutputInput = z.object({
  goal: z.string().describe('The goal or task the output was generated for'),
  output: z.string().describe('The strategy output to evaluate'),
});

// ---------------------------------------------------------------------------
// Context Push — Server-to-client notifications via MCP logging
// ---------------------------------------------------------------------------

/**
 * Push a context update to the connected Claude client via MCP logging notification.
 *
 * MCP SDK v1.29 does not support Channels or Sampling. We use sendLoggingMessage
 * (notifications/message) as the push mechanism — Claude Code surfaces these
 * as contextual messages during the session.
 *
 * Fail-safe: swallows errors so graph events never crash the MCP server.
 */
export function pushContextUpdate(server: McpServer, message: string, level: 'info' | 'notice' | 'warning' = 'info'): void {
  try {
    if (!server.isConnected()) return;
    void server.sendLoggingMessage({
      level,
      logger: 'phantom-ai',
      data: message,
    });
  } catch {
    // Swallow — push is best-effort, never block
  }
}

/**
 * Wire graph engine events to push context updates to the MCP client.
 * Call after creating the MCP server and before/after connecting the transport.
 */
export function wireGraphEventsToPush(server: McpServer, eventSubscriber: (listener: (event: GraphEvent) => void) => () => void): () => void {
  return eventSubscriber((event: GraphEvent) => {
    switch (event.type) {
      case 'graph:build:complete':
        pushContextUpdate(
          server,
          `Graph rebuilt for ${event.projectId}. ${event.stats.files} files indexed. Graph context is now fresh.`,
        );
        break;
      case 'graph:build:error':
        pushContextUpdate(
          server,
          `Graph build failed for ${event.projectId}: ${event.error}`,
          'warning',
        );
        break;
      case 'knowledge:pattern:discovered':
        pushContextUpdate(
          server,
          `New pattern discovered: ${event.patternName} (success rate: ${Math.round(event.successRate * 100)}%, seen ${event.frequency} times)`,
          'notice',
        );
        break;
      default:
        break;
    }
  });
}

// ---------------------------------------------------------------------------
// Tool Registration
// ---------------------------------------------------------------------------

/**
 * Register all phantom_* tools on the MCP server.
 *
 * NOTE: The MCP SDK's registerTool generics cause TS2589 (infinite type depth)
 * when combined with zod v3 schemas in strict mode. Callbacks are cast to `any`
 * to work around this — runtime validation is still enforced by the SDK via the
 * inputSchema zod objects. This is a known SDK issue.
 */
function registerTools(server: McpServer, engine: GraphEngineAdapter, orchestrator?: OrchestratorEngineAdapter, scopedProjectId?: string): void {
  // Cast to `any` to work around TS2589 (infinite type depth) from the MCP SDK's
  // registerTool generics + zod v3. Runtime validation is still enforced by the SDK.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reg = server.registerTool.bind(server) as any;

  // When scoped to a project, auto-inject projectId; otherwise require it as input
  const pid = (args: { projectId?: string }) => scopedProjectId ?? args.projectId ?? '';

  // Wrap handlers with rich logging — shows in PhantomOS server terminal
  const withLog = <T extends (...a: any[]) => any>(toolName: string, handler: T): T => {
    return (async (...args: Parameters<T>) => {
      const start = Date.now();
      logger.info('AI Engine', `🧠 Tool called: ${toolName}`);
      try {
        const result = await handler(...args);
        const ms = Date.now() - start;
        const content = result?.content?.[0]?.text;
        const preview = content ? summarizeResult(toolName, content) : '';
        logger.info('AI Engine', `🧠 Tool done: ${toolName} (${ms}ms)${preview}`);
        return result;
      } catch (err) {
        const ms = Date.now() - start;
        logger.error('AI Engine', `🧠 Tool failed: ${toolName} (${ms}ms) — ${err}`);
        throw err;
      }
    }) as T;
  };

  // Summarize tool results for the log (keep it short)
  const summarizeResult = (tool: string, content: string): string => {
    try {
      const data = JSON.parse(content);
      if (tool === 'phantom_before_edit') {
        const files = data.context?.length ?? 0;
        const impact = data.blastRadius?.impactScore ?? 0;
        const strategy = data.strategy?.name ?? 'none';
        return ` → ${files} files, impact=${(impact * 100).toFixed(0)}%, strategy=${strategy}`;
      }
      if (tool === 'phantom_graph_context') {
        return ` → ${data.files?.length ?? 0} related files`;
      }
      if (tool === 'phantom_graph_blast_radius') {
        return ` → ${data.directlyAffected?.length ?? 0} direct, ${data.transitivelyAffected?.length ?? 0} transitive`;
      }
      if (tool === 'phantom_orchestrator_process') {
        return ` → strategy=${data.strategy?.name}, confidence=${data.output?.confidence}`;
      }
      return '';
    } catch { return ''; }
  };

  /**
   * When scoped, strip projectId from input schemas so Claude doesn't need to provide it.
   * Returns the scoped schema if projectId is set, otherwise the full schema.
   */
  function schema<T extends z.ZodRawShape>(fullSchema: z.ZodObject<T>, scopedFields?: z.ZodRawShape): z.ZodObject<any> {
    if (!scopedProjectId) return fullSchema;
    return z.object(scopedFields ?? {});
  }

  reg(
    'phantom_before_edit',
    {
      description: 'REQUIRED before modifying files. Returns graph context, blast radius, related files, and strategy recommendation in one call.',
      inputSchema: schema(BeforeEditInput, {
        files: z.array(z.string()).describe('File paths you plan to modify'),
        goal: z.string().optional().describe('What you are trying to accomplish'),
      }),
    },
    withLog('phantom_before_edit', async (args: z.infer<typeof BeforeEditInput>) =>
      handleBeforeEdit(engine, orchestrator, { projectId: pid(args), files: args.files, goal: args.goal })),
  );

  reg(
    'phantom_graph_context',
    {
      description: 'Get files related to a specific file with relevance scores and dependency edges. Use BEFORE modifying code to understand what depends on or is depended on by a file.',
      inputSchema: schema(ContextInput, {
        file: z.string().describe('File path relative to project root'),
        depth: z.number().optional().describe('BFS traversal depth (default 2)'),
      }),
    },
    withLog('phantom_graph_context', async (args: z.infer<typeof ContextInput>) =>
      handleGraphContext(engine, { projectId: pid(args), file: args.file, depth: args.depth ?? 2 })),
  );

  reg(
    'phantom_graph_blast_radius',
    {
      description: 'Predict which files will break if a given file is changed. Use BEFORE refactoring to assess risk and scope of changes.',
      inputSchema: schema(BlastRadiusInput, {
        file: z.string().describe('File path to analyze'),
      }),
    },
    withLog('phantom_graph_blast_radius', async (args: z.infer<typeof BlastRadiusInput>) =>
      handleBlastRadius(engine, { projectId: pid(args), file: args.file })),
  );

  reg(
    'phantom_graph_related',
    {
      description: 'Find files related to a set of files. Use when exploring unfamiliar code areas or identifying all files involved in a feature.',
      inputSchema: schema(RelatedInput, {
        files: z.array(z.string()).describe('Array of file paths'),
        depth: z.number().optional().describe('Neighbor traversal depth (default 1)'),
      }),
    },
    withLog('phantom_graph_related', async (args: z.infer<typeof RelatedInput>) =>
      handleRelated(engine, { projectId: pid(args), files: args.files, depth: args.depth ?? 1 })),
  );

  reg(
    'phantom_graph_stats',
    {
      description: 'Get graph statistics -- file count, edge count, module count, coverage. Use to understand project size and graph health.',
      inputSchema: schema(ProjectIdInput),
    },
    async (args: z.infer<typeof ProjectIdInput>) =>
      handleStats(engine, { projectId: pid(args) }),
  );

  reg(
    'phantom_graph_path',
    {
      description: 'Find the shortest dependency path between two files. Use to understand how distant parts of the codebase connect.',
      inputSchema: schema(PathInput, {
        from: z.string().describe('Source file path'),
        to: z.string().describe('Target file path'),
      }),
    },
    async (args: z.infer<typeof PathInput>) =>
      handlePath(engine, { projectId: pid(args), from: args.from, to: args.to }),
  );

  reg(
    'phantom_graph_build',
    {
      description: 'Trigger a graph rebuild after major changes (new packages, large refactors). Returns immediately while build runs in background.',
      inputSchema: schema(ProjectIdInput),
    },
    async (args: z.infer<typeof ProjectIdInput>) =>
      handleBuild(engine, { projectId: pid(args) }),
  );

  reg(
    'phantom_task_status',
    {
      description: 'Poll the build lifecycle status of a project graph. Use after phantom_graph_build to know when the graph is ready to query. Returns { projectId, status: "idle"|"building"|"ready"|"error", startedAt?, finishedAt?, durationMs?, error? }.',
      inputSchema: schema(ProjectIdInput),
    },
    async (args: z.infer<typeof ProjectIdInput>) =>
      handleTaskStatus(engine, { projectId: pid(args) }),
  );

  reg(
    'phantom_list_projects',
    { description: 'List all known projects with their IDs and repo paths.' },
    async () => handleListProjects(),
  );

  // ---------------------------------------------------------------------------
  // Evaluation Tool — AI-powered output quality assessment (Task 13)
  //
  // MCP SDK v1.29 does not support Sampling (server.createMessage). Instead,
  // we expose a tool that Claude calls to request evaluation. The handler
  // performs a lightweight heuristic assessment without requiring an API key.
  // ---------------------------------------------------------------------------

  reg(
    'phantom_evaluate_output',
    {
      description: 'Evaluate a strategy output for quality. Returns a confidence score (0–1) and brief feedback. Use after phantom_orchestrator_process to assess result quality.',
      inputSchema: schema(EvaluateOutputInput, {
        goal: z.string().describe('The goal or task the output was generated for'),
        output: z.string().describe('The strategy output to evaluate'),
      }),
    },
    async (args: z.infer<typeof EvaluateOutputInput>) =>
      handleEvaluateOutput({ goal: args.goal, output: args.output }),
  );

  // ---------------------------------------------------------------------------
  // Orchestrator Tools — Strategy pipeline for intelligent reasoning
  // ---------------------------------------------------------------------------

  if (orchestrator) {
    reg(
      'phantom_orchestrator_process',
      {
        description: 'Route a goal through the AI strategy pipeline. Analyzes task complexity, selects the best reasoning strategy (Direct, Advisor, Self-Refine, Tree-of-Thought, Debate, Graph-of-Thought), gathers graph context, and returns strategy-enriched results. Call this BEFORE starting complex tasks to get intelligent context and strategy recommendations.',
        inputSchema: schema(OrchestratorProcessInput, {
          goal: z.string().describe('What the user wants to accomplish'),
          activeFiles: z.array(z.string()).optional().describe('Files currently being worked with'),
          hints: z.object({
            isAmbiguous: z.boolean().optional(),
            isCritical: z.boolean().optional(),
            estimatedComplexity: z.enum(['simple', 'moderate', 'complex', 'critical']).optional(),
          }).optional().describe('Optional task hints'),
        }),
      },
      withLog('phantom_orchestrator_process', async (args: z.infer<typeof OrchestratorProcessInput>) =>
        handleOrchestratorProcess(orchestrator, { projectId: pid(args), goal: args.goal, activeFiles: args.activeFiles, hints: args.hints })),
    );

    reg(
      'phantom_orchestrator_strategies',
      {
        description: 'List all available reasoning strategies and whether they are enabled.',
        inputSchema: schema(ProjectIdInput),
      },
      async (args: z.infer<typeof ProjectIdInput>) =>
        handleOrchestratorStrategies(orchestrator, { projectId: pid(args) }),
    );

    reg(
      'phantom_orchestrator_history',
      {
        description: 'View past orchestrator decisions, strategies used, and outcomes. Use to understand what reasoning approaches worked for similar tasks.',
        inputSchema: schema(OrchestratorHistoryInput, {
          limit: z.number().optional().describe('Max results (default 20)'),
        }),
      },
      async (args: z.infer<typeof OrchestratorHistoryInput>) =>
        handleOrchestratorHistory(orchestrator, { projectId: pid(args), limit: args.limit }),
    );
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Start the MCP server on stdio transport.
 * Non-blocking — failure is logged but does not throw.
 */
export async function startMcpServer(): Promise<void> {
  if (mcpServer) {
    logger.warn('MCP', 'MCP server already running');
    return;
  }

  mcpServer = new McpServer(
    { name: 'phantom-os', version: '1.0.0' },
    { instructions: MCP_INSTRUCTIONS },
  );

  registerTools(mcpServer, graphEngine, orchestratorEngine);

  transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  logger.info('MCP', 'MCP server started on stdio transport (with orchestrator)');
}

/**
 * Gracefully stop the MCP server.
 */
export async function stopMcpServer(): Promise<void> {
  if (mcpServer) {
    await mcpServer.close();
    mcpServer = null;
    transport = null;
    logger.info('MCP', 'MCP server stopped');
  }
}

/**
 * Create a standalone MCP server instance with custom engine adapter.
 * When scopedProjectId is provided, tools auto-inject that projectId
 * and don't require it as input — simplifies Claude's tool calls.
 */
export function createMcpServer(engine: GraphEngineAdapter, scopedProjectId?: string, orchestrator?: OrchestratorEngineAdapter): McpServer {
  const server = new McpServer(
    { name: 'phantom-os', version: '1.0.0' },
    { instructions: MCP_INSTRUCTIONS },
  );

  registerTools(server, engine, orchestrator, scopedProjectId);
  return server;
}
