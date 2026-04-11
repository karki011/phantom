/**
 * MCP Server entry point — start/stop the MCP stdio server
 * @author Subash Karki
 */
export { startMcpServer, stopMcpServer, createMcpServer } from './server.js';
export type { GraphEngineAdapter, McpTextContent } from './handlers.js';
