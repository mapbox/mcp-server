// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * HttpRequest interface that includes tracing information
 */
export interface HttpRequest {
  (input: string | URL | Request, init?: RequestInit): Promise<Response>;
}
