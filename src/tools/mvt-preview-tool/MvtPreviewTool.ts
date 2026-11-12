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
 * The host calls it with the file's name and an opaque resource URI; the page
 * reads the file through the host with `resources/read` and decodes it. The
 * model calls it with a local path instead, and the page asks the host to open
 * that file (`openai/files/open`), which lands in the same viewer. The tool
 * never reads the file.
 */
export class MvtPreviewTool extends BaseTool<
  typeof MvtPreviewInputSchema,
  typeof MvtPreviewOutputSchema
> {
  readonly name = 'mvt_preview_tool';
  readonly description =
    "Open a local Mapbox Vector Tile file (.mvt or .pbf) in the Mapbox vector tile viewer next to the chat: each layer drawn in its own color on a map, with feature counts, fields and properties. Pass the file's absolute path. Use it whenever the user wants to preview, view or inspect a vector tile file, instead of decoding the tile yourself. ChatGPT desktop only.";
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
        csp: mapAppCsp(MapboxApiBasedTool.mapboxApiEndpoint)
      },
      'openai/ui': {
        entrypoints: [{ type: 'file', extensions: MVT_EXTENSIONS }]
      }
    };
  }

  async run(rawInput: unknown): Promise<CallToolResult> {
    const parsed = MvtPreviewInputSchema.safeParse(rawInput);
    const input = parsed.success ? parsed.data : undefined;
    if (!input || (!input.file && !input.path)) {
      const reason = parsed.success
        ? ''
        : ` ${parsed.error.issues[0]?.message}.`;
      return {
        content: [
          {
            type: 'text',
            text: `mvt_preview_tool needs the absolute path of a local .mvt or .pbf file.${reason}`
          }
        ],
        isError: true
      };
    }
    const name = input.file
      ? input.file.name
      : (input.path as string).split('/').pop() || '';
    const tile = tileFromFileName(name);
    const output: MvtPreviewOutput = input.file
      ? { mvtPreview: true, file: input.file, tile }
      : { mvtPreview: true, path: input.path, tile };
    const where = tile
      ? ` as tile ${tile.z}/${tile.x}/${tile.y}`
      : ', with no tile address in its name';
    const text = input.file
      ? `Opened ${name} in the Mapbox vector tile viewer${where}.`
      : `Asked ChatGPT to open ${name} in the Mapbox vector tile viewer${where}. It opens as a tab next to the chat; the layers and features are shown there, not returned here.`;
    return {
      content: [{ type: 'text', text }],
      structuredContent: output,
      isError: false
    };
  }
}
