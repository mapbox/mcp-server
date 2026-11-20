// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

export type { Skill } from './Skill.js';
export {
  SKILLS_EXTENSION_ID,
  installSkillsTo,
  loadSkills
} from './skillsExtension.js';
export { ALL_SKILLS, getSkillsForTools } from './skillRegistry.js';
export { AGENT_SKILLS_SOURCE } from './agentSkills.generated.js';
