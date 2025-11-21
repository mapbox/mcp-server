// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach } from 'vitest';
import { ShowReachableAreasPrompt } from '../../../src/prompts/show-reachable-areas/ShowReachableAreasPrompt.js';

describe('ShowReachableAreasPrompt', () => {
  let prompt: ShowReachableAreasPrompt;

  beforeEach(() => {
    prompt = new ShowReachableAreasPrompt();
  });

  describe('properties', () => {
    it('should have correct name', () => {
      expect(prompt.name).toBe('show-reachable-areas');
    });

    it('should have correct title', () => {
      expect(prompt.title).toBe('Show Reachable Areas');
    });

    it('should have correct description', () => {
      expect(prompt.description).toContain('areas that can be reached');
    });

    it('should have argsSchema defined', () => {
      expect(prompt.argsSchema).toBeDefined();
      expect(prompt.argsSchema?.location).toBeDefined();
      expect(prompt.argsSchema?.time_minutes).toBeDefined();
      expect(prompt.argsSchema?.mode).toBeDefined();
    });
  });

  describe('run', () => {
    it('should return prompt with location, time, and mode', async () => {
      const result = await prompt.run({
        location: 'Downtown Seattle',
        time_minutes: '30',
        mode: 'driving'
      });

      expect(result).toBeDefined();
      expect(result.messages).toBeDefined();
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content.type).toBe('text');

      const text = result.messages[0].content.text;
      expect(text).toContain('Downtown Seattle');
      expect(text).toContain('30 minutes');
      expect(text).toContain('driving');
      expect(text).toContain('search_and_geocode');
      expect(text).toContain('isochrone');
    });

    it('should default to 15 minutes when not specified', async () => {
      const result = await prompt.run({
        location: 'San Francisco'
      });

      const text = result.messages[0].content.text;
      expect(text).toContain('15 minutes');
    });

    it('should default to driving mode when not specified', async () => {
      const result = await prompt.run({
        location: 'Portland',
        time_minutes: '20'
      });

      const text = result.messages[0].content.text;
      expect(text).toContain('driving');
    });

    it('should handle walking mode', async () => {
      const result = await prompt.run({
        location: 'Central Park',
        time_minutes: '15',
        mode: 'walking'
      });

      const text = result.messages[0].content.text;
      expect(text).toContain('walking');
    });

    it('should handle cycling mode', async () => {
      const result = await prompt.run({
        location: 'Golden Gate Bridge',
        time_minutes: '45',
        mode: 'cycling'
      });

      const text = result.messages[0].content.text;
      expect(text).toContain('cycling');
    });

    it('should include instructions for map visualization', async () => {
      const result = await prompt.run({
        location: 'Downtown LA',
        time_minutes: '30'
      });

      const text = result.messages[0].content.text;
      expect(text).toContain('static_map_image');
    });

    it('should explain isochrone concept', async () => {
      const result = await prompt.run({
        location: 'Boston',
        time_minutes: '20'
      });

      const text = result.messages[0].content.text;
      expect(text).toContain('isochrone');
      expect(text).toContain('accessibility');
    });
  });
});
