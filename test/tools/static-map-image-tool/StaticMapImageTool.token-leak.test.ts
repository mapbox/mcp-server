// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

// PoC test: Verify that the access token is NOT leaked in the UIResource
// sent to the client when MCP-UI is enabled.

process.env.MAPBOX_ACCESS_TOKEN =
  'sk.eyJ1IjoiYXR0YWNrZXIiLCJhIjoic2VjcmV0In0.secret_key';

import { describe, it, expect, afterEach, vi } from 'vitest';
import { setupHttpRequest } from '../../utils/httpPipelineUtils.js';
import { StaticMapImageTool } from '../../../src/tools/static-map-image-tool/StaticMapImageTool.js';

describe('StaticMapImageTool - token leak prevention', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('UIResource must not contain the access token', async () => {
    // Ensure MCP-UI is enabled so the UIResource is generated
    const originalEnv = process.env.ENABLE_MCP_UI;
    process.env.ENABLE_MCP_UI = 'true';

    try {
      const { httpRequest } = setupHttpRequest();

      const result = await new StaticMapImageTool({ httpRequest }).run({
        center: { longitude: -74.006, latitude: 40.7128 },
        zoom: 12,
        size: { width: 600, height: 400 },
        style: 'mapbox/streets-v12'
      });

      expect(result.isError).toBe(false);

      // Find the UIResource in the response
      const resourceContent = result.content.find((c) => c.type === 'resource');
      expect(resourceContent).toBeDefined();

      // Serialize the entire resource to check for token leakage
      const resourceStr = JSON.stringify(resourceContent);

      // The access token must NOT appear anywhere in the UIResource
      expect(resourceStr).not.toContain('access_token=');
      expect(resourceStr).not.toContain(
        'sk.eyJ1IjoiYXR0YWNrZXIiLCJhIjoic2VjcmV0In0.secret_key'
      );
    } finally {
      if (originalEnv !== undefined) {
        process.env.ENABLE_MCP_UI = originalEnv;
      } else {
        delete process.env.ENABLE_MCP_UI;
      }
    }
  });

  it('UIResource iframeUrl should use publicUrl without credentials', async () => {
    const originalEnv = process.env.ENABLE_MCP_UI;
    process.env.ENABLE_MCP_UI = 'true';

    try {
      const { httpRequest } = setupHttpRequest();

      const result = await new StaticMapImageTool({ httpRequest }).run({
        center: { longitude: -122.4194, latitude: 37.7749 },
        zoom: 13,
        size: { width: 800, height: 600 },
        style: 'mapbox/satellite-streets-v12'
      });

      expect(result.isError).toBe(false);

      const resourceContent = result.content.find((c) => c.type === 'resource');
      expect(resourceContent).toBeDefined();

      if (resourceContent?.type === 'resource') {
        const resource = resourceContent.resource;
        // The resource text (which is the iframeUrl for externalUrl type)
        // should contain the map URL but NOT the access token
        if ('text' in resource && typeof resource.text === 'string') {
          expect(resource.text).toContain('api.mapbox.com/styles/v1/');
          expect(resource.text).not.toContain('access_token=');
        }
      }
    } finally {
      if (originalEnv !== undefined) {
        process.env.ENABLE_MCP_UI = originalEnv;
      } else {
        delete process.env.ENABLE_MCP_UI;
      }
    }
  });
});
