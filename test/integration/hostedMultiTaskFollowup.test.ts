// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type Server } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/**
 * Reproduces the hosted deployment's actual failure mode: a large
 * `directions_tool` result used to return a `mapbox://temp/directions-{id}`
 * ref backed by an in-process `Map` (`temporaryResourceManager`). The hosted
 * deployment runs multiple stateless ECS tasks behind a load balancer with
 * no session stickiness — every `POST /mcp` can land on a different task,
 * and each task's `McpServer` is freshly created per request. A ref only
 * readable on the one task that happened to handle the original call would
 * return "not found" whenever the follow-up `resources/read` landed on a
 * different task — indistinguishable from staleness or "still computing"
 * (it isn't; Directions is synchronous and already finished).
 *
 * This test proves the fix (a self-describing `mapbox://inline-response/`
 * ref — see inlineResponseRef.ts) survives exactly that scenario: the ref
 * is produced by one real, spawned server process, that process is killed
 * outright, and a second, completely independent process — standing in for
 * a different ECS task with zero shared memory — resolves it successfully
 * via a real `resources/read` call over the real MCP protocol.
 *
 * A tiny local HTTP server stands in for the Mapbox Directions API (via
 * MAPBOX_API_ENDPOINT) so this stays fully offline/deterministic rather
 * than depending on a real network call to api.mapbox.com — the point
 * under test is the ref's cross-process behavior, not live routing data.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = join(__dirname, '..', '..', 'dist', 'esm', 'index.js');

const DUMMY_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

// A LineString long enough that the cleaned response exceeds the tool's
// 50KB inline threshold, mirroring a real overview=full long-route response.
const BIG_GEOMETRY = {
  type: 'LineString',
  coordinates: Array.from({ length: 8000 }, (_, i) => [
    -0.1278 + i * 0.0001,
    51.5074 + i * 0.0001
  ])
};

const MOCK_DIRECTIONS_RESPONSE = {
  code: 'Ok',
  routes: [
    {
      distance: 671000,
      duration: 26400,
      geometry: BIG_GEOMETRY,
      legs: [{ summary: 'A1, M1, A68' }]
    }
  ],
  waypoints: [
    { location: [-0.1278, 51.5074], name: '' },
    { location: [-3.1883, 55.9533], name: '' }
  ]
};

let mockDirectionsApi: Server;
let mockApiEndpoint: string;

beforeAll(async () => {
  mockDirectionsApi = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(MOCK_DIRECTIONS_RESPONSE));
  });
  await new Promise<void>((resolve) => {
    mockDirectionsApi.listen(0, '127.0.0.1', resolve);
  });
  const address = mockDirectionsApi.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind mock Directions API server');
  }
  mockApiEndpoint = `http://127.0.0.1:${address.port}/`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    mockDirectionsApi.close((err) => (err ? reject(err) : resolve()));
  });
});

async function spawnFreshServerClient(): Promise<Client> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_ENTRY],
    env: {
      MAPBOX_ACCESS_TOKEN: DUMMY_TOKEN,
      MAPBOX_API_ENDPOINT: mockApiEndpoint,
      PATH: process.env.PATH ?? ''
    }
  });
  const client = new Client({
    name: 'hosted-multi-task-followup-test',
    version: '1.0.0'
  });
  await client.connect(transport);
  return client;
}

async function closeClient(client: Client): Promise<void> {
  await client.close().catch(() => {
    // Already closed or the process exited on its own.
  });
}

describe.skipIf(!existsSync(SERVER_ENTRY))(
  'hosted stateless follow-up (real server process, real MCP protocol, simulated two-task deployment)',
  () => {
    it('reads a large directions_tool inline-response ref from a completely independent process, with zero shared state', async () => {
      // Process A: stands in for the ECS task that handles the original
      // tool call.
      const taskA = await spawnFreshServerClient();
      let resourceUri: string | undefined;

      try {
        const result = await taskA.callTool({
          name: 'directions_tool',
          arguments: {
            coordinates: [
              { longitude: -0.1278, latitude: 51.5074 },
              { longitude: -3.1883, latitude: 55.9533 }
            ],
            geometries: 'geojson',
            overview: 'full'
          }
        });
        expect(result.isError).toBeFalsy();

        const textBlock = (
          result.content as Array<{ type: string; text?: string }>
        ).find((c) => c.type === 'text');
        expect(textBlock?.text).toContain('exceeds context limit');

        resourceUri = textBlock!.text!.match(
          /mapbox:\/\/inline-response\/\S+/
        )?.[0];
        expect(resourceUri).toBeTruthy();
      } finally {
        // Kill task A entirely — no shared memory, no shared temp-file
        // store, nothing carried over except the ref string itself.
        await closeClient(taskA);
      }

      // Process B: a completely independent process/task that never saw
      // the original call, standing in for the ALB routing the follow-up
      // resources/read to a different ECS task.
      const taskB = await spawnFreshServerClient();
      try {
        const readResult = await taskB.readResource({ uri: resourceUri! });
        const text = (readResult.contents as Array<{ text?: string }>)[0]?.text;
        expect(text).toBeTruthy();

        const resolved = JSON.parse(text as string) as {
          routes?: Array<{
            distance?: number;
            geometry?: { coordinates?: unknown[] };
          }>;
        };
        expect(resolved.routes?.[0]?.distance).toBe(671000);
        expect(resolved.routes?.[0]?.geometry?.coordinates).toHaveLength(8000);
      } finally {
        await closeClient(taskB);
      }
    });
  }
);
