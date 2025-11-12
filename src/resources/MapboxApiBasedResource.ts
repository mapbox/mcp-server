// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ServerRequest,
  ServerNotification,
  ReadResourceResult
} from '@modelcontextprotocol/sdk/types.js';
import { BaseResource } from './BaseResource.js';
import type { HttpRequest } from '../utils/types.js';
import { context, trace, SpanStatusCode } from '@opentelemetry/api';
import { getTracer } from '../utils/tracing.js';

/**
 * Base class for Mapbox API-based resources
 */
export abstract class MapboxApiBasedResource extends BaseResource {
  abstract readonly uri: string;
  abstract readonly name: string;
  abstract readonly description?: string;
  abstract readonly mimeType?: string;

  static get mapboxAccessToken() {
    return process.env.MAPBOX_ACCESS_TOKEN;
  }

  static get mapboxApiEndpoint() {
    return process.env.MAPBOX_API_ENDPOINT || 'https://api.mapbox.com/';
  }

  protected httpRequest: HttpRequest;

  constructor(params: { httpRequest: HttpRequest }) {
    super();
    this.httpRequest = params.httpRequest;
  }

  /**
   * Validates if a string has the format of a JWT token (header.payload.signature)
   * Docs: https://docs.mapbox.com/api/accounts/tokens/#token-format
   * @param token The token string to validate
   * @returns boolean indicating if the token has valid JWT format
   */
  private isValidJwtFormat(token: string): boolean {
    // JWT consists of three parts separated by dots: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    // Check that all parts are non-empty
    return parts.every((part) => part.length > 0);
  }

  /**
   * Validates and reads the resource.
   */
  async read(
    uri: string,
    extra?: RequestHandlerExtra<ServerRequest, ServerNotification>
  ): Promise<ReadResourceResult> {
    // First check if token is provided via authentication context
    const authToken = extra?.authInfo?.token;
    const accessToken = authToken || MapboxApiBasedResource.mapboxAccessToken;

    if (!accessToken) {
      const errorMessage =
        'No access token available. Please provide via Bearer auth or MAPBOX_ACCESS_TOKEN env var';
      this.log('error', `${this.name}: ${errorMessage}`);
      throw new Error(errorMessage);
    }

    // Validate that the token has the correct JWT format
    if (!this.isValidJwtFormat(accessToken)) {
      const errorMessage = 'Access token is not in valid JWT format';
      this.log('error', `${this.name}: ${errorMessage}`);
      throw new Error(errorMessage);
    }

    const tracer = getTracer();
    const span = tracer.startSpan(`resource.read.${this.name}`, {
      attributes: {
        'resource.uri': uri,
        'resource.name': this.name,
        'operation.type': 'resource_read'
      }
    });

    try {
      // Execute within the span context
      const result = await context.with(
        trace.setSpan(context.active(), span),
        async () => {
          return await this.execute(uri, accessToken);
        }
      );

      // Mark span as successful and end it
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.log(
        'error',
        `${this.name}: Error during execution: ${errorMessage}`
      );

      // Mark span as failed and end it
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: errorMessage
      });
      span.end();

      throw error;
    }
  }

  /**
   * Resource-specific logic to be implemented by subclasses.
   */
  protected abstract execute(
    uri: string,
    accessToken: string
  ): Promise<ReadResourceResult>;
}
