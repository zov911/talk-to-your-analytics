import { McpServer } from '@modelcontextprotocol/server';
import type { Sources } from './sources/types.js';
import { registerOverview } from './tools/overview.js';

export const VERSION = '1.0.0';

export function createServer(sources: Sources): McpServer {
  const server = new McpServer({ name: 'talk-to-your-analytics', version: VERSION });
  registerOverview(server, sources);
  return server;
}
