// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

process.env.MAPBOX_ACCESS_TOKEN =
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature';

import { describe, it, expect, afterEach, vi } from 'vitest';
import type { Mock } from 'vitest';
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

/** An earlier report from the same account, offset from `input` by `dLat` degrees. */
function earlierReport(dLat: number, overrides: Record<string, unknown> = {}) {
  return {
    ...createdItem,
    id: '06f2c4f0-862a-483e-9961-e444dfbda4cb',
    feedback: 'Blue Bottle on Mint St is closed',
    location: { lon: -122.4057, lat: 37.7825 + dLat },
    created_at: '2026-10-10T09:00:00.000Z',
    ...overrides
  };
}

function jsonResponse(status: number, body: unknown): Partial<Response> {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 403 ? 'Forbidden' : 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

/**
 * Fakes the two Feedback API calls the tool makes: the GET that lists the
 * account's earlier reports, then the POST that sends the new one.
 */
function setupFeedbackApi(
  options: {
    list?: { status?: number; items?: unknown[] } | Error;
    post?: { status?: number; body?: unknown };
  } = {}
) {
  const { httpRequest, mockHttpRequest } = setupHttpRequest();
  mockHttpRequest.mockImplementation(
    async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        const post = options.post ?? {};
        return jsonResponse(post.status ?? 200, post.body ?? createdItem);
      }
      if (options.list instanceof Error) throw options.list;
      const list = options.list ?? {};
      return jsonResponse(list.status ?? 200, {
        items: list.items ?? [],
        has_before: false,
        has_after: false,
        start_cursor: '',
        end_cursor: ''
      });
    }
  );
  return { httpRequest, mockHttpRequest };
}

const postCalls = (mock: Mock) =>
  mock.mock.calls.filter(([, init]) => init?.method === 'POST');
const listCalls = (mock: Mock) =>
  mock.mock.calls.filter(([, init]) => init?.method !== 'POST');
const textOf = (result: { content: unknown[] }) =>
  (result.content[0] as { text: string }).text;

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
    vi.useRealTimers();
  });

  it('sends custom header', async () => {
    const { httpRequest, mockHttpRequest } = setupFeedbackApi();

    await new FeedbackTool({ httpRequest }).run(input);

    assertHeadersSent(mockHttpRequest, { callIndex: 0, expectedCalls: 2 });
    assertHeadersSent(mockHttpRequest, { callIndex: 1, expectedCalls: 2 });
  });

  it('POSTs the report as JSON with lat/lon and a generated id', async () => {
    const { httpRequest, mockHttpRequest } = setupFeedbackApi();

    const result = await new FeedbackTool({ httpRequest }).run(input);

    expect(result.isError).toBe(false);
    const [[url, init]] = postCalls(mockHttpRequest);
    const parsedUrl = new URL(url as string);
    expect(parsedUrl.pathname).toBe('/user-feedback/v1/feedback');
    expect(parsedUrl.searchParams.get('access_token')).toBe(
      process.env.MAPBOX_ACCESS_TOKEN
    );
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body)).toEqual({
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
    const { httpRequest, mockHttpRequest } = setupFeedbackApi();
    const tool = new FeedbackTool({ httpRequest });

    await tool.run(input);
    await tool.run(input);

    const ids = postCalls(mockHttpRequest).map(
      ([, init]) => JSON.parse(init.body).id
    );
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('returns the created item as structured content', async () => {
    const { httpRequest } = setupFeedbackApi();

    const result = await new FeedbackTool({ httpRequest }).run(input);

    expect(result.structuredContent).toEqual(createdItem);
    expect(textOf(result)).toContain(createdItem.id);
    expect(textOf(result)).toContain('received');
    expect(textOf(result)).not.toContain('not checked');
  });

  it('still reports success when the response body is unexpected', async () => {
    const { httpRequest, mockHttpRequest } = setupFeedbackApi({
      post: { body: { unexpected: true } }
    });

    const result = await new FeedbackTool({ httpRequest }).run(input);

    expect(result.isError).toBe(false);
    const sentId = JSON.parse(postCalls(mockHttpRequest)[0][1].body).id;
    expect(result.structuredContent).toMatchObject({
      id: sentId,
      status: 'received',
      category: 'poi_closed',
      location: { lon: -122.4057, lat: 37.7825 }
    });
  });

  it('explains the missing write scope on 401 and 403', async () => {
    for (const status of [401, 403]) {
      const { httpRequest } = setupFeedbackApi({
        post: { status, body: { message: 'Not Authorized' } }
      });

      const result = await new FeedbackTool({ httpRequest }).run(input);

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain(`${status}: Not Authorized`);
      expect(textOf(result)).toContain('user-feedback:write');
    }
  });

  it('returns other API errors without the scope hint', async () => {
    const { httpRequest } = setupFeedbackApi({
      post: { status: 422, body: { message: 'Invalid category' } }
    });

    const result = await new FeedbackTool({ httpRequest }).run(input);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('422: Invalid category');
    expect(textOf(result)).not.toContain('user-feedback:write');
  });

  it('rejects an unknown category and empty feedback', async () => {
    const { httpRequest, mockHttpRequest } = setupFeedbackApi();
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

  describe('check for an earlier report', () => {
    it('lists recent reports in the same category still awaiting review', async () => {
      vi.useFakeTimers({ now: new Date('2026-10-19T12:00:00.000Z') });
      const { httpRequest, mockHttpRequest } = setupFeedbackApi();

      await new FeedbackTool({ httpRequest }).run(input);

      const [[url]] = listCalls(mockHttpRequest);
      const parsed = new URL(url as string);
      expect(parsed.pathname).toBe('/user-feedback/v1/feedback');
      expect(parsed.searchParams.get('category')).toBe('poi_closed');
      expect(parsed.searchParams.get('status')).toBe('received');
      expect(parsed.searchParams.get('created_after')).toBe(
        '2026-09-19T12:00:00.000Z'
      );
      expect(parsed.searchParams.get('sort_by')).toBe('created_at');
      expect(parsed.searchParams.get('order')).toBe('desc');
      expect(parsed.searchParams.get('limit')).toBe('200');
      // The check runs before the POST.
      expect(mockHttpRequest.mock.calls[0][1]?.method).not.toBe('POST');
    });

    it('does not send when a matching report is within 50 m', async () => {
      // 0.0003° of latitude is about 33 m.
      const earlier = earlierReport(0.0003);
      const { httpRequest, mockHttpRequest } = setupFeedbackApi({
        list: { items: [earlier] }
      });

      const result = await new FeedbackTool({ httpRequest }).run(input);

      expect(postCalls(mockHttpRequest)).toHaveLength(0);
      expect(result.isError).toBe(false);
      expect(result.structuredContent).toMatchObject({
        id: earlier.id,
        duplicate: true
      });
      expect(textOf(result)).toContain(`report ${earlier.id}`);
      expect(textOf(result)).toContain(earlier.feedback);
      expect(textOf(result)).toContain('send_anyway');
    });

    it('sends when the earlier reports are farther than 50 m', async () => {
      // 0.001° of latitude is about 111 m.
      const { httpRequest, mockHttpRequest } = setupFeedbackApi({
        list: { items: [earlierReport(0.001)] }
      });

      const result = await new FeedbackTool({ httpRequest }).run(input);

      expect(postCalls(mockHttpRequest)).toHaveLength(1);
      expect(result.structuredContent).not.toHaveProperty('duplicate');
    });

    it('skips listed items it cannot read', async () => {
      const { httpRequest, mockHttpRequest } = setupFeedbackApi({
        list: {
          items: [{ id: 'x' }, earlierReport(0, { location: undefined })]
        }
      });

      await new FeedbackTool({ httpRequest }).run(input);

      expect(postCalls(mockHttpRequest)).toHaveLength(1);
    });

    it('skips the check with send_anyway', async () => {
      const { httpRequest, mockHttpRequest } = setupFeedbackApi({
        list: { items: [earlierReport(0)] }
      });

      const result = await new FeedbackTool({ httpRequest }).run({
        ...input,
        send_anyway: true
      });

      expect(listCalls(mockHttpRequest)).toHaveLength(0);
      expect(postCalls(mockHttpRequest)).toHaveLength(1);
      expect(textOf(result)).not.toContain('not checked');
    });

    it('sends unchecked, and says why, when the token lacks the read scope', async () => {
      const { httpRequest, mockHttpRequest } = setupFeedbackApi({
        list: { status: 403 }
      });

      const result = await new FeedbackTool({ httpRequest }).run(input);

      expect(postCalls(mockHttpRequest)).toHaveLength(1);
      expect(result.isError).toBe(false);
      expect(textOf(result)).toContain('not checked for duplicates');
      expect(textOf(result)).toContain('user-feedback:read');
    });

    it('sends unchecked when the list call fails', async () => {
      const { httpRequest, mockHttpRequest } = setupFeedbackApi({
        list: new Error('socket hang up')
      });

      const result = await new FeedbackTool({ httpRequest }).run(input);

      expect(postCalls(mockHttpRequest)).toHaveLength(1);
      expect(textOf(result)).toContain('could not be reached');
    });

    it('does not ask the user to confirm a report it will not send', async () => {
      const { httpRequest } = setupFeedbackApi({
        list: { items: [earlierReport(0)] }
      });
      const tool = new FeedbackTool({ httpRequest });
      const mockServer = createMockServer({ elicitation: true });
      tool.installTo(mockServer);

      await tool.run(input);

      expect(mockServer.server.elicitInput).not.toHaveBeenCalled();
    });
  });

  describe('confirmation through elicitation', () => {
    it('asks first and sends when the user confirms', async () => {
      const { httpRequest, mockHttpRequest } = setupFeedbackApi();
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
      expect(postCalls(mockHttpRequest)).toHaveLength(1);
      expect(result.isError).toBe(false);
    });

    it.each([
      ['declines', { action: 'decline' }],
      ['cancels', { action: 'cancel' }],
      ['unticks send', { action: 'accept', content: { send: false } }]
    ])('sends nothing when the user %s', async (_label, elicitResult) => {
      const { httpRequest, mockHttpRequest } = setupFeedbackApi();
      const tool = new FeedbackTool({ httpRequest });
      tool.installTo(createMockServer({ elicitation: true, elicitResult }));

      const result = await tool.run(input);

      expect(postCalls(mockHttpRequest)).toHaveLength(0);
      expect(result.isError).toBe(false);
      expect(textOf(result)).toContain('nothing was sent');
    });

    it('sends nothing when the prompt fails', async () => {
      const { httpRequest, mockHttpRequest } = setupFeedbackApi();
      const tool = new FeedbackTool({ httpRequest });
      tool.installTo(
        createMockServer({
          elicitation: true,
          elicitError: new Error('timed out')
        })
      );

      await tool.run(input);

      expect(postCalls(mockHttpRequest)).toHaveLength(0);
    });

    it('sends without asking when the client has no elicitation', async () => {
      const { httpRequest, mockHttpRequest } = setupFeedbackApi();
      const tool = new FeedbackTool({ httpRequest });
      const mockServer = createMockServer({ elicitation: false });
      tool.installTo(mockServer);

      await tool.run(input);

      expect(mockServer.server.elicitInput).not.toHaveBeenCalled();
      expect(postCalls(mockHttpRequest)).toHaveLength(1);
    });
  });
});
