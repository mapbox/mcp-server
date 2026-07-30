// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * DEV/TESTING ONLY. Minimal, unauthenticated Streamable HTTP entrypoint for
 * this MCP server, for testing against hosts that require a public HTTPS MCP
 * endpoint (e.g. ChatGPT's Apps SDK, which has no local/stdio support at
 * all) via a tunnel (ngrok, Cloudflare Tunnel) to this local port.
 *
 * This is NOT the production HTTP path — real hosted deployments go through
 * github.com/mapbox/hosted-mcp-server, which adds OAuth 2.0 Bearer auth,
 * rate limiting, and observability on top of this same @mapbox/mcp-server
 * package. This script skips all of that (auth is just MAPBOX_ACCESS_TOKEN
 * from the environment, same as stdio mode) to keep local testing simple.
 * Only tools + resources are registered (no prompts/completions/tracing) —
 * enough to test tool calls and MCP App rendering, not full parity with
 * src/index.ts.
 *
 * Usage:
 *   MAPBOX_ACCESS_TOKEN=sk.xxx npx tsx scripts/dev-http-server.ts
 *   # in another terminal:
 *   ngrok http 3333
 *   # then add https://<ngrok-id>.ngrok.app/mcp as a ChatGPT developer-mode
 *   # connector (Authentication: None).
 */

import { createServer } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  registerAppResource,
  RESOURCE_MIME_TYPE
} from '@modelcontextprotocol/ext-apps/server';
import {
  parseToolConfigFromArgs,
  filterTools
} from '../src/config/toolConfig.js';
import {
  getCoreTools,
  getElicitationTools
} from '../src/tools/toolRegistry.js';
import { getAllResources } from '../src/resources/resourceRegistry.js';
import { getVersionInfo } from '../src/utils/versionUtils.js';

function buildServer(): McpServer {
  const versionInfo = getVersionInfo();
  const config = parseToolConfigFromArgs();
  const enabledTools = [
    ...filterTools(getCoreTools(), config),
    ...filterTools(getElicitationTools(), config)
  ];
  const allResources = getAllResources();

  const server = new McpServer(
    { name: versionInfo.name, version: versionInfo.version },
    {
      capabilities: {
        tools: { listChanged: true },
        resources: {},
        logging: {}
      }
    }
  );

  enabledTools.forEach((tool) => tool.installTo(server));

  const uiResources = allResources.filter((r) => r.uri.startsWith('ui://'));
  const regularResources = allResources.filter(
    (r) => !r.uri.startsWith('ui://')
  );

  uiResources.forEach((resource) => {
    registerAppResource(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ext-apps' registerAppResource predates this SDK's McpServer type
      server as any,
      resource.name,
      resource.uri,

      {
        mimeType: RESOURCE_MIME_TYPE,
        description: resource.description
      } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- no per-request auth context in this dev server; tools fall back to MAPBOX_ACCESS_TOKEN
      async () => await resource.read(resource.uri, {} as any)
    );
  });
  regularResources.forEach((resource) => resource.installTo(server));

  return server;
}

const PORT = Number(process.env.PORT) || 3333;

const httpServer = createServer((req, res) => {
  if (req.url !== '/mcp') {
    res.writeHead(404).end();
    return;
  }
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' }).end(
      JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Method not allowed.' },
        id: null
      })
    );
    return;
  }

  // Stateless: a fresh server + transport per request, matching the SDK's
  // own simpleStatelessStreamableHttp example — simplest possible model for
  // manual testing, no session/resumability concerns to worry about.
  void (async () => {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' }).end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error' },
            id: null
          })
        );
      }
    }
  })();
});

httpServer.listen(PORT, () => {
  console.log(
    `[dev-http-server] MCP Streamable HTTP listening on http://localhost:${PORT}/mcp (DEV/TEST ONLY, no auth)`
  );
  if (!process.env.MAPBOX_ACCESS_TOKEN) {
    console.warn(
      '[dev-http-server] MAPBOX_ACCESS_TOKEN is not set - tools requiring it will fail.'
    );
  }
});

process.on('SIGINT', () => {
  console.log('\n[dev-http-server] Shutting down...');
  process.exit(0);
});
