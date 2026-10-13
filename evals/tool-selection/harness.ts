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
import OpenAI from 'openai';
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
// Each stubbed data result gets its own ref, as on the real server; sharing
// one ref across results confuses models about which dataset it points to.
const REF_PREFIX = 'mapbox://temp/map-payload-eval-';
const REF_PATTERN = /mapbox:\/\/temp\/map-payload-eval-\d+/g;

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
// Host tools only some cases get (via `host_tools` in cases.json), so adding
// one never changes what the other cases see.
const EXTRA_HOST_TOOLS: Record<string, Anthropic.Tool> = {
  write_file: {
    name: 'write_file',
    description:
      "Write a file in the user's project, e.g. a page of the site you are building. Creates or overwrites the file.",
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path, e.g. index.html' },
        content: { type: 'string', description: 'Full file contents' }
      },
      required: ['path', 'content']
    }
  }
};
const HOST_TOOL_NAMES = new Set([
  ...HOST_TOOLS.map((t) => t.name),
  ...Object.keys(EXTRA_HOST_TOOLS)
]);

function hostToolsFor(c: EvalCase): Anthropic.Tool[] {
  return [
    ...HOST_TOOLS,
    ...c.host_tools.map((name) => {
      const tool = EXTRA_HOST_TOOLS[name];
      if (!tool) throw new Error(`case ${c.id}: unknown host tool ${name}`);
      return tool;
    })
  ];
}

export type Mode = 'eager' | 'deferred';
type Provider = 'anthropic' | 'openai';

// Which model family to test. Each provider should write to its own --flow
// directory so baseline/vN comparisons stay within one provider.
const PROVIDER = (process.env.EVAL_PROVIDER ?? 'anthropic') as Provider;
if (PROVIDER !== 'anthropic' && PROVIDER !== 'openai') {
  throw new Error(`EVAL_PROVIDER must be anthropic or openai, got ${PROVIDER}`);
}

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
  /** Extra host tools for this case, from EXTRA_HOST_TOOLS. */
  host_tools: string[];
  /**
   * Mapbox tools the case needs that a given server may not have yet. The
   * case still runs on such a server, to record what the model does instead,
   * but it can't pass.
   */
  needs_tools: string[];
  meta?: Record<string, unknown>;
}

interface BaseCase {
  id: string;
  prompt: string;
  category: string;
  why: string;
  expect: Expectation;
  stubs?: Record<string, string>;
  host_tools?: string[];
  needs_tools?: string[];
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
  // The runner defaults --model to a Claude id; fail before spending anything.
  if (PROVIDER === 'openai' && !process.argv.includes('--model')) {
    throw new Error('EVAL_PROVIDER=openai needs --model <OpenAI model id>');
  }
  const base = JSON.parse(
    readFileSync(resolve(here, 'cases.json'), 'utf8')
  ) as BaseCase[];
  // EVAL_MODES=eager skips tool search, for models that don't support it
  // (e.g. OpenAI's chat-latest).
  const modes = (process.env.EVAL_MODES ?? 'eager,deferred')
    .split(',')
    .map((m) => m.trim()) as Mode[];
  for (const m of modes) {
    if (m !== 'eager' && m !== 'deferred') {
      throw new Error(`EVAL_MODES entries must be eager or deferred, got ${m}`);
    }
  }
  return base.flatMap((c) =>
    modes.map((mode) => ({
      id: `${c.id}__${mode}`,
      prompt: c.prompt,
      tags: [mode, c.category],
      expect: c.expect,
      stubs: c.stubs ?? {},
      host_tools: c.host_tools ?? [],
      needs_tools: c.needs_tools ?? [],
      meta: { base_id: c.id, mode, why: c.why }
    }))
  );
}

function systemPrompt(
  instructions: string | undefined,
  mode: Mode,
  hostTools: Anthropic.Tool[]
): string {
  const assistant =
    PROVIDER === 'anthropic'
      ? 'You are Claude, a helpful'
      : 'You are a helpful';
  const lines = [
    `${assistant} assistant in a chat app. The user has connected the Mapbox MCP server; its tools are available to you alongside the app's built-in tools (${hostTools.map((t) => t.name).join(', ')}).`
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
  places_map_display_v0: 'Map with pins displayed to the user.',
  write_file: 'File written.',
  export_map_html_tool:
    '<!doctype html><html><head><meta charset="utf-8"><title>Map</title></head><body><div id="map"></div><script>/* Mapbox GL JS map with the data and a public token inlined (eval stub) */</script></body></html>'
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
  surface: ServerSurface,
  nextRef: () => string
): { text: string; stubbed: boolean } {
  const base = c.stubs[name] ?? COMMON_STUBS[name];
  if (base === undefined) return { text: UNSTUBBED, stubbed: false };
  return {
    text: HINTED_TOOLS.has(name) ? base + surface.renderHint(nextRef()) : base,
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

// Created on first use so a run only needs the key for its own provider.
let anthropic: Anthropic | undefined;
let openai: OpenAI | undefined;

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

export function runCase(c: EvalCase, ctx: RunCtx): Promise<RunOutput> {
  return PROVIDER === 'openai' ? runOpenAI(c, ctx) : runClaude(c, ctx);
}

async function runClaude(c: EvalCase, ctx: RunCtx): Promise<RunOutput> {
  anthropic ??= new Anthropic();
  const client = anthropic;
  const surface = await loadSurface();
  const mode = (c.meta?.mode as Mode) ?? 'eager';
  const model = ctx.model ?? 'claude-opus-5-5';
  const hostTools = hostToolsFor(c);
  const system = systemPrompt(surface.instructions, mode, hostTools);

  const tools: Anthropic.ToolUnion[] =
    mode === 'deferred'
      ? [
          {
            type: 'tool_search_tool_bm25_20251119',
            name: 'tool_search_tool_bm25'
          },
          ...hostTools,
          ...surface.tools.map((t) => ({ ...t, defer_loading: true }))
        ]
      : [...hostTools, ...surface.tools];

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
  let refCount = 0;
  const nextRef = () => `${REF_PREFIX}${String(++refCount).padStart(4, '0')}`;
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
        const { text: result, stubbed } = stubResult(
          block.name,
          c,
          surface,
          nextRef
        );
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

function addOpenAIUsage(
  total: Record<string, number>,
  u: OpenAI.Responses.ResponseUsage | undefined
): void {
  if (!u) return;
  const cached = u.input_tokens_details?.cached_tokens ?? 0;
  const add = (k: string, n: number) => (total[k] = (total[k] ?? 0) + n);
  // Same shape as Claude usage: input_tokens excludes cache reads.
  add('input_tokens', u.input_tokens - cached);
  add('cache_read_input_tokens', cached);
  add(
    'cache_creation_input_tokens',
    u.input_tokens_details?.cache_write_tokens ?? 0
  );
  add('output_tokens', u.output_tokens);
}

/**
 * Same conversation as runClaude, on OpenAI's Responses API. Deferred mode
 * uses OpenAI's server-executed tool search with defer_loading, the closest
 * equivalent of Anthropic's. Turns are chained with previous_response_id, so
 * reasoning items carry over without being resent.
 */
async function runOpenAI(c: EvalCase, ctx: RunCtx): Promise<RunOutput> {
  openai ??= new OpenAI();
  const client = openai;
  const surface = await loadSurface();
  const mode = (c.meta?.mode as Mode) ?? 'eager';
  if (!ctx.model) throw new Error('missing --model');
  const model = ctx.model;
  const hostTools = hostToolsFor(c);
  const system = systemPrompt(surface.instructions, mode, hostTools);

  const asFunction = (
    t: Anthropic.Tool,
    deferred: boolean
  ): OpenAI.Responses.FunctionTool => {
    // Drop the $schema marker; the rest of the 2020-12 schema is passed as-is.
    const parameters: Record<string, unknown> = { ...t.input_schema };
    delete parameters.$schema;
    return {
      type: 'function',
      name: t.name,
      description: t.description,
      parameters,
      strict: false,
      ...(deferred ? { defer_loading: true } : {})
    };
  };
  const tools: OpenAI.Responses.Tool[] = [
    ...(mode === 'deferred'
      ? [{ type: 'tool_search', execution: 'server' } as const]
      : []),
    ...hostTools.map((t) => asFunction(t, false)),
    ...surface.tools.map((t) => asFunction(t, mode === 'deferred'))
  ];

  const transcript: Array<Record<string, unknown>> = [
    { role: 'system', content: system },
    { role: 'user', content: c.prompt }
  ];
  const usage: Record<string, number> = {};
  const toolCalls: string[] = [];
  const toolSearches: string[] = [];
  const unstubbed: string[] = [];
  let refCount = 0;
  const nextRef = () => `${REF_PREFIX}${String(++refCount).padStart(4, '0')}`;
  let servedModel = model;
  let stopReason: string | null = null;
  let status = 'ok';
  let input: OpenAI.Responses.ResponseInput = [
    { role: 'user', content: c.prompt }
  ];
  let previous: string | undefined;

  for (let call = 0; call < MAX_MODEL_CALLS; call++) {
    const res = await client.responses.create({
      model,
      instructions: system,
      input,
      tools,
      previous_response_id: previous,
      max_output_tokens: 16000,
      prompt_cache_key: `mapbox-tool-selection-${mode}`
    });
    servedModel = res.model;
    addOpenAIUsage(usage, res.usage);
    stopReason = res.incomplete_details?.reason ?? res.status ?? null;
    if (res.incomplete_details?.reason === 'max_output_tokens') {
      status = 'truncated';
    } else if (res.incomplete_details?.reason === 'content_filter') {
      status = 'refusal';
    }

    const outputs: OpenAI.Responses.ResponseInputItem.FunctionCallOutput[] = [];
    for (const item of res.output) {
      if (item.type === 'message') {
        for (const part of item.content) {
          if (part.type === 'refusal') status = 'refusal';
          const text = part.type === 'output_text' ? part.text : part.refusal;
          if (text.trim())
            transcript.push({ role: 'assistant', content: text });
        }
      } else if (item.type === 'tool_search_call') {
        const query = JSON.stringify(item.arguments);
        toolSearches.push(query);
        transcript.push({
          role: 'tool_call',
          name: 'tool_search',
          content: query
        });
      } else if (item.type === 'tool_search_output') {
        const found = item.tools
          .map((t) => ('name' in t && t.name ? t.name : t.type))
          .join(', ');
        transcript.push({ role: 'tool_result', content: `found: ${found}` });
      } else if (item.type === 'function_call') {
        toolCalls.push(item.name);
        const { text: result, stubbed } = stubResult(
          item.name,
          c,
          surface,
          nextRef
        );
        if (!stubbed) unstubbed.push(item.name);
        let args: string = item.arguments;
        try {
          args = JSON.stringify(JSON.parse(item.arguments), null, 2);
        } catch {
          // keep the raw string; the ref check reports it as unparseable
        }
        transcript.push({ role: 'tool_call', name: item.name, content: args });
        transcript.push({ role: 'tool_result', content: result });
        outputs.push({
          type: 'function_call_output',
          call_id: item.call_id,
          output: result
        });
      }
    }

    if (status !== 'ok' || outputs.length === 0) break;
    previous = res.id;
    input = outputs;
  }

  return {
    output: toolCalls.join(' > '),
    transcript,
    model: servedModel,
    usage,
    stop_reason: stopReason,
    status,
    tool_calls: toolCalls,
    tool_searches: toolSearches,
    unstubbed
  };
}

/**
 * Did every render_map_tool call pass the map ref unchanged? Data tools return
 * a ref plus a hint telling Claude to pass it as-is; before the hint existed,
 * Claude invented refs. Once a tool result has handed out a ref, a render call
 * must pass at least one ref, and every ref it passes must be one a tool
 * result handed out. Refs are read from the transcript, so old rows can be
 * re-scored. Returns null when render_map_tool wasn't called.
 */
function checkRefs(
  transcript: RunOutput['transcript']
): { ok: boolean; why: string } | null {
  const issued = new Set<string>();
  let renders = 0;
  for (const turn of transcript) {
    if (turn.role === 'tool_result') {
      for (const ref of String(turn.content).match(REF_PATTERN) ?? []) {
        issued.add(ref);
      }
      continue;
    }
    if (turn.role !== 'tool_call' || turn.name !== 'render_map_tool') continue;
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
    const invented = refs.filter((r) => !issued.has(r));
    if (invented.length) {
      return { ok: false, why: `invented ref ${invented[0]}` };
    }
    if (issued.size && refs.length === 0) {
      return {
        ok: false,
        why: 'ref available but not passed (hand-built map)'
      };
    }
  }
  return renders ? { ok: true, why: 'ref passed unchanged' } : null;
}

// The symptom from the field: an agent building a page asks the user for a
// Mapbox token, or writes one in as a placeholder. Heuristic, so the
// explanation quotes what matched.
const TOKEN_ASK =
  /\b(provide|enter|paste|share|send|add|need)\b[^.?!\n]{0,40}\b(your|a|an)\b[^.?!\n]{0,20}\b(mapbox\s+)?(public\s+|access\s+)?token\b/i;
const TOKEN_PLACEHOLDER =
  /YOUR_MAPBOX[A-Z_]*|<\s*your[^>]*token[^>]*>|pk\.\.\.|ACCESS_TOKEN_HERE|REPLACE_WITH[A-Z_]*TOKEN|accessToken\s*=\s*(['"`])\1/i;

function checkTokenAsk(
  transcript: RunOutput['transcript']
): { ok: boolean; why: string } | null {
  let relevant = false;
  for (const turn of transcript) {
    const text = String(turn.content);
    if (turn.role === 'assistant') {
      const m = text.match(TOKEN_ASK);
      if (m) return { ok: false, why: `asked for a token: "${m[0]}"` };
    } else if (turn.role === 'tool_call' && turn.name === 'write_file') {
      relevant = true;
      const m = text.match(TOKEN_PLACEHOLDER);
      if (m) return { ok: false, why: `placeholder token in file: ${m[0]}` };
    }
  }
  return relevant ? { ok: true, why: 'no token request or placeholder' } : null;
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
    if (
      !surface.names.has(n) &&
      !HOST_TOOL_NAMES.has(n) &&
      !c.needs_tools.includes(n)
    ) {
      throw new Error(`case ${c.id} references unknown tool ${n}`);
    }
  }

  const problems: string[] = [];
  const absent = c.needs_tools.filter((n) => !surface.names.has(n));
  if (absent.length) {
    problems.push(`needs ${absent.join(', ')}, which this server doesn't have`);
  }
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
  const token = checkTokenAsk(run.transcript);
  return {
    grade: {
      pass,
      first_ok: firstOk ? 1 : 0,
      no_forbidden: forbidden.length ? 0 : 1,
      ref_ok: refs && !refs.ok ? 0 : 1,
      no_token_ask: token && !token.ok ? 0 : 1
    },
    explanation: {
      pass: pass
        ? `ok: ${trajectory}`
        : `${problems.join('; ')} | ${trajectory}`,
      ref_ok: refs ? refs.why : 'no render_map_tool call',
      no_token_ask: token ? token.why : 'no page written'
    }
  };
}
