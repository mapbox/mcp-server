// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  setupHttpRequest,
  assertHeadersSent
} from '../../utils/httpPipelineUtils.js';
import { FeedbackTool } from '../../../src/tools/feedback-tool/FeedbackTool.js';

describe('FeedbackTool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends custom header', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      json: async () => ({
        items: [],
        has_before: false,
        has_after: false
      })
    });

    await new FeedbackTool({ httpRequest }).run({
      operation: 'list'
    });

    assertHeadersSent(mockHttpRequest);
  });

  describe('list operation', () => {
    it('constructs correct URL for list operation', async () => {
      const { httpRequest, mockHttpRequest } = setupHttpRequest({
        json: async () => ({
          items: [],
          has_before: false,
          has_after: false
        })
      });

      await new FeedbackTool({ httpRequest }).run({
        operation: 'list'
      });

      const calledUrl = mockHttpRequest.mock.calls[0][0];
      expect(calledUrl).toContain('user-feedback/v1/feedback');
      expect(calledUrl).toContain('access_token=');
      expect(calledUrl).toContain('sort_by=received_at');
      expect(calledUrl).toContain('order=asc');
    });

    it('includes all optional list parameters in URL', async () => {
      const { httpRequest, mockHttpRequest } = setupHttpRequest({
        json: async () => ({
          items: [],
          has_before: false,
          has_after: false
        })
      });

      await new FeedbackTool({ httpRequest }).run({
        operation: 'list',
        feedback_ids: [
          '40eae4c7-b157-4b49-a091-7e1099bba77e',
          '8b1eec47-a3f2-4a6d-a2d9-5e8c1f4a9b0c'
        ],
        after:
          'eyJpZCI6IjAxOTg1YWQ2LWE4ZjEtNzdkZS1iODkxLWU4NTVhNGI3ZTQ5NiIsInRpbWVzdGFtcCI6IjIwMjUtMDctMzBUMTA6MTc6NTQuMTYxWiJ9',
        limit: 50,
        sort_by: 'updated_at',
        order: 'desc',
        status: ['fixed', 'reviewed'],
        category: ['poi_details', 'routing_issue'],
        search: 'apartment building',
        trace_id: ['a35ab5db-dd99-45a6-966b-fc6bda2181b9'],
        created_after: '2025-07-01T00:00:00.000Z',
        created_before: '2025-07-31T23:59:59.999Z',
        received_after: '2025-07-01T00:00:00.000Z',
        received_before: '2025-07-31T23:59:59.999Z',
        updated_after: '2025-07-01T00:00:00.000Z',
        updated_before: '2025-07-31T23:59:59.999Z'
      });

      const calledUrl = mockHttpRequest.mock.calls[0][0];
      expect(calledUrl).toContain(
        'feedback_id=40eae4c7-b157-4b49-a091-7e1099bba77e'
      );
      expect(calledUrl).toContain(
        'feedback_id=8b1eec47-a3f2-4a6d-a2d9-5e8c1f4a9b0c'
      );
      expect(calledUrl).toContain(
        'after=eyJpZCI6IjAxOTg1YWQ2LWE4ZjEtNzdkZS1iODkxLWU4NTVhNGI3ZTQ5NiIsInRpbWVzdGFtcCI6IjIwMjUtMDctMzBUMTA6MTc6NTQuMTYxWiJ9'
      );
      expect(calledUrl).toContain('limit=50');
      expect(calledUrl).toContain('sort_by=updated_at');
      expect(calledUrl).toContain('order=desc');
      expect(calledUrl).toContain('status=fixed');
      expect(calledUrl).toContain('status=reviewed');
      expect(calledUrl).toContain('category=poi_details');
      expect(calledUrl).toContain('category=routing_issue');
      expect(calledUrl).toContain('search=apartment+building');
      expect(calledUrl).toContain(
        'trace_id=a35ab5db-dd99-45a6-966b-fc6bda2181b9'
      );
      expect(calledUrl).toContain('created_after=2025-07-01T00%3A00%3A00.000Z');
      expect(calledUrl).toContain(
        'created_before=2025-07-31T23%3A59%3A59.999Z'
      );
      expect(calledUrl).toContain(
        'received_after=2025-07-01T00%3A00%3A00.000Z'
      );
      expect(calledUrl).toContain(
        'received_before=2025-07-31T23%3A59%3A59.999Z'
      );
      expect(calledUrl).toContain('updated_after=2025-07-01T00%3A00%3A00.000Z');
      expect(calledUrl).toContain(
        'updated_before=2025-07-31T23%3A59%3A59.999Z'
      );
    });

    it('handles list response with items', async () => {
      const mockResponse = {
        items: [
          {
            id: '40eae4c7-b157-4b49-a091-7e1099bba77e',
            status: 'fixed',
            category: 'poi_details',
            feedback:
              'I want to add a note that to get into this apartment building you have to put in a code for 396.',
            location: {
              place_name:
                'Financial District, Boston, Massachusetts, United States',
              lon: -71.05011393295,
              lat: 42.351484923828
            },
            trace_id: 'a35ab5db-dd99-45a6-966b-fc6bda2181b9',
            received_at: '2025-07-28T14:10:30.123Z',
            created_at: '2025-07-28T14:10:25.000Z',
            updated_at: '2025-07-28T14:10:30.123Z'
          },
          {
            id: '8b1eec47-a3f2-4a6d-a2d9-5e8c1f4a9b0c',
            status: 'received',
            category: 'routing_issue',
            feedback: 'The navigation tried to take me down a one-way street.',
            location: {
              place_name: '123 Main St, Anytown, USA',
              lon: -122.4194,
              lat: 37.7749
            },
            trace_id: '9c12345e-45a6-45a6-966b-abcdef123456',
            received_at: '2025-07-27T11:22:05.456Z',
            created_at: '2025-07-27T11:21:59.000Z',
            updated_at: '2025-07-29T09:00:00.000Z'
          }
        ],
        has_before: false,
        start_cursor:
          'eyJpZCI6IjAxOTg1YWQ2LWE4ZjEtNzdkZS1iODkxLWU4NTVhNGI3ZTQ5NiIsInRpbWVzdGFtcCI6IjIwMjUtMDctMzBUMTA6MTc6NTQuMTYxWiJ9',
        has_after: true,
        end_cursor:
          'eyJpZCI6IjAxOTg1YWQyLTE3MzUtNzNmYS1iMjE2LTI3NDk1YmJjYzFkYiIsInRpbWVzdGFtcCI6IjIwMjUtMDctMzBUMTA6MTI6NTQuNzA5WiJ9'
      };

      const { httpRequest } = setupHttpRequest({
        json: async () => mockResponse
      });

      const result = await new FeedbackTool({ httpRequest }).run({
        operation: 'list'
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Found 2 feedback item(s)');
      expect(result.content[0].text).toContain(
        '40eae4c7-b157-4b49-a091-7e1099bba77e'
      );
      expect(result.content[0].text).toContain(
        '8b1eec47-a3f2-4a6d-a2d9-5e8c1f4a9b0c'
      );
      expect(result.structuredContent).toEqual(mockResponse);
    });

    it('handles empty list response', async () => {
      const { httpRequest } = setupHttpRequest({
        json: async () => ({
          items: [],
          has_before: false,
          has_after: false
        })
      });

      const result = await new FeedbackTool({ httpRequest }).run({
        operation: 'list'
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('No feedback items found');
    });

    it('handles list response with pagination info', async () => {
      const { httpRequest } = setupHttpRequest({
        json: async () => ({
          items: [
            {
              id: '40eae4c7-b157-4b49-a091-7e1099bba77e',
              status: 'fixed',
              category: 'poi_details',
              feedback: 'Test feedback',
              location: {
                place_name: 'Test Location',
                lon: -71.05,
                lat: 42.35
              },
              received_at: '2025-07-28T14:10:30.123Z',
              created_at: '2025-07-28T14:10:25.000Z',
              updated_at: '2025-07-28T14:10:30.123Z'
            }
          ],
          has_before: true,
          start_cursor: 'cursor1',
          has_after: true,
          end_cursor: 'cursor2'
        })
      });

      const result = await new FeedbackTool({ httpRequest }).run({
        operation: 'list'
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('Has previous page');
      expect(result.content[0].text).toContain('Has next page');
      expect(result.content[0].text).toContain('cursor1');
      expect(result.content[0].text).toContain('cursor2');
    });

    it('returns JSON format when requested', async () => {
      const mockResponse = {
        items: [
          {
            id: '40eae4c7-b157-4b49-a091-7e1099bba77e',
            status: 'fixed',
            category: 'poi_details',
            feedback: 'Test feedback',
            location: {
              place_name: 'Test Location',
              lon: -71.05,
              lat: 42.35
            },
            received_at: '2025-07-28T14:10:30.123Z',
            created_at: '2025-07-28T14:10:25.000Z',
            updated_at: '2025-07-28T14:10:30.123Z'
          }
        ],
        has_before: false,
        has_after: false
      };

      const { httpRequest } = setupHttpRequest({
        json: async () => mockResponse
      });

      const result = await new FeedbackTool({ httpRequest }).run({
        operation: 'list',
        format: 'json_string'
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].type).toBe('text');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toEqual(mockResponse);
    });
  });

  describe('get operation', () => {
    it('constructs correct URL for get operation', async () => {
      const feedbackId = '40eae4c7-b157-4b49-a091-7e1099bba77e';
      const { httpRequest, mockHttpRequest } = setupHttpRequest({
        json: async () => ({
          id: feedbackId,
          status: 'fixed',
          category: 'poi_details',
          feedback: 'Test feedback',
          location: {
            place_name: 'Test Location',
            lon: -71.05,
            lat: 42.35
          },
          received_at: '2025-07-28T14:10:30.123Z',
          created_at: '2025-07-28T14:10:25.000Z',
          updated_at: '2025-07-28T14:10:30.123Z'
        })
      });

      await new FeedbackTool({ httpRequest }).run({
        operation: 'get',
        feedback_id: feedbackId
      });

      const calledUrl = mockHttpRequest.mock.calls[0][0];
      expect(calledUrl).toContain(`user-feedback/v1/feedback/${feedbackId}`);
      expect(calledUrl).toContain('access_token=');
    });

    it('handles get response with single item', async () => {
      const mockItem = {
        id: '40eae4c7-b157-4b49-a091-7e1099bba77e',
        status: 'fixed',
        category: 'poi_details',
        feedback:
          'I want to add a note that to get into this apartment building you have to put in a code for 396.',
        location: {
          place_name:
            'Financial District, Boston, Massachusetts, United States',
          lon: -71.05011393295,
          lat: 42.351484923828
        },
        trace_id: 'a35ab5db-dd99-45a6-966b-fc6bda2181b9',
        received_at: '2025-07-28T14:10:30.123Z',
        created_at: '2025-07-28T14:10:25.000Z',
        updated_at: '2025-07-28T14:10:30.123Z'
      };

      const { httpRequest } = setupHttpRequest({
        json: async () => mockItem
      });

      const result = await new FeedbackTool({ httpRequest }).run({
        operation: 'get',
        feedback_id: mockItem.id
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain(mockItem.id);
      expect(result.content[0].text).toContain(mockItem.status);
      expect(result.content[0].text).toContain(mockItem.category);
      expect(result.content[0].text).toContain(mockItem.feedback);
      expect(result.structuredContent).toEqual(mockItem);
    });

    it('returns JSON format when requested for get operation', async () => {
      const mockItem = {
        id: '40eae4c7-b157-4b49-a091-7e1099bba77e',
        status: 'fixed',
        category: 'poi_details',
        feedback: 'Test feedback',
        location: {
          place_name: 'Test Location',
          lon: -71.05,
          lat: 42.35
        },
        received_at: '2025-07-28T14:10:30.123Z',
        created_at: '2025-07-28T14:10:25.000Z',
        updated_at: '2025-07-28T14:10:30.123Z'
      };

      const { httpRequest } = setupHttpRequest({
        json: async () => mockItem
      });

      const result = await new FeedbackTool({ httpRequest }).run({
        operation: 'get',
        feedback_id: mockItem.id,
        format: 'json_string'
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].type).toBe('text');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toEqual(mockItem);
    });

    it('returns error when feedback_id is missing for get operation', async () => {
      const { httpRequest } = setupHttpRequest();

      // With discriminated union, schema validation will fail before reaching execute
      const result = await new FeedbackTool({ httpRequest }).run({
        operation: 'get'
        // feedback_id is missing
      } as any);

      expect(result.isError).toBe(true);
      // Zod validation error message
      expect(result.content[0].text).toContain('Required');
      expect(result.content[0].text).toContain('feedback_id');
    });
  });

  describe('error handling', () => {
    it('handles HTTP errors gracefully', async () => {
      const { httpRequest } = setupHttpRequest({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => 'Feedback not found'
      });

      const result = await new FeedbackTool({ httpRequest }).run({
        operation: 'list'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to list feedback');
      expect(result.content[0].text).toContain('404');
      expect(result.content[0].text).toContain('Not Found');
    });

    it('handles invalid response schema gracefully', async () => {
      const { httpRequest } = setupHttpRequest({
        json: async () => ({
          invalid: 'response'
        })
      });

      const result = await new FeedbackTool({ httpRequest }).run({
        operation: 'list'
      });

      // Should still return a result (graceful fallback)
      expect(result.isError).toBe(false);
    });
  });

  describe('input validation', () => {
    it('validates feedback_id format for get operation', async () => {
      const { httpRequest } = setupHttpRequest();

      const tool = new FeedbackTool({ httpRequest });

      // Invalid UUID format
      const result = await tool.run({
        operation: 'get',
        feedback_id: 'not-a-valid-uuid'
      } as any);

      // Should fail validation
      expect(result.isError).toBe(true);
    });

    it('validates ISO 8601 date format', async () => {
      const { httpRequest } = setupHttpRequest();

      const tool = new FeedbackTool({ httpRequest });

      // Invalid date format
      const result = await tool.run({
        operation: 'list',
        created_after: '2025-07-01' // Missing time component
      } as any);

      // Should fail validation
      expect(result.isError).toBe(true);
    });

    it('validates limit constraints', async () => {
      const { httpRequest } = setupHttpRequest();

      const tool = new FeedbackTool({ httpRequest });

      // Limit too high
      const result = await tool.run({
        operation: 'list',
        limit: 2000 // Max is 1000
      } as any);

      // Should fail validation
      expect(result.isError).toBe(true);
    });

    it('validates status enum values', async () => {
      const { httpRequest } = setupHttpRequest();

      const tool = new FeedbackTool({ httpRequest });

      // Invalid status
      const result = await tool.run({
        operation: 'list',
        status: ['invalid_status']
      } as any);

      // Should fail validation
      expect(result.isError).toBe(true);
    });
  });
});
