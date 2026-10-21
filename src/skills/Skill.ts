// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * A skill served over the MCP Skills extension (SEP-2640): a `SKILL.md`
 * plus optional supporting files, following the Agent Skills format.
 */
export interface Skill {
  /** Lowercase, hyphenated. Also the skill's directory: skill://<name>/. */
  readonly name: string;
  readonly description: string;
  /**
   * Tools the instructions rely on. The skill is only served when all of
   * them are enabled, so it never points the model at a missing tool.
   */
  readonly tools: readonly string[];
  /** Markdown body of SKILL.md, after the frontmatter. */
  readonly instructions: string;
  /** Supporting files by path relative to the skill directory. */
  readonly files?: Readonly<Record<string, string>>;
}
