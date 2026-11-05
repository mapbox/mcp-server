// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { getAllTools } from '../../src/tools/toolRegistry.js';

// Mock getVersionInfo to avoid import.meta.url issues in vitest
vi.mock('../utils/versionUtils.js', () => ({
  getVersionInfo: vi.fn(() => ({
    name: 'Mapbox MCP server',
    version: '1.0.0',
    sha: 'mock-sha',
    tag: 'mock-tag',
    branch: 'mock-branch'
  }))
}));

function detectTupleUsage(schema: z.ZodType): string[] {
  const issues: string[] = [];

  function traverse(node: z.ZodType, path: string = ''): void {
    // Check if this is specifically a ZodTuple
    if (node instanceof z.ZodTuple) {
      issues.push(
        `${path}: z.tuple() detected - this causes JSON schema generation issues`
      );
    }

    // Traverse nested schemas. In zod 4, ZodArray's _def.type is the string
    // 'array', not the item schema, so use the public accessors.
    if (node instanceof z.ZodArray) {
      traverse(node.element as z.ZodType, `${path}[item]`);
    } else if (node instanceof z.ZodObject) {
      for (const [key, value] of Object.entries(node.shape)) {
        traverse(value as z.ZodType, path ? `${path}.${key}` : key);
      }
    } else if (node instanceof z.ZodUnion) {
      node.options.forEach((option, index) => {
        traverse(option as z.ZodType, `${path}[union_option_${index}]`);
      });
    } else if (
      node instanceof z.ZodOptional ||
      node instanceof z.ZodDefault ||
      node instanceof z.ZodNullable
    ) {
      traverse(node.unwrap() as z.ZodType, path);
    }
  }

  traverse(schema);
  return issues;
}

describe('Input Schema Validation - No Tuples', () => {
  // Dynamically get all tools from the central registry
  const tools = [...getAllTools()];

  const schemas = tools.map((tool) => ({
    name: tool.constructor.name,
    schema: (tool as { inputSchema: z.ZodType }).inputSchema
  }));

  it.each(schemas)(
    '$name should not contain z.tuple() usage',
    ({ name: _name, schema }) => {
      const tupleIssues = detectTupleUsage(schema);
      expect(tupleIssues).toEqual([]);
    }
  );

  // Negative test to ensure detection works
  it('should detect z.tuple() usage in test schemas', () => {
    const schemaWithTuple = z.object({
      coordinates: z.tuple([z.number(), z.number()]),
      data: z.object({
        nestedTuple: z.tuple([z.string(), z.boolean()])
      }),
      path: z.array(z.tuple([z.number(), z.number()])).optional()
    });

    const tupleIssues = detectTupleUsage(schemaWithTuple);
    expect(tupleIssues).toHaveLength(3);
    expect(tupleIssues[0]).toContain('coordinates: z.tuple() detected');
    expect(tupleIssues[1]).toContain('data.nestedTuple: z.tuple() detected');
    expect(tupleIssues[2]).toContain('path[item]: z.tuple() detected');
  });
});
