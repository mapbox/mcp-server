// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ServerRequest,
  ServerNotification,
  GetPromptResult
} from '@modelcontextprotocol/sdk/types.js';
import type { ZodType, ZodTypeDef, ZodOptional } from 'zod';

/**
 * Raw shape for prompt arguments - all arguments must be strings or optional strings
 * per MCP specification
 */
export type PromptArgsRawShape = {
  [k: string]:
    | ZodType<string, ZodTypeDef, string>
    | ZodOptional<ZodType<string, ZodTypeDef, string>>;
};

/**
 * Base class for all MCP prompts
 */
export abstract class BasePrompt<
  ArgsSchema extends PromptArgsRawShape | undefined = undefined
> {
  abstract readonly name: string;
  abstract readonly title: string;
  abstract readonly description: string;

  readonly argsSchema?: ArgsSchema;
  protected server: McpServer | null = null;

  constructor(params?: { argsSchema?: ArgsSchema }) {
    this.argsSchema = params?.argsSchema;
  }

  /**
   * Installs the prompt to the given MCP server.
   */
  installTo(server: McpServer): void {
    this.server = server;

    const config: {
      title?: string;
      description?: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      argsSchema?: any;
    } = {
      title: this.title,
      description: this.description
    };

    // Add argsSchema if provided
    if (this.argsSchema) {
      config.argsSchema = this.argsSchema;
    }

    server.registerPrompt(this.name, config, (args, extra) =>
      this.run(args, extra)
    );
  }

  /**
   * Prompt logic to be implemented by subclasses.
   * Should return messages that will be used to construct the prompt.
   */
  abstract run(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    args: any,
    extra?: RequestHandlerExtra<ServerRequest, ServerNotification>
  ): Promise<GetPromptResult>;

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
}
