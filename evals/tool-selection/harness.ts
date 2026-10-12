// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * Tool-selection eval harness: which tools does Claude pick for a prompt,
 * given this server's tool descriptions and server instructions?
 *
 * The tool surface comes from a real McpServer built the same way the hosted
 * deployment builds it (publishJsonSchema2020 + installTo + server
 * instructions) and read back over MCP `tools/list`, so the eval sees exactly
 * what a host sees. EVAL_SERVER_ROOT points at the checkout whose src/ to
 * load, which lets one harness compare two branches (e.g. main vs a PR
 * worktree). Tool calls are answered with canned stubs; no Mapbox API calls
 * are made.
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

const here = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = resolve(
  process.env.EVAL_SERVER_ROOT ?? resolve(here, '../..')
);
const MAX_MODEL_CALLS = 5;
const FAKE_REF = 'mapbox://temp/map-payload-eval-0001';

// Distractors standing in for tools a host provides alongside the connector.
// They let the eval see whether our descriptions crowd out other sources,
// which is the connector-review concern.
const HOST_TOOLS: Anthropic.Tool[] = [
  {
    name: 'web_search',
    description:
      'Search the web for current information. Returns result titles, URLs and snippets.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Search query' } },
      required: ['query']
    }
  },
  {
    name: 'places_map_display_v0',
    description:
      'Display one or more places as pins on a map in the chat. Takes place names or coordinates.',
    input_schema: {
      type: 'object',
      properties: {
        places: {
          type: 'array',
          items: { type: 'string' },
          description: 'Place names or "lat,lng" strings to pin'
        }
      },
      required: ['places']
    }
  }
];
const HOST_TOOL_NAMES = new Set(HOST_TOOLS.map((t) => t.name));

export type Mode = 'eager' | 'deferred';

export interface Expectation {
  /** Acceptable names for the first client tool called. */
  first?: string[];
  /** Every one of these must be called at some point. */
  must?: string[];
  /** At least one of these must be called. */
  any_of?: string[];
  /** None of these may be called. "*mapbox*" means any Mapbox tool. */
  must_not?: string[];
}

export interface EvalCase {
  id: string;
  prompt: string;
  tags: string[];
  expect: Expectation;
  /** Canned results keyed by tool name, written to match this prompt. */
  stubs: Record<string, string>;
  meta?: Record<string, unknown>;
}

interface BaseCase {
  id: string;
  prompt: string;
  category: string;
  why: string;
  expect: Expectation;
  stubs?: Record<string, string>;
}

interface ServerSurface {
  tools: Anthropic.Tool[];
  instructions: string | undefined;
  names: Set<string>;
  renderHint: (ref: string) => string;
}

let surfacePromise: Promise<ServerSurface> | undefined;

async function importFromRoot<T>(rel: string): Promise<T> {
  return (await import(pathToFileURL(resolve(SERVER_ROOT, rel)).href)) as T;
}

async function buildSurface(): Promise<ServerSurface> {
  const registry = await importFromRoot<{
    getCoreTools(): readonly {
      name: string;
      installTo(s: McpServer): unknown;
    }[];
  }>('src/tools/toolRegistry.ts');
  const { publishJsonSchema2020 } = await importFromRoot<{
    publishJsonSchema2020(s: McpServer): void;
  }>('src/utils/jsonSchema2020.ts');
  const { buildServerInstructions } = await importFromRoot<{
    buildServerInstructions(names: readonly string[]): string | undefined;
  }>('src/utils/serverInstructions.ts');
  const { renderHint } = await importFromRoot<{
    renderHint(ref: string): string;
  }>('src/utils/storeMapPayload.ts');

  const coreTools = registry.getCoreTools();
  const server = new McpServer(
    { name: 'mapbox-eval', version: '0.0.0' },
    {
      instructions: buildServerInstructions(coreTools.map((t) => t.name)),
      capabilities: { tools: {} }
    }
  );
  publishJsonSchema2020(server);
  coreTools.forEach((t) => t.installTo(server));

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'tool-selection-eval', version: '0.0.0' });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport)
  ]);
  const { tools } = await client.listTools();
  const instructions = client.getInstructions();
  await client.close();

  const apiTools: Anthropic.Tool[] = tools
    .map((t) => ({
      name: t.name,
      description: t.description ?? '',
      input_schema: t.inputSchema as Anthropic.Tool.InputSchema
    }))
    .sort((a, b) => a.name.localeCompare(b.name)); // stable order keeps the prompt cache warm
  return {
    tools: apiTools,
    instructions,
    names: new Set(apiTools.map((t) => t.name)),
    renderHint
  };
}

export function loadSurface(): Promise<ServerSurface> {
  surfacePromise ??= buildSurface();
  return surfacePromise;
}

/** Each base case runs once per mode, so one row = (case, mode). */
export function loadCases(): EvalCase[] {
  const base = JSON.parse(
    readFileSync(resolve(here, 'cases.json'), 'utf8')
  ) as BaseCase[];
  const modes: Mode[] = ['eager', 'deferred'];
  return base.flatMap((c) =>
    modes.map((mode) => ({
      id: `${c.id}__${mode}`,
      prompt: c.prompt,
      tags: [mode, c.category],
      expect: c.expect,
      stubs: c.stubs ?? {},
      meta: { base_id: c.id, mode, why: c.why }
    }))
  );
}

function systemPrompt(instructions: string | undefined, mode: Mode): string {
  const lines = [
    "You are Claude, a helpful assistant in a chat app. The user has connected the Mapbox MCP server; its tools are available to you alongside the app's built-in tools (web_search, places_map_display_v0)."
  ];
  if (mode === 'deferred') {
    lines.push(
      'Mapbox tools are not loaded up front. Use tool search to find and load them when you need one.'
    );
  }
  if (instructions) {
    lines.push(
      '',
      '<mcp_server_instructions server="mapbox">',
      instructions,
      '</mcp_server_instructions>'
    );
  }
  return lines.join('\n');
}

// Results that don't depend on the query. Everything else is stubbed per case
// in cases.json: a canned answer about the wrong place makes Claude retry or
// switch tools, which would be scored as a routing failure.
const COMMON_STUBS: Record<string, string> = {
  render_map_tool: 'Map rendered for the user.',
  static_map_image_tool: 'Static map image generated (PNG).',
  places_map_display_v0: 'Map with pins displayed to the user.'
};
const UNSTUBBED = 'No results. (This tool returned nothing for this request.)';

/**
 * Canned result for a tool call. Tools that return map payloads on the real
 * server get the server's own render hint appended, so a change to that hint
 * text shows up in the eval. Calls the case has no stub for get an empty
 * result and are flagged so the run can report them.
 */
function stubResult(
  name: string,
  c: EvalCase,
  surface: ServerSurface
): { text: string; stubbed: boolean } {
  const base = c.stubs[name] ?? COMMON_STUBS[name];
  if (base === undefined) return { text: UNSTUBBED, stubbed: false };
  return {
    text: HINTED_TOOLS.has(name) ? base + surface.renderHint(FAKE_REF) : base,
    stubbed: true
  };
}

const HINTED_TOOLS = new Set([
  'search_and_geocode_tool',
  'category_search_tool',
  'directions_tool',
  'isochrone_tool',
  'ground_location_tool',
  'map_matching_tool',
  'optimization_tool',
  'union_tool',
  'intersect_tool',
  'difference_tool'
]);

export interface RunCtx {
  model?: string;
}

export interface RunOutput {
  output: string;
  transcript: Array<Record<string, unknown>>;
  model: string;
  usage: Record<string, number>;
  stop_reason: string | null;
  status?: string;
  tool_calls: string[];
  tool_searches: string[];
  /** Tool calls the case had no stub for; non-empty means cases.json needs one. */
  unstubbed: string[];
}

const client = new Anthropic();

function addUsage(total: Record<string, number>, u: Anthropic.Usage): void {
  for (const k of [
    'input_tokens',
    'output_tokens',
    'cache_read_input_tokens',
    'cache_creation_input_tokens'
  ] as const) {
    total[k] = (total[k] ?? 0) + (u[k] ?? 0);
  }
}

export async function runCase(c: EvalCase, ctx: RunCtx): Promise<RunOutput> {
  const surface = await loadSurface();
  const mode = (c.meta?.mode as Mode) ?? 'eager';
  const model = ctx.model ?? 'claude-opus-5-5';
  const system = systemPrompt(surface.instructions, mode);

  const tools: Anthropic.ToolUnion[] =
    mode === 'deferred'
      ? [
          {
            type: 'tool_search_tool_bm25_20251119',
            name: 'tool_search_tool_bm25'
          },
          ...HOST_TOOLS,
          ...surface.tools.map((t) => ({ ...t, defer_loading: true }))
        ]
      : [...HOST_TOOLS, ...surface.tools];

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: c.prompt }
  ];
  const transcript: Array<Record<string, unknown>> = [
    { role: 'system', content: system },
    { role: 'user', content: c.prompt }
  ];
  const usage: Record<string, number> = {};
  const toolCalls: string[] = [];
  const toolSearches: string[] = [];
  const unstubbed: string[] = [];
  let servedModel = model;
  let stopReason: string | null = null;

  for (let call = 0; call < MAX_MODEL_CALLS; call++) {
    const res = await client.messages.create({
      model,
      max_tokens: 16000,
      // Caches the conversation so far; in deferred mode the tool definitions
      // that search loads live in the messages, past the system breakpoint.
      cache_control: { type: 'ephemeral' },
      system: [
        { type: 'text', text: system, cache_control: { type: 'ephemeral' } }
      ],
      tools,
      messages
    });
    servedModel = res.model;
    stopReason = res.stop_reason;
    addUsage(usage, res.usage);

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type === 'text' && block.text.trim()) {
        transcript.push({ role: 'assistant', content: block.text });
      } else if (block.type === 'server_tool_use') {
        const query = JSON.stringify(block.input);
        toolSearches.push(query);
        transcript.push({
          role: 'tool_call',
          name: block.name,
          content: query
        });
      } else if (block.type === 'tool_search_tool_result') {
        const found =
          block.content.type === 'tool_search_tool_search_result'
            ? block.content.tool_references.map((r) => r.tool_name).join(', ')
            : `error: ${block.content.error_code}`;
        transcript.push({ role: 'tool_result', content: `found: ${found}` });
      } else if (block.type === 'tool_use') {
        toolCalls.push(block.name);
        const { text: result, stubbed } = stubResult(block.name, c, surface);
        if (!stubbed) unstubbed.push(block.name);
        transcript.push({
          role: 'tool_call',
          name: block.name,
          content: JSON.stringify(block.input, null, 2)
        });
        transcript.push({ role: 'tool_result', content: result });
        results.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result
        });
      }
    }

    // Keep the assistant turn unchanged (thinking and tool-search blocks included).
    messages.push({ role: 'assistant', content: res.content });
    if (res.stop_reason === 'pause_turn') continue;
    if (res.stop_reason !== 'tool_use' || results.length === 0) break;
    messages.push({ role: 'user', content: results });
  }

  return {
    output: toolCalls.join(' > '),
    transcript,
    model: servedModel,
    usage,
    stop_reason: stopReason,
    status:
      stopReason === 'max_tokens'
        ? 'truncated'
        : stopReason === 'refusal'
          ? 'refusal'
          : 'ok',
    tool_calls: toolCalls,
    tool_searches: toolSearches,
    unstubbed
  };
}

/**
 * Did every render_map_tool call pass the map ref unchanged? Data tools return
 * a ref plus a hint telling Claude to pass it as-is; before the hint existed,
 * Claude invented refs. Once a data tool has returned a ref, a render call must
 * include it, and no render call may carry any other mapbox:// ref. Returns
 * null when render_map_tool wasn't called.
 */
function checkRefs(
  transcript: RunOutput['transcript']
): { ok: boolean; why: string } | null {
  let refAvailable = false;
  let renders = 0;
  for (const turn of transcript) {
    if (turn.role !== 'tool_call') continue;
    const name = String(turn.name);
    if (HINTED_TOOLS.has(name)) refAvailable = true;
    if (name !== 'render_map_tool') continue;
    renders++;
    let input: { payload_refs?: unknown };
    try {
      input = JSON.parse(String(turn.content)) as { payload_refs?: unknown };
    } catch {
      return { ok: false, why: 'unparseable render_map_tool input' };
    }
    const refs = Array.isArray(input.payload_refs)
      ? input.payload_refs.map(String)
      : [];
    const invented = refs.filter((r) => r !== FAKE_REF);
    if (invented.length) {
      return { ok: false, why: `invented ref ${invented[0]}` };
    }
    if (refAvailable && !refs.includes(FAKE_REF)) {
      return {
        ok: false,
        why: 'ref available but not passed (hand-built map)'
      };
    }
  }
  return renders ? { ok: true, why: 'ref passed unchanged' } : null;
}

export async function gradeCase(
  c: EvalCase,
  run: Pick<RunOutput, 'tool_calls' | 'transcript'>
): Promise<{
  grade: Record<string, number>;
  explanation: Record<string, string>;
}> {
  const surface = await loadSurface();
  const called = new Set(run.tool_calls);
  const expand = (names: string[] = []): string[] =>
    names.flatMap((n) => (n === '*mapbox*' ? [...surface.names] : [n]));
  for (const n of [
    ...expand(c.expect.first),
    ...expand(c.expect.must),
    ...expand(c.expect.any_of),
    ...expand(c.expect.must_not)
  ]) {
    // A renamed or removed tool would otherwise turn a must_not into a silent pass.
    if (!surface.names.has(n) && !HOST_TOOL_NAMES.has(n)) {
      throw new Error(`case ${c.id} references unknown tool ${n}`);
    }
  }

  const problems: string[] = [];
  const first = run.tool_calls[0];
  const firstOk =
    !c.expect.first ||
    (first !== undefined && expand(c.expect.first).includes(first));
  if (!firstOk) {
    problems.push(
      `first tool was ${first ?? 'none'}, expected one of ${c.expect.first?.join('/')}`
    );
  }
  const missing = expand(c.expect.must).filter((n) => !called.has(n));
  if (missing.length) problems.push(`missing: ${missing.join(', ')}`);
  const anyOf = expand(c.expect.any_of);
  if (anyOf.length && !anyOf.some((n) => called.has(n))) {
    problems.push(`none of: ${c.expect.any_of?.join(', ')}`);
  }
  const forbidden = expand(c.expect.must_not).filter((n) => called.has(n));
  if (forbidden.length)
    problems.push(`called forbidden: ${forbidden.join(', ')}`);

  const pass = problems.length === 0 ? 1 : 0;
  const trajectory = run.tool_calls.join(' > ') || '(no tools)';
  // Rows without a render call score 1 on ref_ok so the metric's failures
  // are only real ref mistakes.
  const refs = checkRefs(run.transcript);
  return {
    grade: {
      pass,
      first_ok: firstOk ? 1 : 0,
      no_forbidden: forbidden.length ? 0 : 1,
      ref_ok: refs && !refs.ok ? 0 : 1
    },
    explanation: {
      pass: pass
        ? `ok: ${trajectory}`
        : `${problems.join('; ')} | ${trajectory}`,
      ref_ok: refs ? refs.why : 'no render_map_tool call'
    }
  };
}
