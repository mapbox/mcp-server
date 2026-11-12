// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { CallToolResult } from '@modelcontextprotocol/server';
import { BaseTool, type ToolMeta } from '../BaseTool.js';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import { MVT_PREVIEW_URI } from '../../resources/ui-apps/MvtPreviewUIResource.js';
import { mapAppCsp } from '../../resources/ui-apps/mapAppCsp.js';
import { MvtPreviewInputSchema } from './MvtPreviewTool.input.schema.js';
import {
  MvtPreviewOutputSchema,
  type MvtPreviewOutput
} from './MvtPreviewTool.output.schema.js';

export const MVT_EXTENSIONS = ['.mvt', '.pbf'];

/**
 * Reads a tile address from names such as `14-8800-5373.mvt` or
 * `streets_14_8800_5373.pbf`: the last three numbers, as z, x, y.
 */
export function tileFromFileName(
  name: string
): MvtPreviewOutput['tile'] | undefined {
  const match = /(\d{1,2})[-_.](\d+)[-_.](\d+)\D*$/.exec(name);
  if (!match) return undefined;
  const [z, x, y] = match.slice(1).map(Number);
  const size = 2 ** z;
  if (z > 30 || x >= size || y >= size) return undefined;
  return { z, x, y };
}

/**
 * `mvt_preview_tool` — the viewer ChatGPT opens for a `.mvt` or `.pbf` file
 * (OpenAI MCP Extensions file entrypoint).
 *
 * App-only: the host calls it with the file's name and an opaque resource URI.
 * The tool never sees the file; the page reads it through the host with
 * `resources/read` and decodes it.
 */
export class MvtPreviewTool extends BaseTool<
  typeof MvtPreviewInputSchema,
  typeof MvtPreviewOutputSchema
> {
  readonly name = 'mvt_preview_tool';
  readonly description =
    'Open a Mapbox Vector Tile file (.mvt or .pbf) in the Mapbox tile viewer: its layers, fields and features on a map.';
  readonly annotations = {
    title: 'Mapbox Vector Tile Viewer',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false
  };
  readonly meta: ToolMeta;

  constructor() {
    super({
      inputSchema: MvtPreviewInputSchema,
      outputSchema: MvtPreviewOutputSchema
    });
    this.meta = {
      ui: {
        resourceUri: MVT_PREVIEW_URI,
        visibility: ['app'],
        csp: mapAppCsp(MapboxApiBasedTool.mapboxApiEndpoint)
      },
      'openai/ui': {
        entrypoints: [{ type: 'file', extensions: MVT_EXTENSIONS }]
      }
    };
  }

  async run(rawInput: unknown): Promise<CallToolResult> {
    const parsed = MvtPreviewInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        content: [
          {
            type: 'text',
            text: 'mvt_preview_tool needs the file the host opened: { file: { name, resourceUri } }.'
          }
        ],
        isError: true
      };
    }
    const { file } = parsed.data;
    const tile = tileFromFileName(file.name);
    const output: MvtPreviewOutput = { mvtPreview: true, file, tile };
    const where = tile
      ? ` as tile ${tile.z}/${tile.x}/${tile.y}`
      : ', with no tile address in its name';
    return {
      content: [
        {
          type: 'text',
          text: `Opened ${file.name} in the Mapbox vector tile viewer${where}.`
        }
      ],
      structuredContent: output,
      isError: false
    };
  }
}
