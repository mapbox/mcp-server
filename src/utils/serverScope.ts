// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * @internal Tracks which MCP server's request is currently being serviced.
 *
 * Deliberately not re-exported from `src/utils/index.ts` (the public
 * `@mapbox/mcp-server/utils` subpath): publishing `runWithServer` would let any
 * caller redirect a tool's elicitations and sampling at a server of their
 * choosing. Do not add it to the barrel.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// One store shared by every tool and resource, so a resource read invoked from
// inside a tool callback inherits that tool's server without any plumbing.
const activeServerStore = new AsyncLocalStorage<McpServer>();

/** Runs `fn`, and anything it awaits, with `server` as the active server. */
export function runWithServer<T>(server: McpServer, fn: () => T): T {
  return activeServerStore.run(server, fn);
}

/**
 * The server whose request we are servicing — *not* the server a component was
 * installed into. Every caller uses it to talk back to a client (logging,
 * elicitation, sampling), so the originating connection is the right target.
 * Code that wants the installation server instead (say, to notify subscribers
 * of a resource update) must reach for `this.server`.
 *
 * Undefined outside any registered tool callback or resource handler.
 */
export function getActiveServer(): McpServer | undefined {
  return activeServerStore.getStore();
}
