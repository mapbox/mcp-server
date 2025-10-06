// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { Resource } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION
} from '@opentelemetry/semantic-conventions';
import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import type { Span, Tracer } from '@opentelemetry/api';
import { getVersionInfo } from './versionUtils.js';

let isInitialized = false;
let tracer: Tracer;

export interface TracingConfig {
  serviceName?: string;
  serviceVersion?: string;
  otlpEndpoint?: string;
  enablePrometheus?: boolean;
  prometheusPort?: number;
  enableConsoleExporter?: boolean;
}

/**
 * Initialize OpenTelemetry tracing
 */
export async function initializeTracing(
  config: TracingConfig = {}
): Promise<void> {
  if (isInitialized) {
    return;
  }

  const versionInfo = getVersionInfo();
  const serviceName =
    config.serviceName || versionInfo.name || '@mapbox/mcp-server';
  const serviceVersion =
    config.serviceVersion || versionInfo.version || '0.0.0';

  // Create resource with service information
  const resource = new Resource({
    [ATTR_SERVICE_NAME]: serviceName,
    [ATTR_SERVICE_VERSION]: serviceVersion
  });

  // Configure exporters based on environment and config
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exporters: Array<OTLPTraceExporter | any> = [];

  // OTLP exporter (if endpoint is provided or environment variable is set)
  const otlpEndpoint =
    config.otlpEndpoint ||
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
    process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  if (otlpEndpoint) {
    exporters.push(
      new OTLPTraceExporter({
        url: otlpEndpoint
      })
    );
  }

  // Console exporter for development
  if (
    config.enableConsoleExporter ||
    process.env.OTEL_ENABLE_CONSOLE_EXPORTER === 'true'
  ) {
    const { ConsoleSpanExporter } = await import(
      '@opentelemetry/sdk-trace-node'
    );
    exporters.push(new ConsoleSpanExporter());
  }

  // Configure metric exporters
  const metricExporters: PrometheusExporter[] = [];

  // Prometheus exporter
  if (
    config.enablePrometheus ||
    process.env.OTEL_ENABLE_PROMETHEUS === 'true'
  ) {
    const prometheusPort =
      config.prometheusPort ||
      parseInt(process.env.OTEL_PROMETHEUS_PORT || '9090');
    metricExporters.push(
      new PrometheusExporter({
        port: prometheusPort
      })
    );
  }

  // Initialize the SDK
  const sdk = new NodeSDK({
    resource,
    traceExporter: exporters.length > 0 ? exporters[0] : undefined, // Use first exporter
    metricReader: metricExporters.length > 0 ? metricExporters[0] : undefined,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Customize which instrumentations to include
        '@opentelemetry/instrumentation-fs': {
          enabled: false // Disable file system instrumentation to reduce noise
        }
      })
    ]
  });

  // Start the SDK
  sdk.start();

  // Get tracer instance
  tracer = trace.getTracer(serviceName, serviceVersion);

  isInitialized = true;

  console.log(
    `OpenTelemetry tracing initialized for ${serviceName}@${serviceVersion}`
  );
  if (otlpEndpoint) {
    console.log(`OTLP traces will be sent to: ${otlpEndpoint}`);
  }
  if (config.enablePrometheus) {
    console.log(
      `Prometheus metrics available on port: ${config.prometheusPort || 9090}`
    );
  }
}

/**
 * Get the tracer instance (returns null if not initialized)
 */
export function getTracer(): Tracer | null {
  return tracer || null;
}

/**
 * Create a span for tool execution
 */
export function createToolSpan(
  toolName: string,
  operationName: string = 'execute'
): Span | null {
  const tracer = getTracer();
  if (!tracer) return null;

  return tracer.startSpan(`tool.${toolName}.${operationName}`, {
    kind: SpanKind.INTERNAL,
    attributes: {
      'tool.name': toolName,
      'tool.operation': operationName
    }
  });
}

/**
 * Create a span for HTTP requests
 */
export function createHttpSpan(method: string, url: string): Span | null {
  const tracer = getTracer();
  if (!tracer) return null;

  const urlObj = new URL(url);

  return tracer.startSpan(`HTTP ${method}`, {
    kind: SpanKind.CLIENT,
    attributes: {
      'http.method': method,
      'http.url': url,
      'http.host': urlObj.host,
      'http.scheme': urlObj.protocol.replace(':', ''),
      'http.target': urlObj.pathname + urlObj.search
    }
  });
}

/**
 * Trace an async function execution
 */
export async function traceAsync<T>(
  span: Span | null,
  fn: () => Promise<T>
): Promise<T> {
  if (!span) {
    // If no span, just execute the function without tracing
    return await fn();
  }

  try {
    const result = await context.with(
      trace.setSpan(context.active(), span),
      fn
    );
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.recordException(error as Error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error)
    });
    throw error;
  } finally {
    span.end();
  }
}

/**
 * Add attributes to the current active span
 */
export function addSpanAttributes(
  attributes: Record<string, string | number | boolean>
): void {
  if (!getTracer()) return; // Skip if tracing not initialized

  const span = trace.getActiveSpan();
  if (span) {
    span.setAttributes(attributes);
  }
}

/**
 * Record an event on the current active span
 */
export function recordSpanEvent(
  name: string,
  attributes?: Record<string, string | number | boolean>
): void {
  if (!getTracer()) return; // Skip if tracing not initialized

  const span = trace.getActiveSpan();
  if (span) {
    span.addEvent(name, attributes);
  }
}
