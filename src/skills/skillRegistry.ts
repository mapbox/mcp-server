// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { Skill } from './Skill.js';
import { mapDisplaySkill } from './map-display/mapDisplaySkill.js';
import { reachabilityAnalysisSkill } from './reachability-analysis/reachabilityAnalysisSkill.js';

// ChatGPT imports at most 5 skills from a server, so keep this list short.
export const ALL_SKILLS: readonly Skill[] = [
  mapDisplaySkill,
  reachabilityAnalysisSkill
];

/** Skills whose tools are all enabled. */
export function getSkillsForTools(
  enabledToolNames: readonly string[]
): Skill[] {
  const enabled = new Set(enabledToolNames);
  return ALL_SKILLS.filter((skill) =>
    skill.tools.every((tool) => enabled.has(tool))
  );
}
