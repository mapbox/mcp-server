// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/**
 * Spawns the *actual built server* (dist/esm/index.js — the same entry point
 * `bin: mcp-server` resolves to) as a real child process and drives it over
 * real stdio with a real MCP client. Every other test in this suite either
 * calls tool classes directly or runs the iframe script in a Node `vm`
 * sandbox — none of them cross an actual process boundary. That gap matters
 * specifically here: the original bug this repo spent a branch fixing
 * (`mapbox://temp/...` refs vanishing when the server process restarts, e.g.
 * on a Claude Desktop relaunch) can only be reproduced, and only stays fixed,
 * by proving a ref survives being handed to a *second, unrelated* process —
 * not by asserting the ref's format is stateless and trusting that nothing
 * else quietly reintroduced a process-local dependency.
 *
 * CI runs `npm run build` before `npm test` (.github/workflows/test.yml), so
 * dist/esm/index.js exists there. Locally, run `npm run build` first — the
 * suite skips itself with a clear reason if the build is missing rather than
 * failing opaquely.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = join(__dirname, '..', '..', 'dist', 'esm', 'index.js');

// Neither union_tool nor render_map_tool extend MapboxApiBasedTool (they do
// no network I/O), so no real Mapbox token is required — this stays fully
// offline. A JWT-shaped dummy is passed anyway so nothing downstream trips
// on token-format validation performed at a different layer.
const DUMMY_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

async function spawnFreshServerClient(): Promise<Client> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_ENTRY],
    env: {
      MAPBOX_ACCESS_TOKEN: DUMMY_TOKEN,
      PATH: process.env.PATH ?? ''
    }
  });
  const client = new Client({
    name: 'process-restart-integration-test',
    version: '1.0.0'
  });
  await client.connect(transport);
  return client;
}

function readResourceText(rr: unknown): unknown {
  const contents = (rr as { contents?: Array<{ text?: string }> }).contents;
  const text = contents?.[0]?.text;
  expect(text).toBeTruthy();
  return JSON.parse(text as string);
}

describe.skipIf(!existsSync(SERVER_ENTRY))(
  'process restart survival (real server process, real MCP protocol)',
  () => {
    it("resolves a compute ref and render_map_tool's own merged-output ref against a brand-new server process with zero shared state", async () => {
      const clientA = await spawnFreshServerClient();

      let computeRef: string | undefined;
      let finalRef: string | undefined;

      try {
        // 1. First hop: a data tool (union_tool) emits a self-describing
        //    mapbox://compute/... ref. Nothing has been stored server-side.
        const unionResult = await clientA.callTool({
          name: 'union_tool',
          arguments: {
            polygons: [
              [
                [
                  [-10, -10],
                  [10, -10],
                  [10, 10],
                  [-10, 10],
                  [-10, -10]
                ]
              ],
              [
                [
                  [0, 0],
                  [20, 0],
                  [20, 20],
                  [0, 20],
                  [0, 0]
                ]
              ]
            ]
          }
        });
        expect(unionResult.isError).toBeFalsy();
        const unionSc = unionResult.structuredContent as {
          mapboxRender?: { ref?: string };
        };
        computeRef = unionSc.mapboxRender?.ref;
        expect(computeRef).toMatch(/^mapbox:\/\/compute\/union\?data=/);

        // 2. Second hop: render_map_tool merges that ref into its own
        //    output ref — the one every MCP App host actually re-fetches
        //    when a map card is redisplayed. This is the specific ref that
        //    used to be backed by the ephemeral in-memory store regardless
        //    of how stateless the *input* ref was.
        const renderResult = await clientA.callTool({
          name: 'render_map_tool',
          arguments: { payload_refs: [computeRef] }
        });
        expect(renderResult.isError).toBeFalsy();
        const renderSc = renderResult.structuredContent as {
          layer_count?: number;
          mapboxRender?: { ref?: string };
        };
        expect(renderSc.layer_count).toBeGreaterThan(0);
        finalRef = renderSc.mapboxRender?.ref;
        expect(finalRef).toBeTruthy();
      } finally {
        await closeClient(clientA);
      }

      // 3. Kill that process entirely and spawn a completely independent
      //    one — no shared memory, no shared temp-file store, nothing
      //    carried over except the two ref strings themselves.
      const clientB = await spawnFreshServerClient();
      try {
        const finalPayload = readResourceText(
          await clientB.readResource({ uri: finalRef! })
        ) as { layers?: unknown[] };
        expect(Array.isArray(finalPayload.layers)).toBe(true);
        expect(finalPayload.layers!.length).toBeGreaterThan(0);

        // The first-hop compute ref survives independently too — it was
        // never depending on render_map_tool's process either.
        const computePayload = readResourceText(
          await clientB.readResource({ uri: computeRef! })
        ) as { layers?: unknown[] };
        expect(Array.isArray(computePayload.layers)).toBe(true);
      } finally {
        await closeClient(clientB);
      }
    });
  }
);

async function closeClient(client: Client): Promise<void> {
  await client.close().catch(() => {
    // Already closed or the process exited on its own — nothing to clean up.
  });
}
