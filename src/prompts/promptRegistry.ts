// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

// INSERT NEW PROMPT IMPORT HERE
import { FindPlacesNearbyPrompt } from './find-places-nearby/FindPlacesNearbyPrompt.js';
import { GetDirectionsPrompt } from './get-directions/GetDirectionsPrompt.js';
import { ShowReachableAreasPrompt } from './show-reachable-areas/ShowReachableAreasPrompt.js';

// Central registry of all prompts
export const ALL_PROMPTS = [
  // INSERT NEW PROMPT INSTANCE HERE
  new FindPlacesNearbyPrompt(),
  new GetDirectionsPrompt(),
  new ShowReachableAreasPrompt()
] as const;

export type PromptInstance = (typeof ALL_PROMPTS)[number];

export function getAllPrompts(): readonly PromptInstance[] {
  return ALL_PROMPTS;
}

export function getPromptByName(name: string): PromptInstance | undefined {
  return ALL_PROMPTS.find((prompt) => prompt.name === name);
}
