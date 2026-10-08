// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * @module utils
 *
 * Public API for Mapbox MCP utilities. This module exports the HTTP pipeline
 * system for making requests to Mapbox APIs with built-in policies like
 * User-Agent, Retry, and Tracing.
 *
 * @example Using the default pipeline
 * ```typescript
 * import { httpRequest } from '@mapbox/mcp-server/utils';
 * import { DirectionsTool } from '@mapbox/mcp-server/tools';
 *
 * // Use the pre-configured default pipeline
 * const tool = new DirectionsTool({ httpRequest });
 * ```
 *
 * @example Creating a custom pipeline
 * ```typescript
 * import { HttpPipeline, UserAgentPolicy, RetryPolicy } from '@mapbox/mcp-server/utils';
 * import { DirectionsTool } from '@mapbox/mcp-server/tools';
 *
 * // Create a custom pipeline with your own policies
 * const pipeline = new HttpPipeline();
 * pipeline.usePolicy(new UserAgentPolicy('MyApp/1.0.0'));
 * pipeline.usePolicy(new RetryPolicy(5, 300, 3000)); // More aggressive retry
 *
 * const tool = new DirectionsTool({ httpRequest: pipeline.execute.bind(pipeline) });
 * ```
 */

// Export the pre-configured default HTTP pipeline
export { httpRequest, systemHttpPipeline } from './httpPipeline.js';

// Export HTTP pipeline classes and interfaces for custom pipelines
export {
  HttpPipeline,
  UserAgentPolicy,
  RetryPolicy,
  TracingPolicy,
  type HttpPolicy
} from './httpPipeline.js';

// Export types
export type { HttpRequest, TracedRequestInit } from './types.js';

// Export tracing helpers for consumers running their own OpenTelemetry setup.
// Wrap your span exporter in RedactingSpanExporter to keep Mapbox access tokens,
// which travel as a URL query parameter, out of exported span attributes.
export { RedactingSpanExporter } from './redactingSpanExporter.js';
export { redactToken } from './redactToken.js';

// Export version utilities
export { getVersionInfo } from './versionUtils.js';
export type { VersionInfo } from './versionUtils.js';

// Export server setup helpers for consumers building their own McpServer
// (e.g. a hosted deployment) rather than running this package's entry point.
// Call publishJsonSchema2020(server) before installing any tool, and pass
// buildServerInstructions(<enabled tool names>) as the server's instructions.
export { publishJsonSchema2020, toJsonSchema2020 } from './jsonSchema2020.js';
export { buildServerInstructions } from './serverInstructions.js';
