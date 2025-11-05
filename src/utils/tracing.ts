// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION
} from '@opentelemetry/semantic-conventions';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import {
  trace,
  SpanStatusCode,
  SpanKind,
  type Span,
  diag,
  DiagLogLevel
} from '@opentelemetry/api';
import { getVersionInfo } from './versionUtils.js';
import { ATTR_SERVICE_INSTANCE_ID } from '@opentelemetry/semantic-conventions/incubating';
import { type HttpRequest } from './types.js';

// Suppress OpenTelemetry diagnostic logging IMMEDIATELY to avoid polluting stdio
// This must happen at module load time, before any OTEL operations
// Use OTEL_LOG_LEVEL env var to override if needed for debugging
const configureOtelDiagnostics = () => {
  const logLevel = process.env.OTEL_LOG_LEVEL
    ? DiagLogLevel[
        process.env.OTEL_LOG_LEVEL.toUpperCase() as keyof typeof DiagLogLevel
      ]
    : DiagLogLevel.NONE;

  diag.setLogger(
    {
      verbose: () => {},
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {}
    },
    logLevel
  );
};

// Configure diagnostics at module load time
configureOtelDiagnostics();

// Global SDK instance
let sdk: NodeSDK | null = null;
let isTracingEnabled = false;

/**
 * Tool execution context providing dependencies via options bag pattern
 */
export interface LocalToolExecutionContext {
  span: Span;
  tracingContext: {
    parentSpan?: Span;
    sessionId?: string;
    userId?: string;
    accountId?: string;
    chatSessionId?: string;
    promptId?: string;
  };
  extra?: Record<string, unknown>;
}

/**
 * Tool execution context providing dependencies via options bag pattern
 */
export interface ToolExecutionContext {
  span: Span;
  tracingContext: {
    parentSpan?: Span;
    sessionId?: string;
    userId?: string;
    accountId?: string;
    chatSessionId?: string;
    promptId?: string;
  };
  httpRequest: HttpRequest;
  extra?: Record<string, unknown>;
}

/**
 * Create a tool execution context with all necessary dependencies
 */
export function createLocalToolExecutionContext(
  toolName: string,
  inputSize: number,
  extra?: Record<string, unknown>
): LocalToolExecutionContext {
  const span = createToolSpan(toolName, inputSize, {
    sessionId: extra?.sessionId as string | undefined,
    userId: extra?.userId as string | undefined,
    accountId: extra?.accountId as string | undefined,
    chatSessionId: extra?.chatSessionId as string | undefined,
    promptId: extra?.promptId as string | undefined
  });

  return {
    span,
    tracingContext: {
      parentSpan: span,
      sessionId: extra?.sessionId as string | undefined,
      userId: extra?.userId as string | undefined,
      accountId: extra?.accountId as string | undefined,
      chatSessionId: extra?.chatSessionId as string | undefined,
      promptId: extra?.promptId as string | undefined
    },
    extra
  };
}

/**
 * Create a tool execution context with all necessary dependencies
 */
export function createToolExecutionContext(
  toolName: string,
  inputSize: number,
  httpRequest: HttpRequest,
  extra?: Record<string, unknown>
): ToolExecutionContext {
  const span = createToolSpan(toolName, inputSize, {
    sessionId: extra?.sessionId as string | undefined,
    userId: extra?.userId as string | undefined,
    accountId: extra?.accountId as string | undefined,
    chatSessionId: extra?.chatSessionId as string | undefined,
    promptId: extra?.promptId as string | undefined
  });

  return {
    span,
    tracingContext: {
      parentSpan: span,
      sessionId: extra?.sessionId as string | undefined,
      userId: extra?.userId as string | undefined,
      accountId: extra?.accountId as string | undefined,
      chatSessionId: extra?.chatSessionId as string | undefined,
      promptId: extra?.promptId as string | undefined
    },
    httpRequest,
    extra
  };
}

/**
 * Initialize OpenTelemetry tracing
 * Should be called once at application startup
 *
 * For MCP servers using stdio transport, console output should be avoided.
 * This implementation automatically detects and handles MCP compatibility.
 */
export async function initializeTracing(): Promise<void> {
  // Skip initialization if already initialized or if running in test environment
  if (sdk || process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return;
  }

  // Skip if tracing is explicitly disabled
  if (process.env.OTEL_TRACING_ENABLED === 'false') {
    return;
  }

  const versionInfo = getVersionInfo();

  try {
    // Create resource with service information
    const resource = new Resource({
      [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || versionInfo.name,
      [ATTR_SERVICE_VERSION]: versionInfo.version,
      [ATTR_SERVICE_INSTANCE_ID]: process.env.HOSTNAME || 'unknown',
      'service.git.sha': versionInfo.sha,
      'service.git.branch': versionInfo.branch,
      'service.git.tag': versionInfo.tag
    });

    // Configure exporters
    const exporters = [];

    // Console exporter for development (avoid in stdio transport)
    if (process.env.OTEL_EXPORTER_CONSOLE_ENABLED === 'true') {
      const { ConsoleSpanExporter } = await import(
        '@opentelemetry/sdk-trace-base'
      );
      exporters.push(new ConsoleSpanExporter());
    }

    // OTLP HTTP exporter for production
    const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    if (otlpEndpoint) {
      exporters.push(
        new OTLPTraceExporter({
          url: `${otlpEndpoint}/v1/traces`,
          headers: process.env.OTEL_EXPORTER_OTLP_HEADERS
            ? JSON.parse(process.env.OTEL_EXPORTER_OTLP_HEADERS)
            : {}
        })
      );
    }

    // Skip tracing if no exporters configured
    if (exporters.length === 0) {
      return;
    }

    // Create SDK instance
    sdk = new NodeSDK({
      resource,
      traceExporter: exporters[0],
      instrumentations: [
        getNodeAutoInstrumentations({
          // Disable instrumentations that might be too noisy
          '@opentelemetry/instrumentation-fs': {
            enabled: false
          },
          '@opentelemetry/instrumentation-dns': {
            enabled: false
          },
          // Ensure HTTP instrumentation is enabled for HTTP requests
          '@opentelemetry/instrumentation-http': {
            enabled: true
          },
          // Enable fetch instrumentation for HTTP requests
          '@opentelemetry/instrumentation-undici': {
            enabled: true
          }
        })
      ]
    });

    // Start the SDK
    sdk.start();
    isTracingEnabled = true;
  } catch {
    // Silently handle initialization errors to avoid breaking MCP stdio
    isTracingEnabled = false;
  }
}

/**
 * Shutdown tracing gracefully
 */
export async function shutdownTracing(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    sdk = null;
    isTracingEnabled = false;
  }
}

/**
 * Check if tracing is enabled
 */
export function isTracingInitialized(): boolean {
  return isTracingEnabled;
}

/**
 * Get the default tracer for the MCP server
 */
export function getTracer() {
  return trace.getTracer('mapbox-mcp-server');
}

/**
 * Create a span for tool execution with comprehensive attributes
 */
export function createToolSpan(
  toolName: string,
  inputSize: number,
  extra?: {
    sessionId?: string;
    userId?: string;
    accountId?: string;
    chatSessionId?: string;
    promptId?: string;
  }
): Span {
  const tracer = getTracer();

  const span = tracer.startSpan(`tool.${toolName}`, {
    kind: SpanKind.INTERNAL,
    attributes: {
      'tool.name': toolName,
      'tool.input.size': inputSize,
      'operation.type': 'tool_execution',
      ...(extra?.sessionId && { 'session.id': extra.sessionId }),
      ...(extra?.userId && { 'user.id': extra.userId }),
      ...(extra?.accountId && { 'account.id': extra.accountId }),
      ...(extra?.chatSessionId && { 'chat.session.id': extra.chatSessionId }),
      ...(extra?.promptId && { 'prompt.id': extra.promptId })
    }
  });

  return span;
}

/**
 * Create a span for HTTP requests with comprehensive attributes
 */
export function createHttpSpan(
  method: string,
  url: string,
  extra?: {
    userAgent?: string;
    contentLength?: number;
    sessionId?: string;
  }
): Span {
  const tracer = getTracer();

  const span = tracer.startSpan(`http.${method.toLowerCase()}`, {
    kind: SpanKind.CLIENT,
    attributes: {
      'http.method': method,
      'http.url': url,
      'operation.type': 'http_request',
      ...(extra?.userAgent && { 'http.user_agent': extra.userAgent }),
      ...(extra?.contentLength && {
        'http.request.content_length': extra.contentLength
      }),
      ...(extra?.sessionId && { 'session.id': extra.sessionId })
    }
  });

  return span;
}

/**
 * Mark a span as successful and end it
 */
export function markSpanSuccess(
  span: Span,
  attributes?: Record<string, string | number | boolean>
): void {
  if (attributes) {
    span.setAttributes(attributes);
  }
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

/**
 * Mark a span as failed with error information and end it
 */
export function markSpanError(
  span: Span,
  error: Error | string,
  attributes?: Record<string, string | number | boolean>
): void {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const errorType =
    typeof error === 'string' ? 'Error' : error.constructor.name;

  span.setAttributes({
    'error.type': errorType,
    'error.message': errorMessage,
    ...(attributes || {})
  });

  if (typeof error !== 'string') {
    span.recordException(error);
  }

  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: errorMessage
  });
  span.end();
}

/**
 * Validate JWT token format for tracing (basic format check only)
 */
export function validateJwtForTracing(token?: string): {
  isValid: boolean;
  error?: string;
} {
  if (!token) {
    return { isValid: true }; // No token is valid (optional)
  }

  // Basic JWT format validation (header.payload.signature)
  const parts = token.split('.');
  if (parts.length !== 3) {
    return { isValid: false, error: 'Invalid JWT format' };
  }

  try {
    // Try to decode the header and payload (just to validate base64 format)
    JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    return { isValid: true };
  } catch {
    return { isValid: false, error: 'Invalid JWT encoding' };
  }
}

/**
 * Helper function to get size of an object in bytes (approximate)
 */
export function getObjectSize(obj: unknown): number {
  try {
    return JSON.stringify(obj).length;
  } catch {
    return 0;
  }
}
