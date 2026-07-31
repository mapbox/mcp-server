// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { AsyncLocalStorage } from 'node:async_hooks';
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

  /**
   * The most recently installed server. Used as a fallback when `read()` is
   * called directly rather than through a handler registered by `installTo()`.
   * A single instance installed into several servers only retains the last one,
   * so code handling a read should use `activeServer` instead.
   */
  protected server: McpServer | null = null;

  /**
   * The server whose registered handler is serving the current read. Scoped per
   * invocation, so concurrent reads arriving through different servers each
   * observe their own.
   */
  private readonly invocationServer = new AsyncLocalStorage<McpServer>();

  /**
   * The server a read should communicate with — the one that registered the
   * handler serving it, falling back to the last installed server when `read()`
   * is invoked outside a registered handler.
   */
  protected get activeServer(): McpServer | null {
    return this.invocationServer.getStore() ?? this.server;
  }

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
        ) =>
          this.invocationServer.run(server, () =>
            this.read(uri.toString(), extra)
          )
      );
    } else {
      server.registerResource(
        this.name,
        this.uri,
        metadata,
        (
          uri: URL,
          extra: RequestHandlerExtra<ServerRequest, ServerNotification>
        ) =>
          this.invocationServer.run(server, () =>
            this.read(uri.toString(), extra)
          )
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
    const server = this.activeServer;
    if (server?.server) {
      void server.server.sendLoggingMessage({ level, data });
    }
  }
}
