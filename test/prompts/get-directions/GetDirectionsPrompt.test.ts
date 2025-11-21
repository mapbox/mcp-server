// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach } from 'vitest';
import { GetDirectionsPrompt } from '../../../src/prompts/get-directions/GetDirectionsPrompt.js';

describe('GetDirectionsPrompt', () => {
  let prompt: GetDirectionsPrompt;

  beforeEach(() => {
    prompt = new GetDirectionsPrompt();
  });

  describe('properties', () => {
    it('should have correct name', () => {
      expect(prompt.name).toBe('get-directions');
    });

    it('should have correct title', () => {
      expect(prompt.title).toBe('Get Directions');
    });

    it('should have correct description', () => {
      expect(prompt.description).toContain('turn-by-turn directions');
    });

    it('should have argsSchema defined', () => {
      expect(prompt.argsSchema).toBeDefined();
      expect(prompt.argsSchema?.from).toBeDefined();
      expect(prompt.argsSchema?.to).toBeDefined();
      expect(prompt.argsSchema?.mode).toBeDefined();
    });
  });

  describe('run', () => {
    it('should return prompt with from, to, and driving mode', async () => {
      const result = await prompt.run({
        from: 'Boston',
        to: 'New York',
        mode: 'driving'
      });

      expect(result).toBeDefined();
      expect(result.messages).toBeDefined();
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content.type).toBe('text');

      const text = result.messages[0].content.text;
      expect(text).toContain('Boston');
      expect(text).toContain('New York');
      expect(text).toContain('driving');
      expect(text).toContain('driving-traffic');
      expect(text).toContain('search_and_geocode');
      expect(text).toContain('directions');
    });

    it('should default to driving mode when not specified', async () => {
      const result = await prompt.run({
        from: 'LAX',
        to: 'Hollywood'
      });

      const text = result.messages[0].content.text;
      expect(text).toContain('driving');
      expect(text).toContain('driving-traffic');
    });

    it('should handle walking mode', async () => {
      const result = await prompt.run({
        from: 'Central Park',
        to: 'Times Square',
        mode: 'walking'
      });

      const text = result.messages[0].content.text;
      expect(text).toContain('walking');
    });

    it('should handle cycling mode', async () => {
      const result = await prompt.run({
        from: 'Golden Gate Bridge',
        to: "Fisherman's Wharf",
        mode: 'cycling'
      });

      const text = result.messages[0].content.text;
      expect(text).toContain('cycling');
    });

    it('should include instructions for map visualization', async () => {
      const result = await prompt.run({
        from: 'Seattle',
        to: 'Portland'
      });

      const text = result.messages[0].content.text;
      expect(text).toContain('static_map_image');
    });

    it('should mention traffic for driving mode', async () => {
      const result = await prompt.run({
        from: 'Downtown',
        to: 'Airport',
        mode: 'driving'
      });

      const text = result.messages[0].content.text;
      expect(text).toContain('traffic');
    });
  });
});
