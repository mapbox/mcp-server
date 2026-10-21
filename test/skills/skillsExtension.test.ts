// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import {
  SKILLS_EXTENSION_ID,
  installSkillsTo,
  serveSkill,
  skillMarkdown,
  type SkillEntry
} from '../../src/skills/skillsExtension.js';
import {
  ALL_SKILLS,
  getSkillsForTools
} from '../../src/skills/skillRegistry.js';
import type { Skill } from '../../src/skills/Skill.js';
import { getAllTools } from '../../src/tools/toolRegistry.js';

const testSkill: Skill = {
  name: 'test-skill',
  description: 'Has a colon: and "quotes" in it',
  tools: ['render_map_tool'],
  instructions: '# Test\n\nRead `references/notes.md`.',
  files: { 'references/notes.md': 'Notes with a café\n' }
};

/** Frontmatter values are JSON strings, so JSON.parse reads them back. */
function parseFrontmatter(markdown: string): Record<string, string> {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(markdown);
  if (!match) throw new Error('No frontmatter');
  return Object.fromEntries(
    match[1].split('\n').map((line) => {
      const i = line.indexOf(': ');
      return [line.slice(0, i), JSON.parse(line.slice(i + 2))];
    })
  );
}

const listResult = z
  .object({ skills: z.array(z.custom<SkillEntry>()) })
  .passthrough();
const getResult = z.object({ skill: z.custom<SkillEntry>() }).passthrough();

async function connect(skills: readonly Skill[]) {
  const server = new McpServer(
    { name: 'test', version: '0.0.0' },
    {
      capabilities: {
        resources: {},
        extensions: { [SKILLS_EXTENSION_ID]: {} }
      }
    }
  );
  installSkillsTo(server, skills);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport)
  ]);
  return client;
}

describe('skills extension', () => {
  it('writes frontmatter that reads back as the skill name and description', () => {
    const markdown = skillMarkdown(testSkill);
    expect(parseFrontmatter(markdown)).toEqual({
      name: 'test-skill',
      description: 'Has a colon: and "quotes" in it'
    });
    expect(markdown.endsWith('`references/notes.md`.\n')).toBe(true);
  });

  it('lists every file with the digest and byte size of what is served', () => {
    const { entry, files } = serveSkill(testSkill);
    expect(entry.uri).toBe('skill://test-skill/SKILL.md');
    expect(entry.resources.map((r) => r.uri)).toEqual([
      'skill://test-skill/SKILL.md',
      'skill://test-skill/references/notes.md'
    ]);
    for (const resource of entry.resources) {
      const bytes = Buffer.from(files.get(resource.uri) as string, 'utf8');
      expect(resource.size).toBe(bytes.byteLength);
      expect(resource.digest).toBe(
        `sha256:${createHash('sha256').update(bytes).digest('hex')}`
      );
    }
    // The é is two bytes, so size counts bytes, not characters.
    const notes = entry.resources[1];
    expect(notes.size).toBe('Notes with a café\n'.length + 1);
  });

  it('serves skills/list, skills/get and the files over MCP', async () => {
    const client = await connect([testSkill]);

    expect(
      client.getServerCapabilities()?.extensions?.[SKILLS_EXTENSION_ID]
    ).toEqual({});

    const list = await client.request({ method: 'skills/list' }, listResult);
    expect(list).toMatchObject({
      resultType: 'complete',
      cacheScope: 'public'
    });
    expect(list.skills).toHaveLength(1);
    const [entry] = list.skills;
    expect(entry.frontmatter).toEqual({
      name: 'test-skill',
      description: testSkill.description
    });

    const got = await client.request(
      { method: 'skills/get', params: { uri: entry.uri } },
      getResult
    );
    expect(got.skill).toEqual(entry);

    // What resources/read returns matches the manifest, as hosts verify.
    for (const resource of entry.resources) {
      const read = await client.readResource({ uri: resource.uri });
      const text = (read.contents[0] as { text: string }).text;
      const bytes = Buffer.from(text, 'utf8');
      expect(bytes.byteLength).toBe(resource.size);
      expect(`sha256:${createHash('sha256').update(bytes).digest('hex')}`).toBe(
        resource.digest
      );
    }
    const skillMd = await client.readResource({ uri: entry.uri });
    expect(
      parseFrontmatter((skillMd.contents[0] as { text: string }).text)
    ).toEqual(entry.frontmatter);

    await client.close();
  });

  it('answers an unknown skill with invalid params', async () => {
    const client = await connect([testSkill]);
    const error = await client
      .request(
        { method: 'skills/get', params: { uri: 'skill://nope/SKILL.md' } },
        getResult
      )
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(McpError);
    expect((error as McpError).code).toBe(-32602);
    await client.close();
  });
});

describe('skill registry', () => {
  const toolNames = getAllTools().map((tool) => tool.name);

  it('only serves skills whose tools are all enabled', () => {
    expect(getSkillsForTools(toolNames)).toEqual(ALL_SKILLS);
    const withoutIsochrone = getSkillsForTools(
      toolNames.filter((name) => name !== 'isochrone_tool')
    );
    expect(withoutIsochrone.map((s) => s.name)).toEqual(['mapbox-map-display']);
    expect(getSkillsForTools([])).toEqual([]);
  });

  it.each(ALL_SKILLS.map((skill) => [skill.name, skill] as const))(
    '%s is a valid Agent Skill that names only real tools',
    (_name, skill) => {
      // Agent Skills spec limits.
      expect(skill.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(skill.name.length).toBeLessThanOrEqual(64);
      expect(skill.description.length).toBeLessThanOrEqual(1024);
      // ChatGPT's import limit for SKILL.md.
      expect(
        Buffer.byteLength(skillMarkdown(skill), 'utf8')
      ).toBeLessThanOrEqual(256 * 1024);

      for (const tool of skill.tools) expect(toolNames).toContain(tool);
      const mentioned = skill.instructions.match(/\b[a-z_]+_tool\b/g) ?? [];
      for (const tool of mentioned) expect(toolNames).toContain(tool);
    }
  );
});
