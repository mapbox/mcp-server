// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { HttpRequest } from '../../utils/types.js';
import {
  ExportMapHtmlInputSchema,
  type ExportMapHtmlInput
} from './ExportMapHtmlTool.input.schema.js';
import {
  ExportMapHtmlOutputSchema,
  type ExportMapHtmlOutput
} from './ExportMapHtmlTool.output.schema.js';
import { assembleMapPayload } from '../render-map-tool/assembleMapPayload.js';
import {
  renderStandaloneMapHtml,
  standaloneScriptUrl
} from '../../resources/ui-apps/mapAppStandalone.js';
import { renderMapAppHtml } from '../../resources/ui-apps/mapAppHtml.js';
import { resolveMapboxPublicToken } from '../../utils/mapboxPublicToken.js';
import { getOwnerKeyFromToken } from '../../utils/jwtUtils.js';
import { getVersionInfo } from '../../utils/versionUtils.js';

/**
 * Largest map payload (serialized JSON) the tool writes into a page. Unlike
 * render_map_tool, which stores large payloads server-side and passes a ref,
 * the page has to carry its data, and the agent copies the whole page into a
 * file write, so every byte costs output tokens.
 */
export const MAX_EXPORT_PAYLOAD_BYTES = 200 * 1024;

/**
 * `export_map_html_tool` — the same map `render_map_tool` draws in chat, as a
 * standalone HTML page an agent can save into a site or project. Hosts render
 * `render_map_tool` only inside the conversation, so without this an agent
 * building a page has to write its own Mapbox GL JS code and ask the user for
 * a token.
 *
 * The page is a few KB: the map data and a public token as JSON tags, plus
 * the shared map script loaded from jsDelivr by package version (see
 * mapAppStandalone.ts). Keeping it small matters because the agent copies the
 * whole document into a file write.
 */
export class ExportMapHtmlTool extends MapboxApiBasedTool<
  typeof ExportMapHtmlInputSchema,
  typeof ExportMapHtmlOutputSchema
> {
  name = 'export_map_html_tool';
  description =
    'Generate a standalone HTML page with an interactive Mapbox GL JS map, for when you are building a web page, site or file that needs a map. ' +
    'Takes the same input as render_map_tool: `payload_refs` from other Mapbox tools (pass `mapboxRender.ref` values unchanged), or inline `layers`/`markers`/`legend`. ' +
    'Returns a complete HTML document with the map data and a Mapbox public token included (a few KB plus the data, which is limited to 200 KB), to save as its own file (e.g. map.html) or embed with an iframe. ' +
    'To show a map in this conversation instead, use render_map_tool.';
  annotations = {
    title: 'Export Map as HTML',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    // May call the Tokens API to find the account's default public token.
    openWorldHint: true
  };

  private readonly packageVersion: () => string;

  constructor(params: {
    httpRequest: HttpRequest;
    packageVersion?: () => string;
  }) {
    super({
      inputSchema: ExportMapHtmlInputSchema,
      outputSchema: ExportMapHtmlOutputSchema,
      httpRequest: params.httpRequest
    });
    this.packageVersion =
      params.packageVersion ?? (() => getVersionInfo().version);
  }

  protected async execute(
    input: ExportMapHtmlInput,
    accessToken: string
  ): Promise<CallToolResult> {
    const owner = getOwnerKeyFromToken(accessToken);
    const { payload, unresolvedRefs } = assembleMapPayload(input, owner);

    const nothingDrawable =
      (payload?.layers?.length ?? 0) === 0 &&
      (payload?.markers?.length ?? 0) === 0 &&
      (payload?.selfFetch?.length ?? 0) === 0;
    if (!payload || nothingDrawable) {
      return {
        content: [
          {
            type: 'text',
            text:
              unresolvedRefs.length > 0
                ? 'ExportMapHtmlTool: none of the provided payload_refs could be resolved. ' +
                  'They have likely expired (temporary map data lasts about 30 minutes) or belong to a different session. ' +
                  'Re-run the tool(s) that produced the data and pass their mapboxRender.ref values unchanged.'
                : 'ExportMapHtmlTool: nothing to draw. Pass `payload_refs` or inline `layers`/`markers`.'
          }
        ],
        isError: true
      };
    }
    // A deferred layer is fetched from the MCP host with resources/read, which
    // a standalone page doesn't have.
    delete payload.defer;

    const payloadBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    if (payloadBytes > MAX_EXPORT_PAYLOAD_BYTES) {
      return {
        content: [
          {
            type: 'text',
            text:
              `ExportMapHtmlTool: the map data is ${Math.round(payloadBytes / 1024)} KB, over the ${MAX_EXPORT_PAYLOAD_BYTES / 1024} KB limit for a standalone page. ` +
              'Reduce it before exporting: run large polygons or lines through simplify_tool, drop features or properties the page does not need, ' +
              'or split the data across several maps.'
          }
        ],
        isError: true
      };
    }

    const apiEndpoint = MapboxApiBasedTool.mapboxApiEndpoint;
    const publicToken =
      input.public_token ??
      (await resolveMapboxPublicToken({
        accessToken,
        apiEndpoint,
        httpRequest: this.httpRequest
      }));
    if (!publicToken) {
      return {
        content: [
          {
            type: 'text',
            text:
              'ExportMapHtmlTool: no Mapbox public token available for the page. ' +
              'Pass `public_token` (a pk.* token), or configure the server with MAPBOX_PUBLIC_TOKEN ' +
              "or an access token that can read the account's tokens (tokens:read)."
          }
        ],
        isError: true
      };
    }
    const tokenSource: ExportMapHtmlOutput['token_source'] = input.public_token
      ? 'provided'
      : accessToken.startsWith('pk.')
        ? 'access_token'
        : publicToken === process.env.MAPBOX_PUBLIC_TOKEN
          ? 'server_default'
          : 'account_default';

    // The hosted script is pinned to a published package version. Running
    // from source, the version can't be read ('0.0.0'), so inline the script
    // instead of pointing at a URL that would 404.
    const packageVersion = this.packageVersion();
    const hosted = packageVersion !== '0.0.0';
    const html = hosted
      ? renderStandaloneMapHtml({
          publicToken,
          payload,
          packageVersion,
          apiEndpoint
        })
      : renderMapAppHtml({ publicToken, apiEndpoint, initialData: payload });

    const layerCount = payload.layers?.length ?? 0;
    const markerCount = payload.markers?.length ?? 0;
    const liveLayerCount = payload.selfFetch?.length ?? 0;
    const bytes = Buffer.byteLength(html, 'utf8');

    const notes = [
      `Standalone map page (${bytes} bytes): ${layerCount} layer${layerCount === 1 ? '' : 's'}, ` +
        `${markerCount} marker${markerCount === 1 ? '' : 's'}` +
        (payload.summary ? `, "${payload.summary}"` : '') +
        '. Save the HTML below as its own file (e.g. map.html), or embed that file with an iframe.',
      hosted
        ? ''
        : 'The server version is unknown (running from source), so the map script is inlined instead of loaded from jsDelivr.',
      tokenSource === 'provided'
        ? 'The page uses the public token you provided.'
        : "The page uses the account's default public token. For a published site, a URL-restricted public token (pass it as `public_token`) is safer.",
      liveLayerCount > 0
        ? `The page fetches ${liveLayerCount} layer${liveLayerCount === 1 ? '' : 's'} from the Mapbox API each time it loads, billed to that token's account.`
        : '',
      unresolvedRefs.length > 0
        ? `${unresolvedRefs.length} payload ref${unresolvedRefs.length === 1 ? '' : 's'} could not be resolved and ${unresolvedRefs.length === 1 ? 'was' : 'were'} left out.`
        : ''
    ].filter(Boolean);

    // The page goes in the text content only. Repeating it here would double
    // the tokens the host passes to the model.
    const structured: ExportMapHtmlOutput = {
      bytes,
      layer_count: layerCount,
      marker_count: markerCount,
      live_layer_count: liveLayerCount,
      token_source: tokenSource,
      script_url: hosted ? standaloneScriptUrl(packageVersion) : 'inline',
      summary: payload.summary
    };

    return {
      content: [
        { type: 'text', text: notes.join(' ') },
        { type: 'text', text: html }
      ],
      structuredContent: structured,
      isError: false
    };
  }
}
