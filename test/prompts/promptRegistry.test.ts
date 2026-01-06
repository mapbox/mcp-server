// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, test, expect } from 'vitest';
import {
  getAllPrompts,
  getPromptByName
} from '../../src/prompts/promptRegistry.js';

describe('Prompt Registry', () => {
  describe('getAllPrompts', () => {
    test('returns all registered prompts', () => {
      const prompts = getAllPrompts();

      // Should have at least the 5 prompts
      expect(prompts.length).toBeGreaterThanOrEqual(5);

      // Verify expected prompts are present
      const promptNames = prompts.map((p) => p.name);
      expect(promptNames).toContain('clean-gps-trace');
      expect(promptNames).toContain('find-places-nearby');
      expect(promptNames).toContain('get-directions');
      expect(promptNames).toContain('optimize-deliveries');
      expect(promptNames).toContain('show-reachable-areas');
    });

    test('all prompts have unique names', () => {
      const prompts = getAllPrompts();
      const names = prompts.map((p) => p.name);
      const uniqueNames = new Set(names);

      expect(uniqueNames.size).toBe(names.length);
    });

    test('all prompts have valid metadata', () => {
      const prompts = getAllPrompts();

      prompts.forEach((prompt) => {
        const metadata = prompt.getMetadata();

        // Required fields
        expect(metadata.name).toBeTruthy();
        expect(typeof metadata.name).toBe('string');
        expect(metadata.description).toBeTruthy();
        expect(typeof metadata.description).toBe('string');

        // Arguments should be an array
        expect(Array.isArray(metadata.arguments)).toBe(true);

        // Each argument should have required fields
        metadata.arguments?.forEach((arg) => {
          expect(arg.name).toBeTruthy();
          expect(typeof arg.name).toBe('string');
          expect(arg.description).toBeTruthy();
          expect(typeof arg.description).toBe('string');
          expect(typeof arg.required).toBe('boolean');
        });
      });
    });

    test('all prompts follow kebab-case naming convention', () => {
      const prompts = getAllPrompts();

      prompts.forEach((prompt) => {
        const name = prompt.name;
        // Should be lowercase with hyphens only
        expect(name).toMatch(/^[a-z]+(-[a-z]+)*$/);
      });
    });
  });

  describe('getPromptByName', () => {
    test('returns prompt for valid name', () => {
      const prompt = getPromptByName('find-places-nearby');

      expect(prompt).toBeDefined();
      expect(prompt?.name).toBe('find-places-nearby');
    });

    test('returns undefined for invalid name', () => {
      const prompt = getPromptByName('nonexistent-prompt');

      expect(prompt).toBeUndefined();
    });

    test('returns correct prompt instances', () => {
      const promptNames = [
        'clean-gps-trace',
        'find-places-nearby',
        'get-directions',
        'optimize-deliveries',
        'show-reachable-areas'
      ];

      promptNames.forEach((name) => {
        const prompt = getPromptByName(name);
        expect(prompt).toBeDefined();
        expect(prompt?.name).toBe(name);
      });
    });
  });

  describe('Prompt metadata structure', () => {
    test('find-places-nearby has correct metadata', () => {
      const prompt = getPromptByName('find-places-nearby');
      expect(prompt).toBeDefined();

      const metadata = prompt!.getMetadata();

      expect(metadata.name).toBe('find-places-nearby');
      expect(metadata.description).toContain('places near a location');

      // Should have location, category, radius arguments
      const argNames = metadata.arguments?.map((a) => a.name) || [];
      expect(argNames).toContain('location');
      expect(argNames).toContain('category');
      expect(argNames).toContain('radius');

      // location should be required
      const locationArg = metadata.arguments?.find(
        (a) => a.name === 'location'
      );
      expect(locationArg?.required).toBe(true);

      // category and radius should be optional
      const categoryArg = metadata.arguments?.find(
        (a) => a.name === 'category'
      );
      expect(categoryArg?.required).toBe(false);

      const radiusArg = metadata.arguments?.find((a) => a.name === 'radius');
      expect(radiusArg?.required).toBe(false);
    });

    test('get-directions has correct metadata', () => {
      const prompt = getPromptByName('get-directions');
      expect(prompt).toBeDefined();

      const metadata = prompt!.getMetadata();

      expect(metadata.name).toBe('get-directions');
      expect(metadata.description).toContain('directions');

      // Should have from, to, mode arguments
      const argNames = metadata.arguments?.map((a) => a.name) || [];
      expect(argNames).toContain('from');
      expect(argNames).toContain('to');
      expect(argNames).toContain('mode');

      // from and to should be required
      const fromArg = metadata.arguments?.find((a) => a.name === 'from');
      expect(fromArg?.required).toBe(true);

      const toArg = metadata.arguments?.find((a) => a.name === 'to');
      expect(toArg?.required).toBe(true);

      // mode should be optional
      const modeArg = metadata.arguments?.find((a) => a.name === 'mode');
      expect(modeArg?.required).toBe(false);
    });

    test('show-reachable-areas has correct metadata', () => {
      const prompt = getPromptByName('show-reachable-areas');
      expect(prompt).toBeDefined();

      const metadata = prompt!.getMetadata();

      expect(metadata.name).toBe('show-reachable-areas');
      expect(metadata.description).toContain('reached');

      // Should have location, time_minutes, mode arguments
      const argNames = metadata.arguments?.map((a) => a.name) || [];
      expect(argNames).toContain('location');
      expect(argNames).toContain('time_minutes');
      expect(argNames).toContain('mode');

      // location should be required
      const locationArg = metadata.arguments?.find(
        (a) => a.name === 'location'
      );
      expect(locationArg?.required).toBe(true);

      // time_minutes and mode should be optional
      const timeArg = metadata.arguments?.find(
        (a) => a.name === 'time_minutes'
      );
      expect(timeArg?.required).toBe(false);

      const modeArg = metadata.arguments?.find((a) => a.name === 'mode');
      expect(modeArg?.required).toBe(false);
    });

    test('clean-gps-trace has correct metadata', () => {
      const prompt = getPromptByName('clean-gps-trace');
      expect(prompt).toBeDefined();

      const metadata = prompt!.getMetadata();

      expect(metadata.name).toBe('clean-gps-trace');
      expect(metadata.description).toContain('GPS');

      // Should have coordinates, mode, timestamps arguments
      const argNames = metadata.arguments?.map((a) => a.name) || [];
      expect(argNames).toContain('coordinates');
      expect(argNames).toContain('mode');
      expect(argNames).toContain('timestamps');

      // coordinates should be required
      const coordinatesArg = metadata.arguments?.find(
        (a) => a.name === 'coordinates'
      );
      expect(coordinatesArg?.required).toBe(true);

      // mode and timestamps should be optional
      const modeArg = metadata.arguments?.find((a) => a.name === 'mode');
      expect(modeArg?.required).toBe(false);

      const timestampsArg = metadata.arguments?.find(
        (a) => a.name === 'timestamps'
      );
      expect(timestampsArg?.required).toBe(false);
    });

    test('optimize-deliveries has correct metadata', () => {
      const prompt = getPromptByName('optimize-deliveries');
      expect(prompt).toBeDefined();

      const metadata = prompt!.getMetadata();

      expect(metadata.name).toBe('optimize-deliveries');
      expect(metadata.description).toContain('optimal');

      // Should have stops, profile, start_location, end_location arguments
      const argNames = metadata.arguments?.map((a) => a.name) || [];
      expect(argNames).toContain('stops');
      expect(argNames).toContain('profile');
      expect(argNames).toContain('start_location');
      expect(argNames).toContain('end_location');

      // stops should be required
      const stopsArg = metadata.arguments?.find((a) => a.name === 'stops');
      expect(stopsArg?.required).toBe(true);

      // profile, start_location, end_location should be optional
      const profileArg = metadata.arguments?.find((a) => a.name === 'profile');
      expect(profileArg?.required).toBe(false);

      const startArg = metadata.arguments?.find(
        (a) => a.name === 'start_location'
      );
      expect(startArg?.required).toBe(false);

      const endArg = metadata.arguments?.find((a) => a.name === 'end_location');
      expect(endArg?.required).toBe(false);
    });
  });
});
