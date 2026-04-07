// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import {
  completePromptArgument,
  TRANSPORT_MODES,
  MAPBOX_CATEGORIES
} from '../../src/completions/index.js';

describe('completePromptArgument', () => {
  describe('category completions', () => {
    it('returns matching categories for prefix', () => {
      const result = completePromptArgument(
        'find-places-nearby',
        'category',
        'rest'
      );
      expect(result.values).toContain('restaurant');
      expect(result.values).toContain('rest_area');
      expect(result.values.every((v) => v.startsWith('rest'))).toBe(true);
    });

    it('returns capped results for empty value', () => {
      const result = completePromptArgument(
        'find-places-nearby',
        'category',
        ''
      );
      expect(result.values.length).toBe(100);
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(MAPBOX_CATEGORIES.length);
    });
  });

  describe('mode completions', () => {
    it('returns matching transport modes for prefix', () => {
      const result = completePromptArgument('get-directions', 'mode', 'dr');
      expect(result.values).toEqual(['driving', 'driving-traffic']);
    });

    it('returns all transport modes for empty value', () => {
      const result = completePromptArgument('get-directions', 'mode', '');
      expect(result.values).toEqual([...TRANSPORT_MODES]);
    });

    it('works for search-along-route', () => {
      const result = completePromptArgument('search-along-route', 'mode', 'w');
      expect(result.values).toEqual(['walking']);
    });

    it('works for show-reachable-areas', () => {
      const result = completePromptArgument(
        'show-reachable-areas',
        'mode',
        'c'
      );
      expect(result.values).toEqual(['cycling']);
    });

    it('is case-insensitive', () => {
      const result = completePromptArgument('get-directions', 'mode', 'Walk');
      expect(result.values).toEqual(['walking']);
    });
  });

  describe('edge cases', () => {
    it('returns empty for free-text arguments', () => {
      const result = completePromptArgument(
        'find-places-nearby',
        'location',
        'sea'
      );
      expect(result.values).toEqual([]);
    });

    it('returns empty for unknown prompt', () => {
      const result = completePromptArgument('nonexistent', 'mode', '');
      expect(result.values).toEqual([]);
    });

    it('returns empty for unknown argument', () => {
      const result = completePromptArgument(
        'get-directions',
        'nonexistent',
        ''
      );
      expect(result.values).toEqual([]);
    });

    it('returns empty for no matches', () => {
      const result = completePromptArgument('get-directions', 'mode', 'zzz');
      expect(result.values).toEqual([]);
    });
  });
});
