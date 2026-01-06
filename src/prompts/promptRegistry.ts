// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { FindPlacesNearbyPrompt } from './FindPlacesNearbyPrompt.js';
import { GetDirectionsPrompt } from './GetDirectionsPrompt.js';
import { ShowReachableAreasPrompt } from './ShowReachableAreasPrompt.js';
import { OptimizeDeliveriesPrompt } from './OptimizeDeliveriesPrompt.js';
import { CleanGpsTracePrompt } from './CleanGpsTracePrompt.js';

/**
 * Central registry of all available prompts.
 *
 * This module maintains a readonly collection of prompt instances and provides
 * type-safe access methods.
 */

// Instantiate all prompts
const ALL_PROMPTS = [
  new FindPlacesNearbyPrompt(),
  new GetDirectionsPrompt(),
  new ShowReachableAreasPrompt(),
  new OptimizeDeliveriesPrompt(),
  new CleanGpsTracePrompt()
] as const;

/**
 * Type representing any prompt instance
 */
export type PromptInstance = (typeof ALL_PROMPTS)[number];

/**
 * Get all registered prompts
 *
 * @returns Readonly array of all prompt instances
 */
export function getAllPrompts(): readonly PromptInstance[] {
  return ALL_PROMPTS;
}

/**
 * Get a prompt by name
 *
 * @param name - The prompt name to look up
 * @returns The prompt instance, or undefined if not found
 */
export function getPromptByName(name: string): PromptInstance | undefined {
  return ALL_PROMPTS.find((prompt) => prompt.name === name);
}
