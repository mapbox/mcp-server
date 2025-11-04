// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  setupHttpRequest,
  assertHeadersSent
} from '../../utils/httpPipelineUtils.js';
import { FeedbackGetTool } from '../../../src/tools/feedback-get-tool/FeedbackGetTool.js';

describe('FeedbackGetTool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends custom header', async () => {
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

    await new FeedbackGetTool({ httpRequest }).run({
      feedback_id: feedbackId
    });

    assertHeadersSent(mockHttpRequest);
  });

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

    await new FeedbackGetTool({ httpRequest }).run({
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
        place_name: 'Financial District, Boston, Massachusetts, United States',
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

    const result = await new FeedbackGetTool({ httpRequest }).run({
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

    const result = await new FeedbackGetTool({ httpRequest }).run({
      feedback_id: mockItem.id,
      format: 'json_string'
    });

    expect(result.isError).toBe(false);
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual(mockItem);
  });

  it('handles HTTP errors gracefully', async () => {
    const { httpRequest } = setupHttpRequest({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: async () => 'Feedback not found'
    });

    const result = await new FeedbackGetTool({ httpRequest }).run({
      feedback_id: '40eae4c7-b157-4b49-a091-7e1099bba77e'
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Failed to get feedback');
    expect(result.content[0].text).toContain('404');
    expect(result.content[0].text).toContain('Not Found');
  });

  it('handles invalid response schema gracefully', async () => {
    const { httpRequest } = setupHttpRequest({
      json: async () => ({
        invalid: 'response'
      })
    });

    const result = await new FeedbackGetTool({ httpRequest }).run({
      feedback_id: '40eae4c7-b157-4b49-a091-7e1099bba77e'
    });

    // Should still return a result (graceful fallback) - may be error or success depending on schema validation
    // The important thing is it doesn't crash
    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);
  });

  it('validates feedback_id format', async () => {
    const { httpRequest } = setupHttpRequest();

    const tool = new FeedbackGetTool({ httpRequest });

    // Invalid UUID format
    const result = await tool.run({
      feedback_id: 'not-a-valid-uuid'
    } as any);

    // Should fail validation
    expect(result.isError).toBe(true);
  });

  it('requires feedback_id', async () => {
    const { httpRequest } = setupHttpRequest();

    const tool = new FeedbackGetTool({ httpRequest });

    // Missing feedback_id
    const result = await tool.run({} as any);

    // Should fail validation
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Required');
    expect(result.content[0].text).toContain('feedback_id');
  });
});
