// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  CallToolResult,
  ReadResourceResult
} from '@modelcontextprotocol/sdk/types.js';

export type FakeMcpServer = {
  /** Pass to `installTo()`; carries `id` so a call traces back to its server. */
  server: any;
  id: string;
  /** Second argument `registerResource` got: a URI string or a ResourceTemplate. */
  resourceArg: string | ResourceTemplate | undefined;
  invokeTool: (args?: any, extra?: any) => Promise<CallToolResult>;
  invokeResource: (
    uri: string,
    variables?: Record<string, string | string[]>,
    extra?: any
  ) => Promise<ReadResourceResult>;
};

/** Minimal McpServer stand-in that captures what `installTo()` registers. */
export function createFakeServer(id: string): FakeMcpServer {
  let toolCallback:
    | ((args: any, extra: any) => Promise<CallToolResult>)
    | null = null;
  let resourceHandler:
    | ((...args: any[]) => Promise<ReadResourceResult>)
    | null = null;

  const fake: FakeMcpServer = {
    server: {
      id,
      server: {},
      registerTool: (_name: string, _config: any, cb: any) => {
        toolCallback = cb;
        return {};
      },
      registerResource: (
        _name: string,
        uriOrTemplate: any,
        _metadata: any,
        handler: any
      ) => {
        fake.resourceArg = uriOrTemplate;
        resourceHandler = handler;
        return {};
      }
    },
    id,
    resourceArg: undefined,
    invokeTool: (args = {}, extra = {}) => {
      if (!toolCallback) {
        throw new Error(`no tool registered on fake server '${id}'`);
      }
      return toolCallback(args, extra);
    },
    invokeResource: (uri, variables, extra = {}) => {
      if (!resourceHandler) {
        throw new Error(`no resource registered on fake server '${id}'`);
      }
      // The template branch registers a 3-arg handler, the plain branch 2-arg.
      return typeof fake.resourceArg === 'string'
        ? resourceHandler(new URL(uri), extra)
        : resourceHandler(new URL(uri), variables ?? {}, extra);
    }
  };

  return fake;
}
