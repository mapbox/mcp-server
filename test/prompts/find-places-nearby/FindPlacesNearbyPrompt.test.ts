// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach } from 'vitest';
import { FindPlacesNearbyPrompt } from '../../../src/prompts/find-places-nearby/FindPlacesNearbyPrompt.js';

describe('FindPlacesNearbyPrompt', () => {
  let prompt: FindPlacesNearbyPrompt;

  beforeEach(() => {
    prompt = new FindPlacesNearbyPrompt();
  });

  describe('properties', () => {
    it('should have correct name', () => {
      expect(prompt.name).toBe('find-places-nearby');
    });

    it('should have correct title', () => {
      expect(prompt.title).toBe('Find Places Nearby');
    });

    it('should have correct description', () => {
      expect(prompt.description).toContain('Find specific types of places');
    });

    it('should have argsSchema defined', () => {
      expect(prompt.argsSchema).toBeDefined();
      expect(prompt.argsSchema?.location).toBeDefined();
      expect(prompt.argsSchema?.category).toBeDefined();
    });
  });

  describe('run', () => {
    it('should return prompt with location and category', async () => {
      const result = await prompt.run({
        location: 'Times Square, New York',
        category: 'restaurant'
      });

      expect(result).toBeDefined();
      expect(result.messages).toBeDefined();
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content.type).toBe('text');

      const text = result.messages[0].content.text;
      expect(text).toContain('Times Square, New York');
      expect(text).toContain('restaurant');
      expect(text).toContain('search_and_geocode');
      expect(text).toContain('category_search');
    });

    it('should return prompt with location only', async () => {
      const result = await prompt.run({
        location: 'Central Park, New York'
      });

      expect(result).toBeDefined();
      expect(result.messages).toBeDefined();
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');

      const text = result.messages[0].content.text;
      expect(text).toContain('Central Park, New York');
      expect(text).toContain('search_and_geocode');
    });

    it('should include instructions for map visualization', async () => {
      const result = await prompt.run({
        location: 'Empire State Building',
        category: 'hotel'
      });

      const text = result.messages[0].content.text;
      expect(text).toContain('static_map_image');
    });

    it('should suggest asking for category when not provided', async () => {
      const result = await prompt.run({
        location: 'Downtown Seattle'
      });

      const text = result.messages[0].content.text;
      expect(text).toContain('ask what type of places');
    });
  });
});
