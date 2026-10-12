// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { createHash } from 'node:crypto';
import type { MapAppPayload } from '../../utils/mapAppPayload.js';
import {
  escapeForScript,
  MAPBOX_GL_VERSION,
  mapAppScript,
  mapAppShell
} from './mapAppHtml.js';

/**
 * Standalone build of the map app, for pages that live outside an MCP host
 * (e.g. a site an agent is building). The page carries its data and config
 * as JSON tags and loads the shared map script from jsDelivr, so the HTML an
 * agent has to copy into a file stays a few KB instead of the ~60 KB inline
 * script the in-chat page uses.
 *
 * The build writes `standaloneMapAppScript()` to dist/map-app/standalone.js
 * (scripts/build-map-app.mjs), which ships in the npm package; the page pins
 * that file by package version and subresource-integrity hash.
 */

const NPM_PACKAGE = '@mapbox/mcp-server';
export const STANDALONE_SCRIPT_PATH = 'dist/map-app/standalone.js';

// Read TOKEN / API_ENDPOINT from the page's #map-config JSON tag instead of
// having them interpolated, so one hosted copy works for every page.
const readConfig = (key: 'token' | 'apiEndpoint', fallback: string) =>
  `(function() { try { var c = JSON.parse(document.getElementById('map-config').textContent); ` +
  `return typeof c.${key} === 'string' ? c.${key} : ${JSON.stringify(fallback)}; } ` +
  `catch (_) { return ${JSON.stringify(fallback)}; } })()`;

let cachedScript: string | undefined;

/** The exact contents of dist/map-app/standalone.js. */
export function standaloneMapAppScript(): string {
  cachedScript ??=
    mapAppScript({
      token: readConfig('token', ''),
      apiEndpoint: readConfig('apiEndpoint', 'https://api.mapbox.com/')
    }) + '\n';
  return cachedScript;
}

/** Subresource-integrity value for the hosted script. */
export function standaloneScriptIntegrity(): string {
  const digest = createHash('sha384')
    .update(standaloneMapAppScript(), 'utf8')
    .digest('base64');
  return `sha384-${digest}`;
}

export function standaloneScriptUrl(packageVersion: string): string {
  return `https://cdn.jsdelivr.net/npm/${NPM_PACKAGE}@${packageVersion}/${STANDALONE_SCRIPT_PATH}`;
}

/**
 * A complete, self-contained HTML page showing `payload`. `scriptUrl` defaults
 * to the jsDelivr copy for `packageVersion`; override it to serve the script
 * from somewhere else.
 */
export function renderStandaloneMapHtml(params: {
  publicToken: string;
  payload: MapAppPayload;
  packageVersion: string;
  apiEndpoint?: string;
  glVersion?: string;
  scriptUrl?: string;
}): string {
  const config = {
    token: params.publicToken,
    apiEndpoint: params.apiEndpoint ?? 'https://api.mapbox.com/'
  };
  const scriptUrl =
    params.scriptUrl ?? standaloneScriptUrl(params.packageVersion);
  return `${mapAppShell(params.glVersion ?? MAPBOX_GL_VERSION)}
<script id="initial-data" type="application/json">${escapeForScript(JSON.stringify(params.payload))}</script>
<script id="map-config" type="application/json">${escapeForScript(JSON.stringify(config))}</script>
<script src="${scriptUrl}" integrity="${standaloneScriptIntegrity()}" crossorigin="anonymous"></script>
</body>
</html>
`;
}
