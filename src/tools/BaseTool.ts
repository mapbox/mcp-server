// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type {
  McpServer,
  RegisteredTool
} from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  ToolAnnotations,
  CallToolResult
} from '@modelcontextprotocol/sdk/types.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ZodTypeAny } from 'zod';
import type { z } from 'zod';

export abstract class BaseTool<
  InputSchema extends ZodTypeAny,
  OutputSchema extends ZodTypeAny = ZodTypeAny
> {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly annotations: ToolAnnotations;

  readonly inputSchema: InputSchema;
  readonly outputSchema?: OutputSchema;
  protected server: McpServer | null = null;

  constructor(params: {
    inputSchema: InputSchema;
    outputSchema?: OutputSchema;
  }) {
    this.inputSchema = params.inputSchema;
    this.outputSchema = params.outputSchema;
  }

  /**
   * Installs the tool to the given MCP server.
   */
  installTo(server: McpServer): RegisteredTool {
    this.server = server;

    const config: {
      title?: string;
      description?: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputSchema?: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      outputSchema?: any;
      annotations?: ToolAnnotations;
    } = {
      title: this.annotations.title,
      description: this.description,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      inputSchema: (this.inputSchema as unknown as z.ZodObject<any>).shape,
      annotations: this.annotations
    };

    // Add outputSchema if provided
    if (this.outputSchema) {
      config.outputSchema =
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this.outputSchema as unknown as z.ZodObject<any>).shape;
    }

    return server.registerTool(
      this.name,
      config,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (args: any, extra: any) => this.run(args, extra)
    );
  }

  /**
   * Tool logic to be implemented by subclasses.
   */
  abstract run(
    rawInput: unknown,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extra?: RequestHandlerExtra<any, any>
  ): Promise<CallToolResult>;

  /**
   * Helper method to send logging messages
   */
  protected log(
    level: 'debug' | 'info' | 'warning' | 'error',
    data: unknown
  ): void {
    if (this.server?.server) {
      void this.server.server.sendLoggingMessage({ level, data });
    }
  }

  /**
   * Validates output data against the output schema with graceful fallback.
   * If validation fails, logs a warning and returns the raw data.
   * @param rawData The raw data to validate
   * @returns The validated data, or raw data if validation fails
   */
  protected validateOutput<T>(rawData: unknown): T {
    if (!this.outputSchema) {
      return rawData as T;
    }

    try {
      return this.outputSchema.parse(rawData) as T;
    } catch (validationError) {
      this.log(
        'warning',
        `${this.name}: Output schema validation failed: ${validationError instanceof Error ? validationError.message : 'Unknown validation error'}`
      );
      // Graceful fallback to raw data
      return rawData as T;
    }
  }
}
