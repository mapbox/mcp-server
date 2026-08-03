// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  registerAppResource,
  RESOURCE_MIME_TYPE
} from '@modelcontextprotocol/ext-apps/server';
import type { BaseResource } from './BaseResource.js';
import { runWithServer } from '../utils/serverScope.js';

/**
 * Registers MCP Apps UI resources (`ui://…`) on the given server.
 *
 * These use `registerAppResource` rather than `BaseResource.installTo()` so the
 * mime type is RESOURCE_MIME_TYPE ("text/html;profile=mcp-app"), which is what
 * tells clients such as Claude Desktop the resource is an MCP App. Since
 * `installTo()` is bypassed, the read is bound to the server here instead.
 */
export function registerUiResources(
  server: McpServer,
  resources: BaseResource[]
): void {
  resources.forEach((resource) => {
    registerAppResource(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      server as any,
      resource.name,
      resource.uri,
      {
        mimeType: RESOURCE_MIME_TYPE,
        description: resource.description
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      async () =>
        runWithServer(server, () =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          resource.read(resource.uri, {} as any)
        )
    );
  });
}
