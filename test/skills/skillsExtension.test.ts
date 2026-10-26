// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { McpServer, InMemoryTransport } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';
import { SkillsClient } from '@modelcontextprotocol/client/ext/skills';
import {
  SKILLS_EXTENSION_ID,
  installSkillsTo,
  loadSkills,
  skillMarkdown
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

async function connect(skills: readonly Skill[]) {
  const server = new McpServer(
    { name: 'test', version: '0.0.0' },
    { capabilities: { resources: {} } }
  );
  await installSkillsTo(server, skills);
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

  // SkillsClient is the SDK's own client side: it checks every file's size
  // and digest against the listing and SKILL.md's frontmatter against the
  // entry, the same checks hosts make before trusting a skill.
  it('serves skills that the SDK client lists, gets and verifies', async () => {
    const client = await connect([testSkill]);
    expect(
      client.getServerCapabilities()?.extensions?.[SKILLS_EXTENSION_ID]
    ).toBeDefined();

    const skills = new SkillsClient(client);
    expect(skills.supported).toBe(true);

    const list = await skills.list();
    expect(list.invalid).toEqual([]);
    expect(list.skills).toHaveLength(1);
    const [entry] = list.skills;
    expect(entry.uri).toBe('skill://test-skill/SKILL.md');

    expect((await skills.get(entry.uri)).skill).toEqual(entry);

    const skillMd = await skills.read(entry);
    expect(skillMd.verified).toBe(true);
    expect(skillMd.frontmatter).toEqual({
      name: 'test-skill',
      description: testSkill.description
    });
    expect(skillMd.text).toBe(skillMarkdown(testSkill));

    const notes = await skills.read(entry, 'references/notes.md');
    expect(notes.verified).toBe(true);
    expect(notes.text).toBe('Notes with a café\n');

    await client.close();
  });

  it('answers an unknown skill with an error', async () => {
    const client = await connect([testSkill]);
    await expect(
      new SkillsClient(client).get('skill://nope/SKILL.md')
    ).rejects.toThrow();
    await client.close();
  });

  it('builds one catalog that serves several servers', async () => {
    const catalog = await loadSkills(ALL_SKILLS);
    expect(catalog.entries.map((e) => e.uri)).toEqual(
      ALL_SKILLS.map((s) => `skill://${s.name}/SKILL.md`).sort()
    );
    for (let i = 0; i < 2; i++) {
      const server = new McpServer({ name: 'test', version: '0.0.0' });
      catalog.attach(server);
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      const client = new Client({ name: 'test-client', version: '0.0.0' });
      await Promise.all([
        server.connect(serverTransport),
        client.connect(clientTransport)
      ]);
      const list = await new SkillsClient(client).list();
      expect(list.skills).toHaveLength(ALL_SKILLS.length);
      await client.close();
    }
  });

  it('rejects a skill that breaks the format instead of serving it', async () => {
    await expect(
      loadSkills([{ ...testSkill, name: 'Not A Valid Name' }])
    ).rejects.toThrow();
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
