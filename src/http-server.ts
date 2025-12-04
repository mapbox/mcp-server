// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * HTTP server entry point for Streamable HTTP transport.
 * This enables local testing with ChatGPT Apps and other HTTP-based MCP clients.
 *
 * Usage:
 *   npm run dev:http    # Development mode with tsx
 *   npm run start:http  # Production mode
 *
 * Then expose via ngrok for ChatGPT testing:
 *   ngrok http 3000
 */

// Load environment variables from .env file if present
import { parseEnv } from 'node:util';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { SpanStatusCode } from '@opentelemetry/api';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { parseToolConfigFromArgs, filterTools } from './config/toolConfig.js';
import { getAllTools } from './tools/toolRegistry.js';
import { getAllResources } from './resources/resourceRegistry.js';
import { getVersionInfo } from './utils/versionUtils.js';
import {
  initializeTracing,
  shutdownTracing,
  isTracingInitialized,
  getTracer
} from './utils/tracing.js';

const PORT = parseInt(process.env.PORT || '3000', 10);

// Load .env from current working directory
const envPath = join(process.cwd(), '.env');
let envLoadError: Error | null = null;
let envLoadedCount = 0;

if (existsSync(envPath)) {
  try {
    const envFile = readFileSync(envPath, 'utf-8');
    const parsed = parseEnv(envFile);
    for (const [key, value] of Object.entries(parsed)) {
      process.env[key] = value;
      envLoadedCount++;
    }
  } catch (error) {
    envLoadError = error instanceof Error ? error : new Error(String(error));
  }
}

const versionInfo = getVersionInfo();

// Parse configuration from command-line arguments
const config = parseToolConfigFromArgs();

// Get and filter tools based on configuration
const allTools = getAllTools();
const enabledTools = filterTools(allTools, config);

// Get all resources
const allResources = getAllResources();

// Create an MCP server
const server = new McpServer(
  {
    name: versionInfo.name,
    version: versionInfo.version
  },
  {
    capabilities: {
      tools: {},
      resources: {}
    }
  }
);

// Register enabled tools to the server
enabledTools.forEach((tool) => {
  tool.installTo(server);
});

// Register all resources to the server
allResources.forEach((resource) => {
  resource.installTo(server);
});

// Session management for stateful mode
const sessions = new Map<string, StreamableHTTPServerTransport>();

/**
 * Parse JSON body from incoming request
 */
async function parseBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks).toString('utf-8');
        resolve(body ? JSON.parse(body) : undefined);
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

/**
 * Handle incoming HTTP requests
 */
async function handleRequest(
  req: IncomingMessage & { auth?: AuthInfo },
  res: ServerResponse
): Promise<void> {
  // CORS headers for ChatGPT and other clients
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, mcp-session-id, Accept'
  );
  res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Only handle /mcp endpoint
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  if (url.pathname !== '/mcp') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
    return;
  }

  // Parse auth from Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    req.auth = {
      token: authHeader.slice(7),
      clientId: 'chatgpt-app',
      scopes: []
    };
  }

  // Get session ID from header
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  // Try to get existing transport for this session
  let transport = sessionId ? sessions.get(sessionId) : undefined;

  if (!transport) {
    // Create new transport for new sessions
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, transport!);
        console.log(`Session initialized: ${id}`);
      },
      onsessionclosed: (id) => {
        sessions.delete(id);
        console.log(`Session closed: ${id}`);
      }
    });

    // Connect the MCP server to this transport
    await server.connect(transport);
  }

  // Parse body and handle request
  try {
    const body = await parseBody(req);
    await transport.handleRequest(req, res, body);
  } catch (error) {
    console.error('Error handling request:', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal error'
          },
          id: null
        })
      );
    }
  }
}

async function main() {
  // Initialize OpenTelemetry tracing if not in test mode
  let tracingInitialized = false;
  if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
    try {
      await initializeTracing();
      tracingInitialized = isTracingInitialized();

      // Record .env loading as a span
      if (tracingInitialized) {
        const tracer = getTracer();
        const span = tracer.startSpan('config.load_env', {
          attributes: {
            'config.file.path': envPath,
            'config.file.exists': existsSync(envPath),
            'config.vars.loaded': envLoadedCount,
            'operation.type': 'config_load'
          }
        });

        if (envLoadError) {
          span.recordException(envLoadError);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: envLoadError.message
          });
          span.setAttribute('error.type', envLoadError.name);
          span.setAttribute('error.message', envLoadError.message);
        } else if (envLoadedCount > 0) {
          span.setStatus({ code: SpanStatusCode.OK });
          span.setAttribute('config.load.success', true);
        } else {
          span.setStatus({ code: SpanStatusCode.OK });
          span.setAttribute('config.load.success', true);
          span.setAttribute('config.load.empty', true);
        }

        span.end();
      }
    } catch (error) {
      console.warn(
        `Failed to initialize tracing: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Log startup info
  if (tracingInitialized) {
    console.log(
      `OpenTelemetry tracing enabled - Endpoint: ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'not set'}`
    );
  }

  if (envLoadError) {
    console.warn(`Warning loading .env file: ${envLoadError.message}`);
  } else if (envLoadedCount > 0) {
    console.log(
      `Loaded ${envLoadedCount} environment variables from ${envPath}`
    );
  }

  // Create and start HTTP server
  const httpServer = createServer(handleRequest);

  httpServer.listen(PORT, () => {
    console.log(`\nMapbox MCP HTTP Server v${versionInfo.version}`);
    console.log(`Listening on port ${PORT}`);
    console.log(`Endpoint: http://localhost:${PORT}/mcp`);
    console.log(`\nTo test with ChatGPT, expose via ngrok:`);
    console.log(`  ngrok http ${PORT}`);
    console.log(
      `\nEnabled tools: ${enabledTools.map((t) => t.name).join(', ')}`
    );
  });

  return httpServer;
}

// Shutdown handling
async function shutdown() {
  try {
    await shutdownTracing();
  } catch (error) {
    console.error(
      `Error shutting down tracing: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  process.exit(0);
}

['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, async () => {
    console.log(`\nReceived ${signal}, shutting down...`);
    await shutdown();
  });
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});

main().catch((error) => {
  console.error('Fatal error starting MCP HTTP server:', error);
  process.exit(1);
});
