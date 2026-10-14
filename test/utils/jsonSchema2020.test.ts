// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  JSON_SCHEMA_2020_12,
  publishJsonSchema2020,
  toJsonSchema2020
} from '../../src/utils/jsonSchema2020.js';
import { getAllTools } from '../../src/tools/toolRegistry.js';

const DRAFT_07 = 'http://json-schema.org/draft-07/schema#';

// Collects every draft-07-only construct left anywhere in a schema.
function draft07Leftovers(node: unknown, path = '$'): string[] {
  if (typeof node !== 'object' || node === null) return [];
  if (Array.isArray(node)) {
    return node.flatMap((n, i) => draft07Leftovers(n, `${path}[${i}]`));
  }
  const obj = node as Record<string, unknown>;
  const found: string[] = [];
  if (Array.isArray(obj.items)) found.push(`${path}.items[]`);
  if ('additionalItems' in obj) found.push(`${path}.additionalItems`);
  if ('definitions' in obj) found.push(`${path}.definitions`);
  if (obj.$schema === DRAFT_07) found.push(`${path}.$schema`);
  for (const [k, v] of Object.entries(obj)) {
    found.push(...draft07Leftovers(v, `${path}.${k}`));
  }
  return found;
}

describe('toJsonSchema2020', () => {
  it('relabels the root $schema', () => {
    expect(
      toJsonSchema2020({ $schema: DRAFT_07, type: 'object', properties: {} })
    ).toEqual({ $schema: JSON_SCHEMA_2020_12, type: 'object', properties: {} });
  });

  it('converts tuple items to prefixItems, nested anywhere', () => {
    const out = toJsonSchema2020({
      $schema: DRAFT_07,
      type: 'object',
      properties: {
        bbox: {
          type: 'array',
          items: [{ type: 'number' }, { type: 'number' }]
        },
        lines: {
          anyOf: [
            {
              type: 'array',
              items: {
                type: 'array',
                items: [{ type: 'number' }, { type: 'number' }]
              }
            }
          ]
        }
      }
    });
    expect(out).toEqual({
      $schema: JSON_SCHEMA_2020_12,
      type: 'object',
      properties: {
        bbox: {
          type: 'array',
          prefixItems: [{ type: 'number' }, { type: 'number' }]
        },
        lines: {
          anyOf: [
            {
              type: 'array',
              items: {
                type: 'array',
                prefixItems: [{ type: 'number' }, { type: 'number' }]
              }
            }
          ]
        }
      }
    });
  });

  it('maps additionalItems on a tuple to items', () => {
    expect(
      toJsonSchema2020({
        type: 'array',
        items: [{ type: 'string' }],
        additionalItems: { type: 'number' }
      })
    ).toEqual({
      $schema: JSON_SCHEMA_2020_12,
      type: 'array',
      prefixItems: [{ type: 'string' }],
      items: { type: 'number' }
    });
  });

  it('moves definitions to $defs and rewrites refs', () => {
    expect(
      toJsonSchema2020({
        $schema: DRAFT_07,
        definitions: { pt: { type: 'number' } },
        properties: { a: { $ref: '#/definitions/pt' } }
      })
    ).toEqual({
      $schema: JSON_SCHEMA_2020_12,
      $defs: { pt: { type: 'number' } },
      properties: { a: { $ref: '#/$defs/pt' } }
    });
  });

  it('never treats a property named like a keyword as a keyword', () => {
    const schema = {
      $schema: DRAFT_07,
      type: 'object',
      properties: {
        items: { type: 'array', items: { type: 'string' } },
        definitions: { type: 'string' }
      }
    };
    expect(toJsonSchema2020(schema)).toEqual({
      ...schema,
      $schema: JSON_SCHEMA_2020_12
    });
  });

  it('leaves a schema that declares another dialect untouched', () => {
    const schema = {
      $schema: JSON_SCHEMA_2020_12,
      type: 'array',
      prefixItems: [{ type: 'number' }]
    };
    expect(toJsonSchema2020(schema)).toBe(schema);
  });
});

describe('publishJsonSchema2020', () => {
  async function listTools(publish: boolean) {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    if (publish) publishJsonSchema2020(server);
    for (const tool of getAllTools()) tool.installTo(server);
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport)
    ]);
    const { tools } = await client.listTools();
    await client.close();
    return tools;
  }

  // Regression: Claude Desktop rejected every tool call with "Tool
  // 'search_and_geocode_tool' has an invalid outputSchema: JSON Schema
  // declares an unsupported dialect" because the SDK emits draft-07.
  it('publishes every tool schema as JSON Schema 2020-12', async () => {
    const tools = await listTools(true);
    expect(tools.length).toBe(getAllTools().length);
    for (const tool of tools) {
      expect(tool.inputSchema.$schema, tool.name).toBe(JSON_SCHEMA_2020_12);
      expect(draft07Leftovers(tool.inputSchema), tool.name).toEqual([]);
      if (tool.outputSchema) {
        expect(tool.outputSchema.$schema, tool.name).toBe(JSON_SCHEMA_2020_12);
        expect(draft07Leftovers(tool.outputSchema), tool.name).toEqual([]);
      }
    }
  });

  it('is needed: the SDK alone publishes draft-07 with tuple items', async () => {
    const tools = await listTools(false);
    const leftovers = tools.flatMap((t) => [
      ...draft07Leftovers(t.inputSchema),
      ...draft07Leftovers(t.outputSchema)
    ]);
    expect(leftovers.some((l) => l.endsWith('.$schema'))).toBe(true);
    expect(leftovers.some((l) => l.endsWith('.items[]'))).toBe(true);
  });

  it('keeps tool calls working with structured output validation', async () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    publishJsonSchema2020(server);
    const bbox = getAllTools().find((t) => t.name === 'bbox_tool')!;
    bbox.installTo(server);
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([
      server.connect(serverTransport),
      client.connect(clientTransport)
    ]);
    await client.listTools();
    const result = await client.callTool({
      name: 'bbox_tool',
      arguments: {
        geometry: [
          [-122.4, 37.7],
          [-122.3, 37.8]
        ]
      }
    });
    expect(result.isError).toBeFalsy();
    // bbox is a tuple in the output schema — the field the conversion
    // rewrites to prefixItems.
    expect(result.structuredContent).toEqual({
      bbox: [-122.4, 37.7, -122.3, 37.8]
    });
    await client.close();
  });
});
