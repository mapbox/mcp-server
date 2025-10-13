// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ZodTypeAny, z } from 'zod';
import { BaseTool } from './BaseTool.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { HttpRequest } from '../utils/types.js';

export abstract class MapboxApiBasedTool<
  InputSchema extends ZodTypeAny,
  OutputSchema extends ZodTypeAny = ZodTypeAny
> extends BaseTool<InputSchema, OutputSchema> {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly annotations: import('@modelcontextprotocol/sdk/types.js').ToolAnnotations;

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
   * Validates and runs the tool logic.
   */
  async run(
    rawInput: unknown,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extra?: RequestHandlerExtra<any, any>
  ): Promise<CallToolResult> {
    try {
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

      const input = this.inputSchema.parse(rawInput);
      const result = await this.execute(input, accessToken);
      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.log(
        'error',
        `${this.name}: Error during execution: ${errorMessage}`
      );

      return {
        content: [
          {
            type: 'text',
            text: errorMessage
          }
        ],
        isError: true
      };
    }
  }

  /**
   * Tool logic to be implemented by subclasses.
   * Must return a complete OutputSchema with content and optional structured content.
   */
  protected abstract execute(
    _input: z.infer<InputSchema>,
    accessToken: string
  ): Promise<CallToolResult>;
}
