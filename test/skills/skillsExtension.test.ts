// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { McpServer, InMemoryTransport } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';
import { SkillsClient } from '@modelcontextprotocol/client/ext/skills';
import {
  SKILLS_EXTENSION_ID,
  installSkillsTo,
  loadSkills
} from '../../src/skills/skillsExtension.js';
import {
  ALL_SKILLS,
  getSkillsForTools
} from '../../src/skills/skillRegistry.js';
import { AGENT_SKILLS_SOURCE } from '../../src/skills/agentSkills.generated.js';
import type { Skill } from '../../src/skills/Skill.js';
import { getAllTools } from '../../src/tools/toolRegistry.js';

const testSkill: Skill = {
  name: 'test-skill',
  tools: ['render_map_tool'],
  files: {
    'SKILL.md':
      '---\nname: test-skill\ndescription: "Has a colon: and \\"quotes\\" in it"\n---\n\n# Test\n\nRead `references/notes.md`.\n',
    'references/notes.md': 'Notes with a café\n'
  }
};

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
      // The colon and quotes survive the YAML round trip.
      description: 'Has a colon: and "quotes" in it'
    });
    expect(skillMd.text).toBe(testSkill.files['SKILL.md']);

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

  it('was generated from the commit agent-skills.json pins', () => {
    // A stale generated file means `npm run fetch-skills` wasn't run.
    const config = JSON.parse(
      readFileSync(new URL('../../agent-skills.json', import.meta.url), 'utf8')
    );
    expect(AGENT_SKILLS_SOURCE).toBe(`${config.repo}@${config.ref}`);
    expect(ALL_SKILLS.map((s) => s.name)).toEqual(Object.keys(config.skills));
  });

  it('stays within ChatGPT import limit of 5 skills', () => {
    expect(ALL_SKILLS.length).toBeGreaterThan(0);
    expect(ALL_SKILLS.length).toBeLessThanOrEqual(5);
  });

  it('only serves skills whose tools are all enabled', () => {
    expect(getSkillsForTools(toolNames)).toEqual(ALL_SKILLS);
    const withoutIsochrone = getSkillsForTools(
      toolNames.filter((name) => name !== 'isochrone_tool')
    );
    expect(withoutIsochrone.map((s) => s.name)).toEqual(
      ALL_SKILLS.filter((s) => !s.tools.includes('isochrone_tool')).map(
        (s) => s.name
      )
    );
    expect(withoutIsochrone.length).toBeLessThan(ALL_SKILLS.length);
    expect(getSkillsForTools([])).toEqual([]);
  });

  it('loads every skill under the SDK strict rules', async () => {
    const catalog = await loadSkills(ALL_SKILLS);
    expect(catalog.entries).toHaveLength(ALL_SKILLS.length);
  });

  it.each(ALL_SKILLS.map((skill) => [skill.name, skill] as const))(
    '%s names only tools this server has',
    (_name, skill) => {
      // ChatGPT's import limit for SKILL.md.
      expect(
        Buffer.byteLength(skill.files['SKILL.md'], 'utf8')
      ).toBeLessThanOrEqual(256 * 1024);

      for (const tool of skill.tools) expect(toolNames).toContain(tool);
      // Every file the model can read, so a skill never sends it to a tool
      // that doesn't exist here.
      for (const [path, text] of Object.entries(skill.files)) {
        for (const tool of text.match(/\b[a-z_]+_tool\b/g) ?? []) {
          expect(toolNames, `${skill.name}/${path}`).toContain(tool);
        }
      }
    }
  );
});
