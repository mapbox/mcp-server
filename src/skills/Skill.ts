// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * A skill served over the MCP Skills extension (SEP-2640), following the
 * Agent Skills format. The skills themselves live in
 * mapbox/mapbox-agent-skills; see agent-skills.json.
 */
export interface Skill {
  /** Lowercase, hyphenated. Also the skill's directory: skill://<name>/. */
  readonly name: string;
  /**
   * Tools the instructions rely on. The skill is only served when all of
   * them are enabled, so it never points the model at a missing tool.
   */
  readonly tools: readonly string[];
  /** The skill's files by path relative to its directory, SKILL.md included. */
  readonly files: Readonly<Record<string, string>>;
}
