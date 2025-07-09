import { z } from 'zod';
import { CategorySearchTool } from './category-search-tool/CategorySearchTool.js';
import { DirectionsTool } from './directions-tool/DirectionsTool.js';
import { ForwardGeocodeTool } from './forward-geocode-tool/ForwardGeocodeTool.js';
import { IsochroneTool } from './isochrone-tool/IsochroneTool.js';
import { MatrixTool } from './matrix-tool/MatrixTool.js';
import { PoiSearchTool } from './poi-search-tool/PoiSearchTool.js';
import { ReverseGeocodeTool } from './reverse-geocode-tool/ReverseGeocodeTool.js';
import { StaticMapImageTool } from './static-map-image-tool/StaticMapImageTool.js';

function detectTupleUsage(schema: z.ZodType): string[] {
  const issues: string[] = [];

  function traverse(node: z.ZodType, path: string = ''): void {
    // Check if this is specifically a ZodTuple
    if (node instanceof z.ZodTuple) {
      issues.push(
        `${path}: z.tuple() detected - this causes JSON schema generation issues`
      );
    }

    // Traverse nested schemas
    if (node instanceof z.ZodArray) {
      if (node._def.type) {
        traverse(node._def.type, `${path}[item]`);
      }
    } else if (node instanceof z.ZodObject) {
      const shape = node._def.shape();
      for (const [key, value] of Object.entries(shape)) {
        traverse(value as z.ZodType, path ? `${path}.${key}` : key);
      }
    } else if (node instanceof z.ZodUnion) {
      node._def.options.forEach((option: z.ZodType, index: number) => {
        traverse(option, `${path}[union_option_${index}]`);
      });
    } else if (node instanceof z.ZodOptional) {
      traverse(node._def.innerType, path);
    } else if (node instanceof z.ZodDefault) {
      traverse(node._def.innerType, path);
    } else if (node instanceof z.ZodNullable) {
      traverse(node._def.innerType, path);
    }
  }

  traverse(schema);
  return issues;
}

describe('Schema Validation - No Tuples', () => {
  // Dynamically get all tool schemas
  const tools = [
    new DirectionsTool(),
    new CategorySearchTool(),
    new ForwardGeocodeTool(),
    new ReverseGeocodeTool(),
    new PoiSearchTool(),
    new MatrixTool(),
    new IsochroneTool(),
    new StaticMapImageTool()
  ];

  const schemas = tools.map((tool) => ({
    name: tool.constructor.name,
    schema: (tool as any).inputSchema
  }));

  test.each(schemas)(
    '$name should not contain z.tuple() usage',
    ({ name, schema }) => {
      const tupleIssues = detectTupleUsage(schema);
      expect(tupleIssues).toEqual([]);
    }
  );

  // Negative test to ensure detection works
  test('should detect z.tuple() usage in test schemas', () => {
    const schemaWithTuple = z.object({
      coordinates: z.tuple([z.number(), z.number()]),
      data: z.object({
        nestedTuple: z.tuple([z.string(), z.boolean()])
      })
    });

    const tupleIssues = detectTupleUsage(schemaWithTuple);
    expect(tupleIssues).toHaveLength(2);
    expect(tupleIssues[0]).toContain('coordinates: z.tuple() detected');
    expect(tupleIssues[1]).toContain('data.nestedTuple: z.tuple() detected');
  });
});
