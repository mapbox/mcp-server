// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

// Load environment variables from .env file if present
// Use Node.js built-in util.parseEnv() and manually apply to override existing vars
import { parseEnv } from 'node:util';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { SpanStatusCode } from '@opentelemetry/api';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { parseToolConfigFromArgs, filterTools } from './config/toolConfig.js';
import { getAllTools } from './tools/toolRegistry.js';
import { getAllResources } from './resources/resourceRegistry.js';
import { getAllPrompts, getPromptByName } from './prompts/promptRegistry.js';
import { getVersionInfo } from './utils/versionUtils.js';
import {
  initializeTracing,
  shutdownTracing,
  isTracingInitialized,
  getTracer
} from './utils/tracing.js';

// Load .env from current working directory (where npm run is executed)
// This happens before tracing is initialized, but we'll add a span when tracing is ready
const envPath = join(process.cwd(), '.env');
let envLoadError: Error | null = null;
let envLoadedCount = 0;

if (existsSync(envPath)) {
  try {
    // Read and parse .env file using Node.js built-in parseEnv
    const envFile = readFileSync(envPath, 'utf-8');
    const parsed = parseEnv(envFile);

    // Apply parsed values to process.env (with override)
    // Note: process.loadEnvFile() doesn't override, so we use parseEnv + manual assignment
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
      resources: {},
      prompts: {}
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

// Register prompt handlers
server.server.setRequestHandler(ListPromptsRequestSchema, async () => {
  const allPrompts = getAllPrompts();
  return {
    prompts: allPrompts.map((prompt) => prompt.getMetadata())
  };
});

// Type assertion to avoid "Type instantiation is excessively deep" error
// This is a known issue in MCP SDK 1.25.1: https://github.com/modelcontextprotocol/typescript-sdk/issues/985
// TODO: Remove this workaround when SDK fixes their type definitions
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(server.server as any).setRequestHandler(
  GetPromptRequestSchema,
  async (request: any) => {
    const { name, arguments: args } = request.params;

    const prompt = getPromptByName(name);
    if (!prompt) {
      throw new Error(`Prompt not found: ${name}`);
    }

    // Convert args to object for easier access
    const argsObj: Record<string, string> = {};
    if (args && typeof args === 'object') {
      Object.assign(argsObj, args);
    }

    // Get the prompt messages with filled-in arguments
    const messages = prompt.getMessages(argsObj);

    return {
      description: prompt.description,
      messages
    };
  }
);

async function main() {
  // Initialize OpenTelemetry tracing if not in test mode
  let tracingInitialized = false;
  if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
    try {
      await initializeTracing();
      tracingInitialized = isTracingInitialized();

      // Record .env loading as a span (retrospectively since it happened before tracing init)
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
          // No error, but no variables loaded either (file might be empty or not exist)
          span.setStatus({ code: SpanStatusCode.OK });
          span.setAttribute('config.load.success', true);
          span.setAttribute('config.load.empty', true);
        }

        span.end();
      }
    } catch (error) {
      // Tracing initialization failed, log it but continue without tracing
      server.server.sendLoggingMessage({
        level: 'warning',
        data: `Failed to initialize tracing: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }

  // Log tracing status and configuration
  if (tracingInitialized) {
    const tracingConfig = {
      status: 'enabled',
      endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'not set',
      serviceName:
        process.env.OTEL_SERVICE_NAME || 'mapbox-mcp-server (default)'
    };
    server.server.sendLoggingMessage({
      level: 'info',
      data: `OpenTelemetry tracing enabled - Endpoint: ${tracingConfig.endpoint}, Service: ${tracingConfig.serviceName}`
    });
  } else {
    server.server.sendLoggingMessage({
      level: 'info',
      data: 'OpenTelemetry tracing: disabled'
    });
  }

  // Send MCP logging message about environment variables
  if (envLoadError) {
    server.server.sendLoggingMessage({
      level: 'warning',
      data: `Warning loading .env file: ${envLoadError.message}`
    });
  } else if (envLoadedCount > 0) {
    server.server.sendLoggingMessage({
      level: 'info',
      data: `Loaded ${envLoadedCount} environment variables from ${envPath}`
    });
  }

  const relevantEnvVars = Object.freeze({
    MAPBOX_ACCESS_TOKEN: process.env.MAPBOX_ACCESS_TOKEN ? '***' : undefined,
    MAPBOX_API_ENDPOINT: process.env.MAPBOX_API_ENDPOINT,
    OTEL_SERVICE_NAME: process.env.OTEL_SERVICE_NAME,
    OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    OTEL_TRACING_ENABLED: process.env.OTEL_TRACING_ENABLED,
    NODE_ENV: process.env.NODE_ENV
  });

  server.server.sendLoggingMessage({
    level: 'debug',
    data: JSON.stringify(relevantEnvVars, null, 2)
  });

  // Start receiving messages on stdin and sending messages on stdout
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Ensure cleanup interval is cleared when the process exits
async function shutdown() {
  // Shutdown tracing
  try {
    await shutdownTracing();
  } catch (error) {
    // Tracing shutdown failed, log via MCP if server is available
    try {
      server.server.sendLoggingMessage({
        level: 'error',
        data: `Error shutting down tracing: ${error instanceof Error ? error.message : String(error)}`
      });
    } catch {
      // Server not available, ignore
    }
  }

  process.exit(0);
}

function exitWithLog(message: string, error: unknown, code = 1) {
  // Log error via MCP server if available
  try {
    server.server.sendLoggingMessage({
      level: 'error',
      data: `${message}: ${error instanceof Error ? error.message : String(error)}`
    });
  } catch {
    // Server not available, ignore
  }
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
