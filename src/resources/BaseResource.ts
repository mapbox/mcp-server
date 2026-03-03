// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import {
  type McpServer,
  ResourceTemplate
} from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type {
  ServerRequest,
  ServerNotification,
  ReadResourceResult
} from '@modelcontextprotocol/sdk/types.js';

/**
 * Base class for all MCP resources
 */
export abstract class BaseResource {
  abstract readonly uri: string;
  abstract readonly name: string;
  abstract readonly description?: string;
  abstract readonly mimeType?: string;

  protected server: McpServer | null = null;

  /**
   * Installs the resource to the given MCP server.
   */
  installTo(server: McpServer): void {
    this.server = server;

    const metadata = {
      title: this.name,
      description: this.description,
      mimeType: this.mimeType
    };

    if (this.uri.includes('{')) {
      // URI contains template variables — register as a ResourceTemplate so the
      // SDK performs proper URI template matching (e.g. mapbox://temp/{id}).
      const template = new ResourceTemplate(this.uri, { list: undefined });
      server.registerResource(
        this.name,
        template,
        metadata,
        (
          uri: URL,
          _variables: Record<string, string | string[]>,
          extra: RequestHandlerExtra<ServerRequest, ServerNotification>
        ) => this.read(uri.toString(), extra)
      );
    } else {
      server.registerResource(
        this.name,
        this.uri,
        metadata,
        (
          uri: URL,
          extra: RequestHandlerExtra<ServerRequest, ServerNotification>
        ) => this.read(uri.toString(), extra)
      );
    }
  }

  /**
   * Resource read logic to be implemented by subclasses.
   * @param uri The resource URI as a string
   * @param extra Additional request context
   */
  abstract read(
    uri: string,
    extra?: RequestHandlerExtra<ServerRequest, ServerNotification>
  ): Promise<ReadResourceResult>;

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
