/**
 * MCP Server entry point — start/stop the MCP stdio server
 * @author Subash Karki
 */
export { startMcpServer, stopMcpServer, createMcpServer } from './server.js';
export type { GraphEngineAdapter, OrchestratorEngineAdapter, McpTextContent } from './handlers.js';
