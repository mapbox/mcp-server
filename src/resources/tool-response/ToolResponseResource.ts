// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { MapboxApiBasedResource } from '../MapboxApiBasedResource.js';
import type { HttpRequest } from '../../utils/types.js';
import { resolveResponseRef } from '../../utils/responseRef.js';
import { DirectionsInputSchema } from '../../tools/directions-tool/DirectionsTool.input.schema.js';
import { buildDirectionsRequestUrl } from '../../tools/directions-tool/buildDirectionsRequestUrl.js';
import { cleanResponseData } from '../../tools/directions-tool/cleanResponseData.js';
import type { DirectionsResponse } from '../../tools/directions-tool/DirectionsTool.output.schema.js';
import { IsochroneInputSchema } from '../../tools/isochrone-tool/IsochroneTool.input.schema.js';
import { buildIsochroneRequestUrl } from '../../tools/isochrone-tool/buildIsochroneRequestUrl.js';

/**
 * Full `directions_tool` / `isochrone_tool` responses that were too large
 * to return inline. The `mapbox://response/{tool}?data=...` ref carries the
 * call's inputs (see responseRef.ts), and reading it runs the same request
 * again with the reader's token, so any server process can answer it.
 */
export class ToolResponseResource extends MapboxApiBasedResource {
  readonly name = 'Full Tool Response';
  readonly uri = 'mapbox://response/{spec}';
  readonly description =
    'The full response of a directions_tool or isochrone_tool call that was too large to return inline, fetched again from its ref.';
  readonly mimeType = 'application/json';

  constructor(params: { httpRequest: HttpRequest }) {
    super(params);
  }

  protected async execute(
    uri: string,
    accessToken: string
  ): Promise<ReadResourceResult> {
    const spec = resolveResponseRef(uri);
    const apiEndpoint = MapboxApiBasedResource.mapboxApiEndpoint;
    let url: string | null = null;
    let directionsInput: ReturnType<typeof DirectionsInputSchema.parse> | null =
      null;

    if (spec?.tool === 'directions') {
      const parsed = DirectionsInputSchema.safeParse(spec.input);
      if (parsed.success) {
        directionsInput = parsed.data;
        url = buildDirectionsRequestUrl({
          input: parsed.data,
          accessToken,
          apiEndpoint
        });
      }
    } else if (spec?.tool === 'isochrone') {
      const parsed = IsochroneInputSchema.safeParse(spec.input);
      if (
        parsed.success &&
        (parsed.data.contours_minutes || parsed.data.contours_meters)
      ) {
        url = buildIsochroneRequestUrl({
          input: parsed.data,
          accessToken,
          apiEndpoint
        });
      }
    }

    if (!url) {
      return text(uri, 'Response ref was malformed or unsupported.');
    }

    const response = await this.httpRequest(url);
    if (!response.ok) {
      return text(
        uri,
        `Fetching the full response failed: ${response.status} ${response.statusText}`
      );
    }
    let data: unknown = await response.json();

    if (directionsInput) {
      // The same cast DirectionsTool makes on its own response.
      let cleaned = cleanResponseData(
        directionsInput,
        data as DirectionsResponse
      );
      // Same route the user picked when the original call was made.
      const index = spec?.selectedRouteIndex;
      if (index !== undefined && cleaned.routes?.[index]) {
        cleaned = { ...cleaned, routes: [cleaned.routes[index]] };
      }
      data = cleaned;
    }

    return {
      contents: [
        { uri, mimeType: this.mimeType, text: JSON.stringify(data, null, 2) }
      ]
    };
  }
}

function text(uri: string, message: string): ReadResourceResult {
  return { contents: [{ uri, mimeType: 'text/plain', text: message }] };
}
