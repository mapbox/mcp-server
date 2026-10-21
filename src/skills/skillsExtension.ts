// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import type { Skill } from './Skill.js';

/**
 * The MCP Skills extension (SEP-2640):
 * https://modelcontextprotocol.io/extensions/skills/overview
 *
 * The SDK has no support for it yet (typescript-sdk#2818), so the two
 * methods are registered as custom request handlers and skill files are
 * ordinary resources under skill://. Swap these for the SDK's handlers once
 * that ships.
 */
export const SKILLS_EXTENSION_ID = 'io.modelcontextprotocol/skills';

/** Skills are static per server version, so clients can cache them a while. */
const SKILL_TTL_MS = 60 * 60 * 1000;

export interface SkillFileEntry {
  uri: string;
  digest: string;
  size: number;
}

export interface SkillEntry {
  uri: string;
  frontmatter: { name: string; description: string };
  resources: SkillFileEntry[];
}

interface ServedSkill {
  entry: SkillEntry;
  /** Served text by URI; the manifest's digests are computed from it. */
  files: Map<string, string>;
}

/**
 * SKILL.md text: YAML frontmatter, then the instructions. Values are written
 * as JSON strings, which YAML reads as double-quoted scalars, so a colon or
 * quote in a description can't break the frontmatter.
 */
export function skillMarkdown(skill: Skill): string {
  const body = skill.instructions.endsWith('\n')
    ? skill.instructions
    : `${skill.instructions}\n`;
  return (
    '---\n' +
    `name: ${JSON.stringify(skill.name)}\n` +
    `description: ${JSON.stringify(skill.description)}\n` +
    '---\n\n' +
    body
  );
}

function fileEntry(uri: string, text: string): SkillFileEntry {
  const bytes = Buffer.from(text, 'utf8');
  return {
    uri,
    digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    size: bytes.byteLength
  };
}

export function serveSkill(skill: Skill): ServedSkill {
  const root = `skill://${skill.name}`;
  const skillUri = `${root}/SKILL.md`;
  const files = new Map<string, string>([[skillUri, skillMarkdown(skill)]]);
  for (const [path, text] of Object.entries(skill.files ?? {})) {
    files.set(`${root}/${path}`, text);
  }
  return {
    entry: {
      uri: skillUri,
      frontmatter: { name: skill.name, description: skill.description },
      resources: [...files].map(([uri, text]) => fileEntry(uri, text))
    },
    files
  };
}

const SkillsListRequestSchema = z.object({
  method: z.literal('skills/list'),
  params: z.object({ cursor: z.string().optional() }).passthrough().optional()
});

const SkillsGetRequestSchema = z.object({
  method: z.literal('skills/get'),
  params: z.object({ uri: z.string() }).passthrough()
});

const cacheFields = {
  resultType: 'complete',
  ttlMs: SKILL_TTL_MS,
  cacheScope: 'public'
} as const;

/**
 * Serves `skills` on `server`: each file as a skill:// resource, plus the
 * skills/list and skills/get methods. The server must also declare
 * SKILLS_EXTENSION_ID under `capabilities.extensions`, which has to happen
 * when it's constructed.
 */
export function installSkillsTo(
  server: McpServer,
  skills: readonly Skill[]
): void {
  const served = skills.map(serveSkill);

  for (const { entry, files } of served) {
    for (const [uri, text] of files) {
      const path = uri.slice(`skill://${entry.frontmatter.name}/`.length);
      server.registerResource(
        `${entry.frontmatter.name}/${path}`,
        uri,
        {
          title: `${entry.frontmatter.name}: ${path}`,
          description:
            path === 'SKILL.md' ? entry.frontmatter.description : undefined,
          mimeType: 'text/markdown'
        },
        async () => ({
          contents: [{ uri, mimeType: 'text/markdown', text }]
        })
      );
    }
  }

  // Few enough skills that one page holds them all; cursor is ignored.
  server.server.setRequestHandler(SkillsListRequestSchema, async () => ({
    skills: served.map((s) => s.entry),
    ...cacheFields
  }));

  server.server.setRequestHandler(SkillsGetRequestSchema, async (request) => {
    const skill = served.find((s) => s.entry.uri === request.params.uri);
    if (!skill) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Unknown skill: ${request.params.uri}`
      );
    }
    return { skill: skill.entry, ...cacheFields };
  });
}
