// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN = 'pk.eyJzdWIiOiJ0ZXN0In0.signature';

import { describe, it, expect, vi, afterEach } from 'vitest';
import { McpServer, InMemoryTransport } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';
import {
  setupHttpRequest,
  assertHeadersSent
} from '../../utils/httpPipelineUtils.js';
import { CategoryListResource } from '../../../src/resources/category-list/CategoryListResource.js';
import { resourceTextOf } from '../../utils/resultTestUtils.js';

describe('CategoryListResource', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends custom header', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      json: async () => ({
        listItems: [
          {
            canonical_id: 'restaurant',
            name: 'Restaurant'
          }
        ],
        version: '25:test',
        attribution: 'Test Attribution'
      })
    });

    await new CategoryListResource({ httpRequest }).read('mapbox://categories');

    assertHeadersSent(mockHttpRequest);
  });

  it('constructs correct URL with access token', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      json: async () => ({
        listItems: [],
        version: '25:test',
        attribution: 'Test Attribution'
      })
    });

    await new CategoryListResource({ httpRequest }).read('mapbox://categories');

    const calledUrl = mockHttpRequest.mock.calls[0][0];
    expect(calledUrl).toContain(
      'https://api.mapbox.com/search/searchbox/v1/list/category'
    );
    expect(calledUrl).toContain('access_token=');
  });

  it('includes language parameter when provided in URI', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      json: async () => ({
        listItems: [],
        version: '25:test',
        attribution: 'Test Attribution'
      })
    });

    await new CategoryListResource({ httpRequest }).read(
      'mapbox://categories/es'
    );

    const calledUrl = mockHttpRequest.mock.calls[0][0];
    expect(calledUrl).toContain('language=es');
  });

  it('handles fetch errors gracefully', async () => {
    const { httpRequest } = setupHttpRequest({
      ok: false,
      status: 403,
      statusText: 'Forbidden'
    });

    await expect(
      new CategoryListResource({ httpRequest }).read('mapbox://categories')
    ).rejects.toThrow('Mapbox API request failed: 403 Forbidden');
  });

  it('returns all categories by default', async () => {
    const mockResponse = {
      listItems: [
        {
          canonical_id: 'restaurant',
          name: 'Restaurant',
          icon: 'restaurant-icon'
        },
        {
          canonical_id: 'hotel',
          name: 'Hotel',
          icon: 'hotel-icon'
        }
      ],
      version: '25:test',
      attribution: 'Test Attribution'
    };

    const { httpRequest } = setupHttpRequest({
      json: async () => mockResponse
    });

    const result = await new CategoryListResource({ httpRequest }).read(
      'mapbox://categories'
    );

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].uri).toBe('mapbox://categories');
    expect(result.contents[0].mimeType).toBe('application/json');

    const parsed = JSON.parse(resourceTextOf(result));
    expect(parsed.listItems).toEqual(['restaurant', 'hotel']);
    expect(parsed.version).toBe('25:test');
    expect(parsed.attribution).toBe('Test Attribution');
  });

  it('handles empty results', async () => {
    const { httpRequest } = setupHttpRequest({
      json: async () => ({
        listItems: [],
        version: '25:test',
        attribution: 'Test Attribution'
      })
    });

    const result = await new CategoryListResource({ httpRequest }).read(
      'mapbox://categories'
    );

    expect(result.contents).toHaveLength(1);
    const parsed = JSON.parse(resourceTextOf(result));
    expect(parsed.listItems).toEqual([]);
  });

  it('has correct resource metadata', () => {
    const { httpRequest } = setupHttpRequest();
    const resource = new CategoryListResource({ httpRequest });

    expect(resource.uri).toBe('mapbox://categories');
    expect(resource.name).toBe('Mapbox Categories');
    expect(resource.mimeType).toBe('application/json');
    expect(resource.description).toContain('Mapbox Search API categories');
  });

  it('extracts language from URI correctly', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      json: async () => ({
        listItems: [],
        version: '25:test',
        attribution: 'Test Attribution'
      })
    });

    // Test Japanese
    await new CategoryListResource({ httpRequest }).read(
      'mapbox://categories/ja'
    );
    let calledUrl = mockHttpRequest.mock.calls[0][0];
    expect(calledUrl).toContain('language=ja');

    // Test Spanish
    mockHttpRequest.mockClear();
    await new CategoryListResource({ httpRequest }).read(
      'mapbox://categories/es'
    );
    calledUrl = mockHttpRequest.mock.calls[0][0];
    expect(calledUrl).toContain('language=es');

    // Test default (no language)
    mockHttpRequest.mockClear();
    await new CategoryListResource({ httpRequest }).read('mapbox://categories');
    calledUrl = mockHttpRequest.mock.calls[0][0];
    expect(calledUrl).not.toContain('language=');
  });

  it.each([
    'mapbox://categories/%20ja',
    'mapbox://categories/ja?x=1',
    'mapbox://categories/japanese'
  ])('rejects %s instead of returning the English list', async (uri) => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest();

    await expect(
      new CategoryListResource({ httpRequest }).read(uri)
    ).rejects.toThrow('Resource not found');
    expect(mockHttpRequest).not.toHaveBeenCalled();
  });

  it('passes a language with a script or region through, like zh-Hant', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      json: async () => ({ listItems: [], version: '1', attribution: '' })
    });

    await new CategoryListResource({ httpRequest }).read(
      'mapbox://categories/zh-Hant'
    );

    expect(mockHttpRequest.mock.calls[0][0]).toContain('language=zh-Hant');
  });

  describe('through an MCP client', () => {
    // resources/read matches a fixed URI exactly, so mapbox://categories/ja
    // used to come back "Resource not found" unless the uriTemplate is
    // registered too.
    async function connect() {
      const { httpRequest, mockHttpRequest } = setupHttpRequest({
        json: async () => ({
          listItems: [{ canonical_id: 'restaurant', name: 'レストラン' }],
          version: '25:test',
          attribution: 'Test Attribution'
        })
      });
      const server = new McpServer({ name: 'test', version: '0.0.0' });
      new CategoryListResource({ httpRequest }).installTo(server);
      const [clientTransport, serverTransport] =
        InMemoryTransport.createLinkedPair();
      const client = new Client({ name: 'test-client', version: '0.0.0' });
      await Promise.all([
        server.connect(serverTransport),
        client.connect(clientTransport)
      ]);
      return { client, mockHttpRequest };
    }

    it('reads a localized list by language', async () => {
      const { client, mockHttpRequest } = await connect();

      const result = await client.readResource({
        uri: 'mapbox://categories/ja'
      });

      expect(result.contents[0].uri).toBe('mapbox://categories/ja');
      expect(mockHttpRequest.mock.calls[0][0]).toContain('language=ja');
      await client.close();
    });

    it('still reads the default list at the fixed URI', async () => {
      const { client, mockHttpRequest } = await connect();

      await client.readResource({ uri: 'mapbox://categories' });

      expect(mockHttpRequest.mock.calls[0][0]).not.toContain('language=');
      await client.close();
    });

    it('lists the fixed URI and the language template', async () => {
      const { client } = await connect();

      const { resources } = await client.listResources();
      const { resourceTemplates } = await client.listResourceTemplates();

      expect(resources.map((r) => r.uri)).toEqual(['mapbox://categories']);
      expect(resourceTemplates.map((t) => t.uriTemplate)).toEqual([
        'mapbox://categories/{language}'
      ]);
      await client.close();
    });
  });
});
