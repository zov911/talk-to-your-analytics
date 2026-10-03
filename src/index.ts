#!/usr/bin/env node
// Entry point: stdio MCP server. Never write to stdout here (it's the JSON-RPC channel); log to stderr.
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { loadSources } from './config.js';
import { createServer } from './server.js';

const sources = loadSources();
const connected = [sources.ga4 && 'GA4', sources.gsc && 'Search Console', sources.hubspot && 'HubSpot'].filter(Boolean).join(', ');
console.error(`[talk-to-your-analytics] ${sources.mode} mode · sources: ${connected}`);

serveStdio(() => createServer(sources));
