// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { Span } from '@opentelemetry/api';

/**
 * Enhanced RequestInit with tracing context
 */
export interface TracedRequestInit extends RequestInit {
  tracingContext?: {
    parentSpan?: Span;
    sessionId?: string;
    userId?: string;
  };
}

/**
 * HttpRequest interface that includes tracing information
 */
export interface HttpRequest {
  (input: string | URL | Request, init?: TracedRequestInit): Promise<Response>;
}
