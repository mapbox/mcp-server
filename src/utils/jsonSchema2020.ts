// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

export const JSON_SCHEMA_2020_12 =
  'https://json-schema.org/draft/2020-12/schema';
const JSON_SCHEMA_DRAFT_07 = 'http://json-schema.org/draft-07/schema#';

type Schema = Record<string, unknown>;

function isObject(value: unknown): value is Schema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Keywords whose value is a single subschema.
const SUBSCHEMA_KEYWORDS = [
  'additionalProperties',
  'contains',
  'propertyNames',
  'not',
  'if',
  'then',
  'else'
];
// Keywords whose value is an array of subschemas.
const SUBSCHEMA_ARRAY_KEYWORDS = ['anyOf', 'oneOf', 'allOf'];
// Keywords whose value maps names to subschemas — the names themselves are
// data (e.g. a property literally called "items"), never keywords.
const SUBSCHEMA_MAP_KEYWORDS = [
  'properties',
  'patternProperties',
  '$defs',
  'dependentSchemas'
];

/**
 * Convert one draft-07 schema node (and everything under it) to its JSON
 * Schema 2020-12 equivalent. Covers what zod's draft-07 output can contain:
 * tuple `items: [...]` → `prefixItems` (with `additionalItems` → `items`),
 * `definitions` → `$defs` (and `#/definitions/` refs to match). Walks only
 * real subschema positions, so property names are never mistaken for
 * keywords.
 */
function convertNode(node: unknown): unknown {
  if (!isObject(node)) return node;
  const out: Schema = { ...node };

  if ('definitions' in out) {
    out.$defs = { ...(out.$defs as Schema), ...(out.definitions as Schema) };
    delete out.definitions;
  }
  if (typeof out.$ref === 'string' && out.$ref.startsWith('#/definitions/')) {
    out.$ref = '#/$defs/' + out.$ref.slice('#/definitions/'.length);
  }

  if (Array.isArray(out.items)) {
    out.prefixItems = out.items.map(convertNode);
    if ('additionalItems' in out) {
      out.items = convertNode(out.additionalItems);
      delete out.additionalItems;
    } else {
      delete out.items;
    }
  } else if ('items' in out) {
    out.items = convertNode(out.items);
  }

  for (const key of SUBSCHEMA_KEYWORDS) {
    if (key in out) out[key] = convertNode(out[key]);
  }
  for (const key of SUBSCHEMA_ARRAY_KEYWORDS) {
    if (Array.isArray(out[key])) {
      out[key] = (out[key] as unknown[]).map(convertNode);
    }
  }
  for (const key of SUBSCHEMA_MAP_KEYWORDS) {
    if (isObject(out[key])) {
      out[key] = Object.fromEntries(
        Object.entries(out[key] as Schema).map(([name, sub]) => [
          name,
          convertNode(sub)
        ])
      );
    }
  }
  return out;
}

/**
 * Convert a draft-07 root schema to JSON Schema 2020-12 and label it as
 * such. A schema that already declares another dialect is returned
 * unchanged.
 */
export function toJsonSchema2020(schema: unknown): unknown {
  if (!isObject(schema)) return schema;
  if (schema.$schema !== undefined && schema.$schema !== JSON_SCHEMA_DRAFT_07) {
    return schema;
  }
  const converted = convertNode(schema) as Schema;
  converted.$schema = JSON_SCHEMA_2020_12;
  return converted;
}

/**
 * Make `tools/list` publish JSON Schema 2020-12 instead of draft-07.
 *
 * MCP SDK 1.x's McpServer generates every tool's inputSchema/outputSchema
 * as draft-07 (with no option to change it), but MCP specifies 2020-12 as
 * the default dialect, and newer clients enforce that — Claude Desktop
 * refuses to call any tool whose outputSchema declares draft-07 ("JSON
 * Schema declares an unsupported dialect ... The default validator
 * supports JSON Schema 2020-12 only").
 *
 * McpServer installs its tools/list handler through the public
 * setRequestHandler on first tool registration, so this wraps that method
 * on this one server instance (not a global patch) and converts the
 * schemas in the handler's result. Must be called before any tool is
 * registered.
 */
export function publishJsonSchema2020(server: McpServer): void {
  const inner = server.server;
  const listToolsMethod = ListToolsRequestSchema.shape.method.value;
  const original = inner.setRequestHandler.bind(inner);

  // setRequestHandler's generic signature can't be expressed for a wrapper
  // without re-declaring the SDK's internal schema types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (inner as any).setRequestHandler = (requestSchema: any, handler: any) => {
    if (requestSchema?.shape?.method?.value !== listToolsMethod) {
      return original(requestSchema, handler);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return original(requestSchema, async (request: any, extra: any) => {
      const result = await handler(request, extra);
      return {
        ...result,
        tools: result.tools.map((tool: Schema) => ({
          ...tool,
          inputSchema: toJsonSchema2020(tool.inputSchema),
          ...(tool.outputSchema !== undefined && {
            outputSchema: toJsonSchema2020(tool.outputSchema)
          })
        }))
      };
    });
  };
}
