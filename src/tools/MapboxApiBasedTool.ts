// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ZodTypeAny } from 'zod';
import { BaseTool } from './BaseTool.js';
import type {
  CallToolResult,
  ToolAnnotations
} from '@modelcontextprotocol/sdk/types.js';
import type { HttpRequest } from '../utils/types.js';
import { context, trace, SpanStatusCode } from '@opentelemetry/api';
import type { ToolExecutionContext } from '../utils/tracing.js';
import { createToolExecutionContext } from '../utils/tracing.js';

export abstract class MapboxApiBasedTool<
  InputSchema extends ZodTypeAny,
  OutputSchema extends ZodTypeAny = ZodTypeAny
> extends BaseTool<InputSchema, OutputSchema> {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly annotations: ToolAnnotations;

  static get mapboxAccessToken() {
    return process.env.MAPBOX_ACCESS_TOKEN;
  }

  static get mapboxApiEndpoint() {
    return process.env.MAPBOX_API_ENDPOINT || 'https://api.mapbox.com/';
  }

  protected httpRequest: HttpRequest;

  constructor(params: {
    inputSchema: InputSchema;
    outputSchema?: OutputSchema;
    httpRequest: HttpRequest;
  }) {
    super(params);
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
   * Extracts error message from Mapbox API response.
   * If the response contains a JSON body with a 'message' field, returns that.
   * Otherwise falls back to the response status text.
   * @param response The HTTP response object
   * @returns The error message string in format "statusCode: message"
   */
  protected async getErrorMessage(response: Response): Promise<string> {
    try {
      const errorBody = await response.text();
      const errorJson = JSON.parse(errorBody);
      if (errorJson.message) {
        return `${response.status}: ${errorJson.message}`;
      }
    } catch {
      // If parsing fails, fall back to status text
    }
    return `${response.status}: ${response.statusText}`;
  }

  /**
   * Validates and runs the tool logic.
   */
  async run(
    rawInput: unknown,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extra?: RequestHandlerExtra<any, any>
  ): Promise<CallToolResult> {
    // First check if token is provided via authentication context
    // Check both standard token field and accessToken in extra for compatibility
    // In the streamableHttp, the authInfo is injected into extra from `req.auth`
    // https://github.com/modelcontextprotocol/typescript-sdk/blob/main/src/server/streamableHttp.ts#L405
    const authToken = extra?.authInfo?.token;
    const accessToken = authToken || MapboxApiBasedTool.mapboxAccessToken;
    if (!accessToken) {
      const errorMessage =
        'No access token available. Please provide via Bearer auth or MAPBOX_ACCESS_TOKEN env var';
      this.log('error', `${this.name}: ${errorMessage}`);
      return {
        content: [{ type: 'text', text: errorMessage }],
        isError: true
      };
    }

    // Validate that the token has the correct JWT format
    if (!this.isValidJwtFormat(accessToken)) {
      const errorMessage = 'Access token is not in valid JWT format';
      this.log('error', `${this.name}: ${errorMessage}`);
      return {
        content: [{ type: 'text', text: errorMessage }],
        isError: true
      };
    }

    let toolContext: ToolExecutionContext | undefined;

    try {
      const input = this.inputSchema.parse(rawInput);

      // Create tool execution context - tracing is handled by the HTTP client
      toolContext = {
        ...createToolExecutionContext(
          this.name,
          0, // Input size not needed since tracing is in HTTP client
          this.httpRequest,
          extra
        ),
        httpRequest: this.httpRequest
      };

      // Execute tool within the tool span context to connect all child spans
      const result = await context.with(
        trace.setSpan(context.active(), toolContext.span),
        async () => {
          return await this.execute(input, accessToken, toolContext!);
        }
      );

      // Mark span as successful and end it
      toolContext.span.setStatus({ code: SpanStatusCode.OK });
      toolContext.span.end();
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.log(
        'error',
        `${this.name}: Error during execution: ${errorMessage}`
      );

      // Mark span as failed and end it
      if (toolContext?.span) {
        toolContext.span.setStatus({
          code: SpanStatusCode.ERROR,
          message: errorMessage
        });
        toolContext.span.end();
      }

      const errorResponse = {
        message: errorMessage,
        tool: this.name
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(errorResponse)
          }
        ],
        isError: true
      };
    }
  }

  /**
   * Tool-specific logic to be implemented by subclasses.
   */
  protected abstract execute(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input: any,
    accessToken: string,
    context: ToolExecutionContext
  ): Promise<CallToolResult>;
}
