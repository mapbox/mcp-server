// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { McpServer } from '@modelcontextprotocol/server';
import {
  SkillsExtension,
  memorySkillFiles,
  type SkillCatalog
} from '@modelcontextprotocol/server/ext/skills';
import type { Skill } from './Skill.js';

/**
 * The MCP Skills extension (SEP-2640):
 * https://modelcontextprotocol.io/extensions/skills/overview
 *
 * The SDK serves it (`@modelcontextprotocol/server/ext/skills`): skills/list,
 * skills/get, the skill:// resources and the capability. This file only
 * hands it our `Skill` files.
 */
export { SKILLS_EXTENSION_ID } from '@modelcontextprotocol/server/ext/skills';

/** Skills are static per server version, so clients can cache them a while. */
const SKILL_TTL_MS = 60 * 60 * 1000;

/**
 * Builds the catalog for `skills`, served at skill://<name>/SKILL.md plus
 * each skill's supporting files. Build it once and `attach()` it to every
 * server (before connecting); one catalog serves any number of servers.
 * Throws if a skill breaks the format's rules (name, frontmatter, limits).
 */
export function loadSkills(skills: readonly Skill[]): Promise<SkillCatalog> {
  const files: Record<string, string> = {};
  for (const skill of skills) {
    for (const [path, text] of Object.entries(skill.files)) {
      files[`${skill.name}/${path}`] = text;
    }
  }
  return SkillsExtension.load(memorySkillFiles(files), {
    strict: true,
    cacheHint: { ttlMs: SKILL_TTL_MS, cacheScope: 'public' }
  });
}

/**
 * Serves `skills` on `server`: loads them and attaches the catalog, which
 * also declares the extension capability. Must run before connecting.
 */
export async function installSkillsTo(
  server: McpServer,
  skills: readonly Skill[]
): Promise<void> {
  (await loadSkills(skills)).attach(server);
}
