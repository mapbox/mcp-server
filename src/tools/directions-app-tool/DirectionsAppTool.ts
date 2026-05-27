// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import { createUIResource } from '@mcp-ui/server';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { HttpRequest } from '../../utils/types.js';
import { getUserNameFromToken } from '../../utils/jwtUtils.js';
import { DirectionsAppInputSchema } from './DirectionsAppTool.input.schema.js';

// Docs: https://docs.mapbox.com/api/navigation/directions/

interface RouteFeature {
  geometry?: { type: string; coordinates?: [number, number][] };
  distance?: number;
  duration?: number;
}

interface DirectionsResponse {
  routes?: RouteFeature[];
}

interface TokenListEntry {
  token?: string;
  usage?: string;
  default?: boolean;
}

// Cache the resolved pk.* token for an hour to avoid an extra Tokens API call
// on every directions_app_tool invocation.
interface CachedToken {
  token: string;
  expiresAt: number;
}
const PUBLIC_TOKEN_TTL_MS = 60 * 60 * 1000; // 1h

export class DirectionsAppTool extends MapboxApiBasedTool<
  typeof DirectionsAppInputSchema
> {
  private cachedPublicToken: CachedToken | null = null;

  name = 'directions_app_tool';
  description =
    'Render a directions route on an interactive Mapbox GL JS map as an MCP App. ' +
    'Returns a self-contained HTML UI resource with the route drawn, start/end markers, ' +
    'and camera fit to the route bounds. The required public (pk.*) token is fetched ' +
    "from the user's Mapbox account via the Tokens API (requires the tokens:read scope) " +
    'or read from the optional MAPBOX_PUBLIC_TOKEN env var as a fallback. ' +
    'Use this when the user asks for a visual, interactive map of a route rather than ' +
    'just turn-by-turn data.';
  annotations = {
    title: 'Directions App Tool',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  };

  constructor(params: { httpRequest: HttpRequest }) {
    super({
      inputSchema: DirectionsAppInputSchema,
      httpRequest: params.httpRequest
    });
  }

  protected async execute(
    input: z.infer<typeof DirectionsAppInputSchema>,
    accessToken: string
  ): Promise<CallToolResult> {
    const publicToken = await this.resolvePublicToken(accessToken);
    if (!publicToken) {
      return {
        content: [
          {
            type: 'text',
            text: 'Unable to resolve a public Mapbox token. The server token does not have tokens:read scope and MAPBOX_PUBLIC_TOKEN is not set. Either grant tokens:read to the OAuth client or set MAPBOX_PUBLIC_TOKEN (a pk.* token).'
          }
        ],
        isError: true
      };
    }

    const coords = input.coordinates
      .map((c) => `${c.longitude},${c.latitude}`)
      .join(';');

    const url = new URL(
      `${MapboxApiBasedTool.mapboxApiEndpoint}directions/v5/${input.routing_profile}/${encodeURIComponent(coords)}`
    );
    url.searchParams.set('access_token', accessToken);
    url.searchParams.set('geometries', 'geojson');
    url.searchParams.set('overview', 'full');

    const response = await this.httpRequest(url.toString());
    if (!response.ok) {
      const errorText = await this.getErrorMessage(response);
      return {
        content: [{ type: 'text', text: `Directions API error: ${errorText}` }],
        isError: true
      };
    }

    const data = (await response.json()) as DirectionsResponse;
    const route = data.routes?.[0];
    if (!route?.geometry?.coordinates?.length) {
      return {
        content: [
          { type: 'text', text: 'No route found for the given coordinates.' }
        ],
        isError: true
      };
    }

    const distanceMiles = route.distance
      ? `${(route.distance / 1609.34).toFixed(1)} mi`
      : 'unknown';
    const durationMin = route.duration
      ? `${Math.round(route.duration / 60)} min`
      : 'unknown';

    const summary = `Route: ${distanceMiles}, ${durationMin}`;

    const htmlString = buildRouteAppHtml({
      publicToken,
      geometry: route.geometry as {
        type: string;
        coordinates: [number, number][];
      },
      profile: input.routing_profile,
      summary
    });

    const uiResource = createUIResource({
      uri: `ui://mapbox/directions/${randomUUID()}`,
      content: { type: 'rawHtml', htmlString },
      encoding: 'text',
      uiMetadata: {
        'preferred-frame-size': ['100%', '480px']
      },
      resourceProps: {
        _meta: {
          ui: {
            csp: {
              connectDomains: [
                'https://*.mapbox.com',
                'https://events.mapbox.com'
              ],
              resourceDomains: ['https://api.mapbox.com'],
              workerDomains: ['blob:']
            }
          }
        }
      }
    });

    return {
      content: [{ type: 'text', text: summary }, uiResource],
      isError: false,
      _meta: {
        viewUUID: randomUUID()
      }
    };
  }

  /**
   * Resolve a public (pk.*) token suitable for embedding in client-side HTML.
   *
   * Resolution order:
   * 1. If the server token is already a pk.* token, use it directly.
   * 2. If we have a cached pk.* token with >5 min TTL remaining, reuse it.
   * 3. If the server token is an sk.* token, call GET /tokens/v2/{user}?default=true
   *    to fetch the user's default public token (requires tokens:read scope).
   * 4. Fall back to the MAPBOX_PUBLIC_TOKEN env var.
   *
   * Returns undefined if none of the above produces a pk.* token.
   */
  private async resolvePublicToken(
    accessToken: string
  ): Promise<string | undefined> {
    if (accessToken.startsWith('pk.')) {
      return accessToken;
    }

    const now = Date.now();
    if (
      this.cachedPublicToken &&
      this.cachedPublicToken.expiresAt - now > 5 * 60 * 1000
    ) {
      return this.cachedPublicToken.token;
    }

    if (accessToken.startsWith('sk.')) {
      const username = getUserNameFromToken(accessToken);
      if (username) {
        try {
          const tokensUrl = new URL(
            `${MapboxApiBasedTool.mapboxApiEndpoint}tokens/v2/${username}`
          );
          tokensUrl.searchParams.set('default', 'true');
          tokensUrl.searchParams.set('access_token', accessToken);

          const response = await this.httpRequest(tokensUrl.toString());
          if (response.ok) {
            const body = (await response.json()) as unknown;
            const entries: TokenListEntry[] = Array.isArray(body)
              ? (body as TokenListEntry[])
              : ((body as { tokens?: TokenListEntry[] })?.tokens ?? []);
            const defaultPk = entries.find(
              (entry) =>
                entry?.usage === 'pk' && typeof entry.token === 'string'
            );
            if (defaultPk?.token) {
              this.cachedPublicToken = {
                token: defaultPk.token,
                expiresAt: now + PUBLIC_TOKEN_TTL_MS
              };
              return defaultPk.token;
            }
          }
        } catch (err) {
          this.log(
            'debug',
            `directions_app_tool: failed to fetch default public token, falling back to env var: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }

    const envFallback = process.env.MAPBOX_PUBLIC_TOKEN;
    return envFallback && envFallback.startsWith('pk.')
      ? envFallback
      : undefined;
  }
}

interface RouteAppParams {
  publicToken: string;
  geometry: { type: string; coordinates: [number, number][] };
  profile: string;
  summary: string;
}

function buildRouteAppHtml(params: RouteAppParams): string {
  const { publicToken, geometry, profile, summary } = params;

  // Compute bounding box for camera fit
  const lngs = geometry.coordinates.map((c) => c[0]);
  const lats = geometry.coordinates.map((c) => c[1]);
  const bounds: [[number, number], [number, number]] = [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)]
  ];

  const startCoord = geometry.coordinates[0];
  const endCoord = geometry.coordinates[geometry.coordinates.length - 1];

  const data = {
    publicToken,
    profile,
    summary,
    geometry,
    bounds,
    startCoord,
    endCoord
  };

  // Escape </script> in the JSON payload to prevent breaking out of the script tag
  const dataJson = JSON.stringify(data).replace(/<\/script>/gi, '<\\/script>');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Mapbox Directions</title>
<link href="https://api.mapbox.com/mapbox-gl-js/v3.12.0/mapbox-gl.css" rel="stylesheet" />
<style>
  html, body { margin: 0; padding: 0; height: 100%; font-family: system-ui, sans-serif; }
  #map { position: absolute; inset: 0; }
  #summary {
    position: absolute; top: 12px; left: 12px; z-index: 10;
    background: rgba(15, 23, 42, 0.85); color: #f1f5f9;
    padding: 8px 12px; border-radius: 6px;
    font-size: 13px; font-weight: 500;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  }
</style>
</head>
<body>
<div id="map"></div>
<div id="summary"></div>
<script src="https://api.mapbox.com/mapbox-gl-js/v3.12.0/mapbox-gl.js"></script>
<script id="route-data" type="application/json">${dataJson}</script>
<script>
(function() {
  const data = JSON.parse(document.getElementById('route-data').textContent);
  document.getElementById('summary').textContent = data.summary;

  mapboxgl.accessToken = data.publicToken;
  const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v12',
    bounds: data.bounds,
    fitBoundsOptions: { padding: 60 }
  });

  map.on('load', () => {
    map.addSource('route', {
      type: 'geojson',
      data: { type: 'Feature', geometry: data.geometry, properties: {} }
    });
    map.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#3b82f6', 'line-width': 5, 'line-opacity': 0.85 }
    });

    new mapboxgl.Marker({ color: '#22c55e' })
      .setLngLat(data.startCoord)
      .setPopup(new mapboxgl.Popup().setText('Start'))
      .addTo(map);

    new mapboxgl.Marker({ color: '#ef4444' })
      .setLngLat(data.endCoord)
      .setPopup(new mapboxgl.Popup().setText('End'))
      .addTo(map);
  });

  map.on('error', (e) => {
    console.error('Mapbox error:', e?.error?.message ?? e);
  });
})();
</script>
</body>
</html>`;
}
