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

const input = {
  feedback: 'Blue Bottle Coffee at 66 Mint St has closed permanently.',
  category: 'poi_closed',
  coordinates: { longitude: -122.4057, latitude: 37.7825 }
};

const createdItem = {
  id: '8b1eec47-a3f2-4a6d-a2d9-5e8c1f4a9b0c',
  status: 'received',
  category: 'poi_closed',
  feedback: input.feedback,
  location: {
    place_name: '66 Mint St, San Francisco, California, United States',
    lon: -122.4057,
    lat: 37.7825
  },
  received_at: '2026-10-19T14:10:30.123Z',
  created_at: '2026-10-19T14:10:25.000Z',
  updated_at: '2026-10-19T14:10:30.123Z'
};

function createMockServer(options: {
  elicitation?: boolean;
  elicitResult?: { action: string; content?: Record<string, unknown> };
  elicitError?: Error;
}) {
  const elicitInput = options.elicitError
    ? vi.fn().mockRejectedValue(options.elicitError)
    : vi
        .fn()
        .mockResolvedValue(
          options.elicitResult ?? { action: 'accept', content: { send: true } }
        );
  return {
    server: {
      getClientCapabilities: vi
        .fn()
        .mockReturnValue(options.elicitation ? { elicitation: {} } : {}),
      elicitInput,
      sendLoggingMessage: vi.fn()
    },
    registerTool: vi.fn()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('FeedbackTool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends custom header', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      json: async () => createdItem
    });

    await new FeedbackTool({ httpRequest }).run(input);

    assertHeadersSent(mockHttpRequest);
  });

  it('POSTs the report as JSON with lat/lon and a generated id', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      json: async () => createdItem
    });

    const result = await new FeedbackTool({ httpRequest }).run(input);

    expect(result.isError).toBe(false);
    const [url, init] = mockHttpRequest.mock.calls[0];
    const parsedUrl = new URL(url as string);
    expect(parsedUrl.pathname).toBe('/user-feedback/v1/feedback');
    expect(parsedUrl.searchParams.get('access_token')).toBe(
      process.env.MAPBOX_ACCESS_TOKEN
    );
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      id: expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      ),
      feedback: input.feedback,
      category: 'poi_closed',
      lat: 37.7825,
      lon: -122.4057
    });
  });

  it('uses a new id for each call', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      json: async () => createdItem
    });
    const tool = new FeedbackTool({ httpRequest });

    await tool.run(input);
    await tool.run(input);

    const ids = mockHttpRequest.mock.calls.map(
      ([, init]) => JSON.parse(init.body).id
    );
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('returns the created item as structured content', async () => {
    const { httpRequest } = setupHttpRequest({
      json: async () => createdItem
    });

    const result = await new FeedbackTool({ httpRequest }).run(input);

    expect(result.structuredContent).toEqual(createdItem);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain(createdItem.id);
    expect(text).toContain('received');
  });

  it('still reports success when the response body is unexpected', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest({
      json: async () => ({ unexpected: true })
    });

    const result = await new FeedbackTool({ httpRequest }).run(input);

    expect(result.isError).toBe(false);
    const sentId = JSON.parse(mockHttpRequest.mock.calls[0][1].body).id;
    expect(result.structuredContent).toMatchObject({
      id: sentId,
      status: 'received',
      category: 'poi_closed',
      location: { lon: -122.4057, lat: 37.7825 }
    });
  });

  it('explains the missing scope on 401 and 403', async () => {
    for (const status of [401, 403]) {
      const { httpRequest } = setupHttpRequest({
        ok: false,
        status,
        statusText: 'Forbidden',
        text: async () => JSON.stringify({ message: 'Not Authorized' })
      });

      const result = await new FeedbackTool({ httpRequest }).run(input);

      expect(result.isError).toBe(true);
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain(`${status}: Not Authorized`);
      expect(text).toContain('user-feedback:write');
    }
  });

  it('returns other API errors without the scope hint', async () => {
    const { httpRequest } = setupHttpRequest({
      ok: false,
      status: 422,
      statusText: 'Unprocessable Entity',
      text: async () => JSON.stringify({ message: 'Invalid category' })
    });

    const result = await new FeedbackTool({ httpRequest }).run(input);

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toContain('422: Invalid category');
    expect(text).not.toContain('user-feedback:write');
  });

  it('rejects an unknown category and empty feedback', async () => {
    const { httpRequest, mockHttpRequest } = setupHttpRequest();
    const tool = new FeedbackTool({ httpRequest });

    const badCategory = await tool.run({ ...input, category: 'non_feedback' });
    const empty = await tool.run({ ...input, feedback: '   ' });

    expect(badCategory.isError).toBe(true);
    expect(empty.isError).toBe(true);
    expect(mockHttpRequest).not.toHaveBeenCalled();
  });

  it('is marked as a write tool', () => {
    const { httpRequest } = setupHttpRequest();
    const tool = new FeedbackTool({ httpRequest });

    expect(tool.annotations.readOnlyHint).toBe(false);
    expect(tool.annotations.destructiveHint).toBe(false);
    expect(tool.annotations.idempotentHint).toBe(false);
    expect(tool.annotations.openWorldHint).toBe(true);
  });

  describe('confirmation through elicitation', () => {
    it('asks first and sends when the user confirms', async () => {
      const { httpRequest, mockHttpRequest } = setupHttpRequest({
        json: async () => createdItem
      });
      const tool = new FeedbackTool({ httpRequest });
      const mockServer = createMockServer({ elicitation: true });
      tool.installTo(mockServer);

      const result = await tool.run(input);

      expect(mockServer.server.elicitInput).toHaveBeenCalledOnce();
      const request = mockServer.server.elicitInput.mock.calls[0][0];
      expect(request.mode).toBe('form');
      expect(request.message).toContain(input.feedback);
      expect(request.message).toContain('poi_closed');
      expect(request.message).toContain('37.7825, -122.4057');
      expect(mockHttpRequest).toHaveBeenCalledOnce();
      expect(result.isError).toBe(false);
    });

    it.each([
      ['declines', { action: 'decline' }],
      ['cancels', { action: 'cancel' }],
      ['unticks send', { action: 'accept', content: { send: false } }]
    ])('sends nothing when the user %s', async (_label, elicitResult) => {
      const { httpRequest, mockHttpRequest } = setupHttpRequest();
      const tool = new FeedbackTool({ httpRequest });
      tool.installTo(createMockServer({ elicitation: true, elicitResult }));

      const result = await tool.run(input);

      expect(mockHttpRequest).not.toHaveBeenCalled();
      expect(result.isError).toBe(false);
      expect((result.content[0] as { text: string }).text).toContain(
        'nothing was sent'
      );
    });

    it('sends nothing when the prompt fails', async () => {
      const { httpRequest, mockHttpRequest } = setupHttpRequest();
      const tool = new FeedbackTool({ httpRequest });
      tool.installTo(
        createMockServer({
          elicitation: true,
          elicitError: new Error('timed out')
        })
      );

      await tool.run(input);

      expect(mockHttpRequest).not.toHaveBeenCalled();
    });

    it('sends without asking when the client has no elicitation', async () => {
      const { httpRequest, mockHttpRequest } = setupHttpRequest({
        json: async () => createdItem
      });
      const tool = new FeedbackTool({ httpRequest });
      const mockServer = createMockServer({ elicitation: false });
      tool.installTo(mockServer);

      await tool.run(input);

      expect(mockServer.server.elicitInput).not.toHaveBeenCalled();
      expect(mockHttpRequest).toHaveBeenCalledOnce();
    });
  });
});
