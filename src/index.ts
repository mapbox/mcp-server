// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { parseToolConfigFromArgs, filterTools } from './config/toolConfig.js';
import { getAllTools } from './tools/toolRegistry.js';
import { getVersionInfo } from './utils/versionUtils.js';
import {
  initializeTracing,
  shutdownTracing,
  isTracingInitialized
} from './utils/tracing.js';
import 'dotenv/config';

const versionInfo = getVersionInfo();

// Parse configuration from command-line arguments
const config = parseToolConfigFromArgs();

// Get and filter tools based on configuration
const allTools = getAllTools();
const enabledTools = filterTools(allTools, config);

// Create an MCP server
const server = new McpServer(
  {
    name: versionInfo.name,
    version: versionInfo.version
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

// Register enabled tools to the server
enabledTools.forEach((tool) => {
  tool.installTo(server);
});

// MCP-compatible logging functions
// Completely suppress logging when MCP_DISABLE_LOGGING is set (for MCP inspector compatibility)
function logIfEnabled(level: 'log' | 'warn' | 'error', ...args: unknown[]) {
  if (!process.env.MCP_DISABLE_LOGGING) {
    console[level](...args);
  }
}

async function main() {
  // Initialize OpenTelemetry tracing if not in test mode
  if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
    try {
      await initializeTracing();
      logIfEnabled(
        'log',
        `OpenTelemetry tracing: ${isTracingInitialized() ? 'enabled' : 'disabled'}`
      );
    } catch (error) {
      logIfEnabled('warn', 'Failed to initialize tracing:', error);
    }
  }

  // Start receiving messages on stdin and sending messages on stdout
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Ensure cleanup interval is cleared when the process exits
async function shutdown() {
  // Shutdown tracing
  try {
    await shutdownTracing();
  } catch (e) {
    logIfEnabled('error', 'Error shutting down tracing:', e);
  }

  process.exit(0);
}

function exitWithLog(message: string, error: unknown, code = 1) {
  logIfEnabled('error', message, error);
  process.exit(code);
}

['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, async () => {
    try {
      await shutdown();
    } finally {
      process.exit(0);
    }
  });
});

process.on('uncaughtException', (err) =>
  exitWithLog('Uncaught exception:', err)
);
process.on('unhandledRejection', (reason) =>
  exitWithLog('Unhandled rejection:', reason)
);

main().catch((error) => exitWithLog('Fatal error starting MCP server:', error));
