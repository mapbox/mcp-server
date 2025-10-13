// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN = 'pk.eyJzdWIiOiJ0ZXN0In0.signature';

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  setupHttpRequest,
  assertHeadersSent
} from '../../utils/httpPipelineUtils.js';
import { CategoryListTool } from '../../../src/tools/category-list-tool/CategoryListTool.js';

describe('CategoryListTool', () => {
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
        version: '25:test'
      })
    });

    await new CategoryListTool({ httpRequest }).run({});

    assertHeadersSent(mockHttpRequest);
  });

  it('constructs correct URL with access token', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      json: async () => ({
        listItems: [],
        version: '25:test'
      })
    });

    await new CategoryListTool({ httpRequest }).run({});

    const calledUrl = mockHttpRequest.mock.calls[0][0];
    expect(calledUrl).toContain(
      'https://api.mapbox.com/search/searchbox/v1/list/category'
    );
    expect(calledUrl).toContain('access_token=');
  });

  it('includes language parameter when provided', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      json: async () => ({
        listItems: [],
        version: '25:test'
      })
    });

    await new CategoryListTool({ httpRequest }).run({
      language: 'es'
    });

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
      new CategoryListTool({ httpRequest }).run({})
    ).resolves.toMatchObject({
      isError: true
    });
  });

  it('returns all categories by default', async () => {
    const mockResponse = {
      listItems: [
        {
          canonical_id: 'restaurant',
          name: 'Restaurant'
        },
        {
          canonical_id: 'hotel',
          name: 'Hotel'
        }
      ],
      version: '25:test'
    };

    const { httpRequest } = setupHttpRequest({
      json: async () => mockResponse
    });

    const result = await new CategoryListTool({ httpRequest }).run({});

    expect(result.isError).toBe(false);
    expect(result.content[0].type).toBe('text');
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    const parsed = JSON.parse(text);

    expect(parsed).toEqual({
      listItems: ['restaurant', 'hotel']
    });
  });

  it('handles pagination with limit and offset', async () => {
    const mockResponse = {
      listItems: [
        { canonical_id: 'restaurant', name: 'Restaurant' },
        { canonical_id: 'hotel', name: 'Hotel' },
        { canonical_id: 'cafe', name: 'Cafe' },
        { canonical_id: 'bar', name: 'Bar' },
        { canonical_id: 'shop', name: 'Shop' }
      ],
      version: '25:test'
    };

    const { httpRequest } = setupHttpRequest({
      json: async () => mockResponse
    });

    const result = await new CategoryListTool({ httpRequest }).run({
      limit: 2,
      offset: 1
    });

    expect(result.isError).toBe(false);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    const parsed = JSON.parse(text);

    expect(parsed).toEqual({
      listItems: ['hotel', 'cafe']
    });
  });

  it('handles empty results', async () => {
    const { httpRequest } = setupHttpRequest({
      json: async () => ({
        listItems: [],
        version: '25:test'
      })
    });

    const result = await new CategoryListTool({ httpRequest }).run({});

    expect(result.isError).toBe(false);
    const text = (result.content[0] as { type: 'text'; text: string }).text;
    const parsed = JSON.parse(text);
    expect(parsed).toEqual({
      listItems: []
    });
  });

  it('validates input parameters correctly', async () => {
    const { httpRequest } = setupHttpRequest();
    const tool = new CategoryListTool({ httpRequest });

    expect(() => tool.inputSchema.parse({})).not.toThrow();
    expect(() => tool.inputSchema.parse({ language: 'en' })).not.toThrow();
    expect(() =>
      tool.inputSchema.parse({ limit: 10, offset: 5 })
    ).not.toThrow();

    // Invalid limit should throw
    expect(() => tool.inputSchema.parse({ limit: 0 })).toThrow();
    expect(() => tool.inputSchema.parse({ limit: 101 })).toThrow();

    // Invalid offset should throw
    expect(() => tool.inputSchema.parse({ offset: -1 })).toThrow();
  });

  it('should have output schema defined', () => {
    const { httpRequest } = setupHttpRequest();
    const tool = new CategoryListTool({ httpRequest });
    expect(tool.outputSchema).toBeDefined();
    expect(tool.outputSchema).toBeTruthy();
  });
});
