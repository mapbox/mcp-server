// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { z } from 'zod';
import type { CallToolResult, Icon } from '@modelcontextprotocol/server';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { ToolMeta } from '../BaseTool.js';
import type { HttpRequest } from '../../utils/types.js';
import { getUserNameFromToken } from '../../utils/jwtUtils.js';
import {
  HOME_APP_URI,
  homeAppCsp
} from '../../resources/ui-apps/HomeUIResource.js';
import { mapboxMarkIcon } from '../shared/mapboxMarkIcon.js';
import {
  MapboxHomeOutputSchema,
  type AccountStyle,
  type AccountTileset,
  type AccountToken,
  type MapboxHomeOutput
} from './MapboxHomeTool.output.schema.js';

const MapboxHomeInputSchema = z.object({});

const PAGE_LIMIT = 100;

type Section<T> = { items: T[]; truncated?: boolean; error?: string };

/** The API name for each section, and the scope it needs. */
const SECTIONS = {
  styles: { label: 'Styles', scope: 'styles:list' },
  tilesets: { label: 'Tilesets', scope: 'tilesets:list' },
  tokens: { label: 'Tokens', scope: 'tokens:read' }
} as const;

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

/**
 * `mapbox_home_tool` — the Mapbox home page in ChatGPT's sidebar: starter
 * prompts that hand off to the chat, plus the account's styles, tilesets and
 * public tokens. Its quick action opens `map_explorer_tool`.
 *
 * App-only: ChatGPT calls it with `{}` when the user opens the sidebar entry,
 * and the app calls it again to refresh. Read-only, and never returns secret
 * or temporary tokens.
 */
export class MapboxHomeTool extends MapboxApiBasedTool<
  typeof MapboxHomeInputSchema,
  typeof MapboxHomeOutputSchema
> {
  readonly name = 'mapbox_home_tool';
  readonly description =
    "Open the Mapbox home page: starter prompts and the user's map styles, tilesets and public tokens.";
  readonly annotations = {
    title: 'Mapbox',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  };
  readonly icons: Icon[] = [mapboxMarkIcon];
  readonly meta: ToolMeta;

  constructor(params: { httpRequest: HttpRequest }) {
    super({
      inputSchema: MapboxHomeInputSchema,
      outputSchema: MapboxHomeOutputSchema,
      httpRequest: params.httpRequest
    });
    this.meta = {
      ui: {
        resourceUri: HOME_APP_URI,
        visibility: ['app'],
        csp: homeAppCsp(MapboxApiBasedTool.mapboxApiEndpoint)
      },
      'openai/ui': {
        entrypoints: [
          {
            type: 'global',
            quickAction: {
              title: 'Explore map',
              icons: [mapboxMarkIcon],
              target: { type: 'tool', name: 'map_explorer_tool', arguments: {} }
            }
          }
        ]
      }
    };
  }

  protected async execute(
    _input: unknown,
    accessToken: string
  ): Promise<CallToolResult> {
    const username = getUserNameFromToken(accessToken);
    if (!username) {
      const error = "Couldn't read the account name from the access token.";
      return this.result({
        home: true,
        styles: { items: [], error },
        tilesets: { items: [], error },
        tokens: { items: [], error }
      });
    }

    const [styles, tilesets, tokens] = await Promise.all([
      this.list('styles', `styles/v1/${username}`, accessToken, toStyle),
      this.list('tilesets', `tilesets/v1/${username}`, accessToken, toTileset),
      this.list('tokens', `tokens/v2/${username}`, accessToken, toPublicToken, {
        usage: 'pk'
      })
    ]);

    return this.result({ home: true, username, styles, tilesets, tokens });
  }

  private async list<T>(
    section: keyof typeof SECTIONS,
    path: string,
    accessToken: string,
    toItem: (raw: Record<string, unknown>) => T | undefined,
    params: Record<string, string> = {}
  ): Promise<Section<T>> {
    const url = new URL(`${MapboxApiBasedTool.mapboxApiEndpoint}${path}`);
    url.searchParams.set('limit', String(PAGE_LIMIT));
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    url.searchParams.set('access_token', accessToken);

    try {
      const response = await this.httpRequest(url.toString());
      if (!response.ok) {
        const { label, scope } = SECTIONS[section];
        const scopeHint =
          response.status === 401 || response.status === 403
            ? ` Listing ${label.toLowerCase()} needs the ${scope} scope.`
            : '';
        return {
          items: [],
          // API messages may already end with a period.
          error: `${(await this.getErrorMessage(response)).replace(/\.?$/, '.')}${scopeHint}`
        };
      }
      const body = (await response.json()) as unknown;
      const raw = Array.isArray(body) ? body : [];
      const items = raw
        .map((entry) =>
          entry && typeof entry === 'object'
            ? toItem(entry as Record<string, unknown>)
            : undefined
        )
        .filter((item): item is T => item !== undefined);
      // The list APIs page with a Link header.
      const truncated = /rel="?next"?/.test(
        response.headers?.get?.('link') ?? ''
      );
      return truncated ? { items, truncated } : { items };
    } catch (error) {
      return {
        items: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private result(output: MapboxHomeOutput): CallToolResult {
    const summary = (['styles', 'tilesets', 'tokens'] as const)
      .map((key) => {
        const s = output[key];
        return s.error
          ? `${SECTIONS[key].label}: unavailable (${s.error})`
          : `${SECTIONS[key].label}: ${s.items.length}${s.truncated ? '+' : ''}`;
      })
      .join('; ');
    return {
      content: [
        {
          type: 'text',
          text: `Mapbox${output.username ? ` for ${output.username}` : ''}. ${summary}.`
        }
      ],
      structuredContent: output,
      isError: false
    };
  }
}

function toStyle(raw: Record<string, unknown>): AccountStyle | undefined {
  const id = str(raw.id);
  const owner = str(raw.owner);
  if (!id || !owner) return undefined;
  const center = Array.isArray(raw.center) ? raw.center : undefined;
  const lng = num(center?.[0]);
  const lat = num(center?.[1]);
  return {
    id,
    owner,
    name: str(raw.name) ?? id,
    visibility: str(raw.visibility),
    created: str(raw.created),
    modified: str(raw.modified),
    center: lng !== undefined && lat !== undefined ? [lng, lat] : undefined,
    zoom: num(raw.zoom)
  };
}

function toTileset(raw: Record<string, unknown>): AccountTileset | undefined {
  const id = str(raw.id);
  if (!id) return undefined;
  return {
    id,
    name: str(raw.name) || id,
    type: str(raw.type),
    visibility: str(raw.visibility),
    filesize: num(raw.filesize),
    created: str(raw.created),
    modified: str(raw.modified)
  };
}

/** Public tokens only: anything else is dropped even if the API returns it. */
function toPublicToken(raw: Record<string, unknown>): AccountToken | undefined {
  const token = str(raw.token);
  if (raw.usage !== 'pk' || !token?.startsWith('pk.')) return undefined;
  return {
    id: str(raw.id),
    token,
    note: str(raw.note) ?? null,
    default: raw.default === true,
    allowedUrls: Array.isArray(raw.allowedUrls)
      ? raw.allowedUrls.filter((u): u is string => typeof u === 'string')
      : [],
    scopes: Array.isArray(raw.scopes)
      ? raw.scopes.filter((s): s is string => typeof s === 'string')
      : [],
    modified: str(raw.modified)
  };
}
