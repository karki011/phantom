/**
 * PhantomOS MCP Server — Exposes code graph tools to external AI agents
 * Runs as stdio transport alongside the Hono HTTP server
 * @author Subash Karki
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { graphEngine } from '../services/graph-engine.js';
import { logger } from '../logger.js';
import {
  handleGraphContext,
  handleBlastRadius,
  handleRelated,
  handleStats,
  handlePath,
  handleBuild,
  handleListProjects,
} from './handlers.js';
import type { GraphEngineAdapter } from './handlers.js';

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
function registerTools(server: McpServer, engine: GraphEngineAdapter): void {
  /**
   * Helper to register a tool while avoiding TS2589 (infinite type depth)
   * caused by the MCP SDK's registerTool generics + zod v3 schema inference.
   * Runtime validation is still enforced by the SDK via the zod inputSchema.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reg = server.registerTool.bind(server) as any;

  reg(
    'phantom_graph_context',
    {
      description: 'Get relevant code context for a file — returns related files, edges, and modules from the dependency graph.',
      inputSchema: ContextInput,
    },
    async (args: z.infer<typeof ContextInput>) =>
      handleGraphContext(engine, { projectId: args.projectId, file: args.file, depth: args.depth ?? 2 }),
  );

  reg(
    'phantom_graph_blast_radius',
    {
      description: 'Analyze the impact of changing a file — shows directly and transitively affected files.',
      inputSchema: BlastRadiusInput,
    },
    async (args: z.infer<typeof BlastRadiusInput>) =>
      handleBlastRadius(engine, { projectId: args.projectId, file: args.file }),
  );

  reg(
    'phantom_graph_related',
    {
      description: 'Find files related to a set of files in the dependency graph.',
      inputSchema: RelatedInput,
    },
    async (args: z.infer<typeof RelatedInput>) =>
      handleRelated(engine, { projectId: args.projectId, files: args.files, depth: args.depth ?? 1 }),
  );

  reg(
    'phantom_graph_stats',
    {
      description: 'Get graph statistics for a project — file count, edge count, module count, and more.',
      inputSchema: ProjectIdInput,
    },
    async (args: z.infer<typeof ProjectIdInput>) =>
      handleStats(engine, { projectId: args.projectId }),
  );

  reg(
    'phantom_graph_path',
    {
      description: 'Find the shortest path between two files in the dependency graph.',
      inputSchema: PathInput,
    },
    async (args: z.infer<typeof PathInput>) =>
      handlePath(engine, { projectId: args.projectId, from: args.from, to: args.to }),
  );

  reg(
    'phantom_graph_build',
    {
      description: 'Trigger a graph rebuild for a project. Returns immediately while build runs in background.',
      inputSchema: ProjectIdInput,
    },
    async (args: z.infer<typeof ProjectIdInput>) =>
      handleBuild(engine, { projectId: args.projectId }),
  );

  reg(
    'phantom_list_projects',
    {
      description: 'List all known projects with their IDs and repo paths.',
    },
    async () => handleListProjects(),
  );
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

  mcpServer = new McpServer({
    name: 'phantom-os',
    version: '1.0.0',
  });

  registerTools(mcpServer, graphEngine);

  transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  logger.info('MCP', 'MCP server started on stdio transport');
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
 * Used by the standalone stdio entry point and tests.
 */
export function createMcpServer(engine: GraphEngineAdapter): McpServer {
  const server = new McpServer({
    name: 'phantom-os',
    version: '1.0.0',
  });

  registerTools(server, engine);
  return server;
}
