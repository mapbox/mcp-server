// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { SimplifyTool } from '../../../src/tools/simplify-tool/SimplifyTool.js';

describe('SimplifyTool', () => {
  const tool = new SimplifyTool();

  it('should simplify a linestring with default tolerance', async () => {
    // Create a zigzag line with many vertices
    const result = await tool.run({
      geometry: [
        [0, 0],
        [0.1, 0.01],
        [0.2, 0],
        [0.3, 0.01],
        [0.4, 0],
        [0.5, 0.01],
        [0.6, 0],
        [0.7, 0.01],
        [0.8, 0],
        [0.9, 0.01],
        [1, 0]
      ]
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.originalVertexCount).toBe(11);
    expect(result.structuredContent?.simplifiedVertexCount).toBeLessThan(11);
    expect(result.structuredContent?.reductionPercentage).toBeGreaterThan(0);
    expect(result.structuredContent?.simplified).toBeDefined();
    expect(Array.isArray(result.structuredContent?.simplified)).toBe(true);
  });

  it('should simplify a linestring with custom tolerance', async () => {
    const geometry = [
      [0, 0],
      [1, 0.5],
      [2, 0],
      [3, 0.5],
      [4, 0],
      [5, 0]
    ];

    const result = await tool.run({
      geometry,
      tolerance: 0.5
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.originalVertexCount).toBe(6);
    expect(result.structuredContent?.simplifiedVertexCount).toBeLessThan(6);
  });

  it('should simplify more aggressively with higher tolerance', async () => {
    const geometry = [
      [0, 0],
      [1, 0.1],
      [2, 0.2],
      [3, 0.1],
      [4, 0.2],
      [5, 0.1],
      [6, 0]
    ];

    const resultLow = await tool.run({
      geometry,
      tolerance: 0.1
    });

    const resultHigh = await tool.run({
      geometry,
      tolerance: 0.5
    });

    expect(resultLow.isError).toBe(false);
    expect(resultHigh.isError).toBe(false);
    // Higher tolerance should result in fewer vertices
    expect(
      resultHigh.structuredContent?.simplifiedVertexCount
    ).toBeLessThanOrEqual(
      resultLow.structuredContent?.simplifiedVertexCount || Infinity
    );
  });

  it('should simplify a polygon', async () => {
    const result = await tool.run({
      geometry: [
        [
          [0, 0],
          [1, 0.1],
          [2, 0],
          [2.1, 1],
          [2, 2],
          [1, 2.1],
          [0, 2],
          [-0.1, 1],
          [0, 0]
        ]
      ],
      tolerance: 0.2
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.originalVertexCount).toBe(9);
    expect(result.structuredContent?.simplifiedVertexCount).toBeLessThan(9);
    expect(result.structuredContent?.simplified).toBeDefined();
    // Result should still be a polygon (array of array of coordinates)
    expect(Array.isArray(result.structuredContent?.simplified)).toBe(true);
  });

  it('should use high quality mode', async () => {
    const geometry = [
      [0, 0],
      [1, 0.5],
      [2, 0],
      [3, 0.5],
      [4, 0]
    ];

    const result = await tool.run({
      geometry,
      tolerance: 0.6,
      highQuality: true
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.simplifiedVertexCount).toBeLessThanOrEqual(
      5
    );
    expect(
      result.structuredContent?.simplifiedVertexCount
    ).toBeGreaterThanOrEqual(2);
  });

  it('should handle straight line (minimal simplification needed)', async () => {
    const result = await tool.run({
      geometry: [
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0],
        [4, 0]
      ],
      tolerance: 0.01
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.originalVertexCount).toBe(5);
    // Straight line should simplify to just endpoints
    expect(result.structuredContent?.simplifiedVertexCount).toBe(2);
    expect(result.structuredContent?.reductionPercentage).toBe(60);
  });

  it('should handle complex curved line', async () => {
    // Create a sine wave
    const sineWave: [number, number][] = [];
    for (let i = 0; i <= 20; i++) {
      sineWave.push([i, Math.sin(i / 3)]);
    }

    const result = await tool.run({
      geometry: sineWave,
      tolerance: 0.1
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.originalVertexCount).toBe(21);
    expect(result.structuredContent?.simplifiedVertexCount).toBeLessThan(21);
    expect(result.structuredContent?.reductionPercentage).toBeGreaterThan(0);
  });

  it('should calculate reduction percentage correctly', async () => {
    const result = await tool.run({
      geometry: [
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0],
        [4, 0]
      ],
      tolerance: 0.01
    });

    expect(result.isError).toBe(false);
    const original = result.structuredContent?.originalVertexCount || 0;
    const simplified = result.structuredContent?.simplifiedVertexCount || 0;
    const expectedReduction = Math.round(
      ((original - simplified) / original) * 100
    );
    expect(result.structuredContent?.reductionPercentage).toBe(
      expectedReduction
    );
  });

  it('should preserve first and last points', async () => {
    const geometry = [
      [0, 0],
      [1, 0.5],
      [2, 0],
      [3, 0.5],
      [4, 0]
    ];

    const result = await tool.run({
      geometry,
      tolerance: 0.5
    });

    expect(result.isError).toBe(false);
    const simplified = result.structuredContent?.simplified as [
      number,
      number
    ][];
    expect(simplified[0]).toEqual([0, 0]);
    expect(simplified[simplified.length - 1]).toEqual([4, 0]);
  });

  it('should handle very small tolerance (minimal simplification)', async () => {
    const result = await tool.run({
      geometry: [
        [0, 0],
        [1, 0.001],
        [2, 0.002],
        [3, 0.001],
        [4, 0]
      ],
      tolerance: 0.0001
    });

    expect(result.isError).toBe(false);
    // Very small tolerance should preserve most vertices
    expect(result.structuredContent?.simplifiedVertexCount).toBeGreaterThan(2);
  });

  it('should handle polygon with hole', async () => {
    const result = await tool.run({
      geometry: [
        // Outer ring
        [
          [0, 0],
          [1, 0.1],
          [2, 0],
          [2.1, 1],
          [2, 2],
          [1, 2.1],
          [0, 2],
          [-0.1, 1],
          [0, 0]
        ],
        // Inner ring (hole)
        [
          [0.5, 0.5],
          [1, 0.6],
          [1.5, 0.5],
          [1.4, 1],
          [1.5, 1.5],
          [1, 1.4],
          [0.5, 1.5],
          [0.6, 1],
          [0.5, 0.5]
        ]
      ],
      tolerance: 0.2
    });

    expect(result.isError).toBe(false);
    // Original: 9 + 9 = 18 vertices
    expect(result.structuredContent?.originalVertexCount).toBe(18);
    expect(result.structuredContent?.simplifiedVertexCount).toBeLessThan(18);
  });

  it('should handle real world coordinates', async () => {
    const result = await tool.run({
      geometry: [
        [-122.4194, 37.7749], // San Francisco
        [-122.3, 37.8],
        [-122.2, 37.75],
        [-122.1, 37.8],
        [-122.0, 37.7749] // Oakland area
      ],
      tolerance: 0.05
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.originalVertexCount).toBe(5);
    expect(result.structuredContent?.simplifiedVertexCount).toBeLessThanOrEqual(
      5
    );
  });

  it('should handle square polygon (should simplify to 5 points including closure)', async () => {
    const result = await tool.run({
      geometry: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0]
        ]
      ],
      tolerance: 0.01
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.originalVertexCount).toBe(5);
    // Perfect square should not simplify much (all corners are significant)
    expect(result.structuredContent?.simplifiedVertexCount).toBe(5);
    expect(result.structuredContent?.reductionPercentage).toBe(0);
  });

  it('should handle triangle (minimal vertices, no simplification)', async () => {
    const result = await tool.run({
      geometry: [
        [
          [0, 0],
          [1, 0],
          [0.5, 1],
          [0, 0]
        ]
      ],
      tolerance: 0.1
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.originalVertexCount).toBe(4);
    // Triangle should not simplify (all vertices are needed)
    expect(result.structuredContent?.simplifiedVertexCount).toBe(4);
    expect(result.structuredContent?.reductionPercentage).toBe(0);
  });

  it('should handle negative coordinates', async () => {
    const result = await tool.run({
      geometry: [
        [-10, -10],
        [-9, -9.5],
        [-8, -10],
        [-7, -9.5],
        [-6, -10]
      ],
      tolerance: 0.5
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent?.simplifiedVertexCount).toBeLessThan(5);
  });

  it('should return simplified geometry in same format as input', async () => {
    // Test linestring
    const lineResult = await tool.run({
      geometry: [
        [0, 0],
        [1, 0.5],
        [2, 0]
      ]
    });

    expect(lineResult.isError).toBe(false);
    expect(Array.isArray(lineResult.structuredContent?.simplified)).toBe(true);
    expect(Array.isArray(lineResult.structuredContent?.simplified[0])).toBe(
      true
    );

    // Test polygon
    const polyResult = await tool.run({
      geometry: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0]
        ]
      ]
    });

    expect(polyResult.isError).toBe(false);
    expect(Array.isArray(polyResult.structuredContent?.simplified)).toBe(true);
    expect(Array.isArray(polyResult.structuredContent?.simplified[0])).toBe(
      true
    );
  });
});
