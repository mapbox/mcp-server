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
 * Same failure mode as hostedMultiTaskFollowup.test.ts, for
 * `static_map_image_tool`'s large-image fallback: a response over the 700KB
 * inline threshold used to be stored via `temporaryResourceManager` (an
 * in-process `Map`) and returned as a `mapbox://temp/static-map-{id}` ref.
 * On the hosted deployment's stateless, multi-ECS-task setup, a follow-up
 * `resources/read` landing on a different task than the one that fetched
 * the image found nothing.
 *
 * This proves the fix (a self-describing `mapbox://inline-image/` ref — see
 * inlineImageRef.ts) survives exactly that: the ref is produced by one real,
 * spawned server process, that process is killed outright, and a second,
 * completely independent process re-fetches the image from the ref's own
 * request params via a real `resources/read` call — no bytes, store, or
 * memory of any kind carried over from the original process.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = join(__dirname, '..', '..', 'dist', 'esm', 'index.js');

const DUMMY_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

// Larger than the tool's 700KB inline threshold, and filled with a
// non-trivial byte pattern so a truncation or off-by-one bug in the
// encode/decode path would be caught by an exact equality check.
const BIG_IMAGE = Buffer.alloc(750 * 1024);
for (let i = 0; i < BIG_IMAGE.length; i++) {
  BIG_IMAGE[i] = i % 256;
}

let mockStaticApi: Server;
let mockApiEndpoint: string;

beforeAll(async () => {
  mockStaticApi = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'image/png' });
    res.end(BIG_IMAGE);
  });
  await new Promise<void>((resolve) => {
    mockStaticApi.listen(0, '127.0.0.1', resolve);
  });
  const address = mockStaticApi.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind mock Static Images API server');
  }
  mockApiEndpoint = `http://127.0.0.1:${address.port}/`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    mockStaticApi.close((err) => (err ? reject(err) : resolve()));
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
    name: 'hosted-multi-task-followup-static-map-test',
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
  'hosted stateless follow-up for static_map_image_tool (real server process, real MCP protocol, simulated two-task deployment)',
  () => {
    it('reads a large static_map_image_tool inline-image ref from a completely independent process, with zero shared state', async () => {
      const taskA = await spawnFreshServerClient();
      let resourceUri: string | undefined;

      try {
        const result = await taskA.callTool({
          name: 'static_map_image_tool',
          arguments: {
            center: { longitude: -74.006, latitude: 40.7128 },
            zoom: 12,
            size: { width: 1280, height: 900 },
            style: 'mapbox/streets-v12'
          }
        });
        expect(result.isError).toBeFalsy();

        const textBlock = (
          result.content as Array<{ type: string; text?: string }>
        ).find((c) => c.type === 'text' && c.text?.includes('inline-image'));
        expect(textBlock?.text).toContain('exceeds the inline size limit');

        resourceUri = textBlock!.text!.match(
          /mapbox:\/\/inline-image\/\S+/
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
        const contentItem = (
          readResult.contents as Array<{ mimeType?: string; blob?: string }>
        )[0];
        expect(contentItem?.mimeType).toBe('image/png');
        expect(Buffer.from(contentItem!.blob as string, 'base64')).toEqual(
          BIG_IMAGE
        );
      } finally {
        await closeClient(taskB);
      }
    });
  }
);
