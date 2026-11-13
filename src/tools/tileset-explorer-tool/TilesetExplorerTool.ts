// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { CallToolResult } from '@modelcontextprotocol/server';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { ToolMeta } from '../BaseTool.js';
import type { HttpRequest } from '../../utils/types.js';
import { TILESET_EXPLORER_URI } from '../../resources/ui-apps/TilesetExplorerUIResource.js';
import { mapAppCsp } from '../../resources/ui-apps/mapAppCsp.js';
import {
  DEFAULT_TILESET_ID,
  TilesetExplorerInputSchema
} from './TilesetExplorerTool.input.schema.js';
import {
  TilesetExplorerOutputSchema,
  type TilesetExplorerOutput,
  type TilesetLayer
} from './TilesetExplorerTool.output.schema.js';

const MAX_LAYERS = 100;
const MAX_FIELDS = 60;
/** Fields named per layer in the text result; the rest are counted. */
const TEXT_FIELDS = 12;

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function numbers<N extends number>(
  value: unknown,
  length: N
): number[] | undefined {
  return Array.isArray(value) &&
    value.length === length &&
    value.every((n) => num(n) !== undefined)
    ? (value as number[])
    : undefined;
}

/**
 * `tileset_explorer_tool` — preview a Mapbox tileset's tiles on an
 * interactive map: every source layer in its own color, with its fields, and
 * a click to inspect a feature.
 *
 * Reads the tileset's TileJSON with the caller's token and returns only its
 * metadata. The TileJSON `tiles` URLs carry that token, so they are never
 * passed on; the page loads tiles through `mapbox://` with a public token.
 * Called with `{}`, as a ChatGPT entrypoint does, it opens Mapbox Streets.
 */
export class TilesetExplorerTool extends MapboxApiBasedTool<
  typeof TilesetExplorerInputSchema,
  typeof TilesetExplorerOutputSchema
> {
  readonly name = 'tileset_explorer_tool';
  readonly description =
    "Open the Mapbox tileset explorer: preview a tileset's tiles on an interactive map, with each source layer in its own color, and list its layers, fields and zoom range. Use it to look inside a vector (MVT) or raster tileset, for example mapbox.mapbox-streets-v8 or one of the user's own. If a tileset explorer is already open and offers its own load_tileset tool, call that instead: this tool opens another explorer.";
  readonly annotations = {
    title: 'Mapbox Tileset Explorer',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  };
  readonly meta: ToolMeta;

  constructor(params: { httpRequest: HttpRequest }) {
    super({
      inputSchema: TilesetExplorerInputSchema,
      outputSchema: TilesetExplorerOutputSchema,
      httpRequest: params.httpRequest
    });
    this.meta = {
      ui: {
        resourceUri: TILESET_EXPLORER_URI,
        csp: mapAppCsp(MapboxApiBasedTool.mapboxApiEndpoint)
      },
      'openai/ui': {
        entrypoints: [{ type: 'thread' }],
        preferredModelDisplayMode: 'fullscreen'
      }
    };
  }

  protected async execute(
    input: { tileset_id?: string },
    accessToken: string
  ): Promise<CallToolResult> {
    const tilesetId = input.tileset_id || DEFAULT_TILESET_ID;
    const url = new URL(
      `${MapboxApiBasedTool.mapboxApiEndpoint}v4/${tilesetId}.json`
    );
    url.searchParams.set('secure', '');
    url.searchParams.set('access_token', accessToken);

    const response = await this.httpRequest(url.toString());
    if (!response.ok) {
      const message = await this.getErrorMessage(response);
      const hint =
        response.status === 404
          ? ' Check the tileset ID (username.id); a private tileset needs a token from its own account.'
          : '';
      return {
        content: [
          {
            type: 'text',
            text: `Couldn't load tileset ${tilesetId}: ${message}.${hint}`
          }
        ],
        isError: true
      };
    }

    const output = toOutput(
      tilesetId,
      (await response.json()) as Record<string, unknown>
    );
    return {
      content: [{ type: 'text', text: describe(output) }],
      structuredContent: output,
      isError: false
    };
  }
}

function toLayer(raw: unknown): TilesetLayer | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const layer = raw as Record<string, unknown>;
  if (typeof layer.id !== 'string' || !layer.id) return undefined;
  const fields: Record<string, string> = {};
  if (layer.fields && typeof layer.fields === 'object') {
    for (const [name, value] of Object.entries(layer.fields).slice(
      0,
      MAX_FIELDS
    )) {
      fields[name] = typeof value === 'string' ? value : '';
    }
  }
  return {
    id: layer.id,
    description:
      typeof layer.description === 'string' && layer.description
        ? layer.description
        : undefined,
    minzoom: num(layer.minzoom),
    maxzoom: num(layer.maxzoom),
    fields
  };
}

function toOutput(
  tilesetId: string,
  tileJson: Record<string, unknown>
): TilesetExplorerOutput {
  const vectorLayers = Array.isArray(tileJson.vector_layers)
    ? tileJson.vector_layers
    : undefined;
  return {
    tilesetExplorer: true,
    tileset_id: tilesetId,
    name:
      typeof tileJson.name === 'string' && tileJson.name
        ? tileJson.name
        : undefined,
    type: vectorLayers ? 'vector' : 'raster',
    bounds: numbers(tileJson.bounds, 4) as TilesetExplorerOutput['bounds'],
    center: numbers(tileJson.center, 3) as TilesetExplorerOutput['center'],
    minzoom: num(tileJson.minzoom),
    maxzoom: num(tileJson.maxzoom),
    layers: (vectorLayers ?? [])
      .map(toLayer)
      .filter((layer): layer is TilesetLayer => layer !== undefined)
      .slice(0, MAX_LAYERS)
  };
}

function describe(output: TilesetExplorerOutput): string {
  const zooms =
    output.minzoom !== undefined && output.maxzoom !== undefined
      ? `, zoom ${output.minzoom} to ${output.maxzoom}`
      : '';
  const head = `Tileset ${output.tileset_id}${output.name ? ` (${output.name})` : ''}: ${output.type}${zooms}. It is open in the tileset explorer.`;
  if (output.type === 'raster') return head;
  const layers = output.layers.map((layer) => {
    const names = Object.keys(layer.fields);
    const shown = names.slice(0, TEXT_FIELDS).join(', ');
    const more =
      names.length > TEXT_FIELDS ? `, +${names.length - TEXT_FIELDS} more` : '';
    return `- ${layer.id}${names.length ? `: ${shown}${more}` : ''}`;
  });
  return `${head}\n${output.layers.length} source layer${output.layers.length === 1 ? '' : 's'} and their fields:\n${layers.join('\n')}`;
}
