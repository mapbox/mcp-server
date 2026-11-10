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
import { ReportTool } from '../../../src/tools/report-tool/ReportTool.js';
import { getVersionInfo } from '../../../src/utils/versionUtils.js';

const input = {
  feedback: 'directions_tool picked a route through a closed bridge.',
  category: 'wrong_result'
};

const createdItem = {
  id: '8b1eec47-a3f2-4a6d-a2d9-5e8c1f4a9b0c',
  status: 'received',
  category: 'wrong_result',
  feedback: input.feedback,
  received_at: '2026-11-10T14:10:30.123Z'
};

function jsonResponse(status: number, body: unknown): Partial<Response> {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 401 ? 'Unauthorized' : 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

function setupReportApi(post: { status?: number; body?: unknown } = {}) {
  const { httpRequest, mockHttpRequest } = setupHttpRequest();
  mockHttpRequest.mockImplementation(async () =>
    jsonResponse(post.status ?? 200, post.body ?? createdItem)
  );
  return { httpRequest, mockHttpRequest };
}

const sentBody = (mock: Mock) =>
  JSON.parse(mock.mock.calls[0][1].body as string) as Record<string, unknown>;
const textOf = (result: { content: unknown[] }) =>
  (result.content[0] as { text: string }).text;

function createMockServer(options: {
  elicitation?: boolean;
  elicitResult?: { action: string; content?: Record<string, unknown> };
  elicitError?: Error;
  clientInfo?: { name: string; version: string };
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
      getClientVersion: vi.fn().mockReturnValue(options.clientInfo),
      elicitInput,
      sendLoggingMessage: vi.fn()
    },
    registerTool: vi.fn()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('ReportTool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends custom header', async () => {
    const { httpRequest, mockHttpRequest } = setupReportApi();

    await new ReportTool({ httpRequest }).run(input);

    assertHeadersSent(mockHttpRequest);
  });

  it('POSTs to the cli-feedback endpoint with 0, 0 when there is no place', async () => {
    const { httpRequest, mockHttpRequest } = setupReportApi();

    const result = await new ReportTool({ httpRequest }).run(input);

    const [url, init] = mockHttpRequest.mock.calls[0];
    expect(url).toContain('/user-feedback/v1/cli-feedback?');
    expect(url).toContain('access_token=');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
    const body = sentBody(mockHttpRequest);
    expect(body).toMatchObject({ category: 'wrong_result', lat: 0, lon: 0 });
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.isError).toBe(false);
    expect(textOf(result)).toContain(createdItem.id);
    expect(result.structuredContent).toMatchObject({ id: createdItem.id });
  });

  it('appends the server version, client and tool to the text', async () => {
    const { httpRequest, mockHttpRequest } = setupReportApi();
    const tool = new ReportTool({ httpRequest });
    tool.installTo(
      createMockServer({
        clientInfo: { name: 'claude-ai', version: '0.1.0' }
      })
    );

    await tool.run({ ...input, tool_name: 'directions_tool' });

    expect(sentBody(mockHttpRequest).feedback).toBe(
      `${input.feedback}\n\n— mapbox-mcp-server ${getVersionInfo().version} via claude-ai 0.1.0, about directions_tool`
    );
  });

  it('sends the place for data quality feedback', async () => {
    const { httpRequest, mockHttpRequest } = setupReportApi();

    await new ReportTool({ httpRequest }).run({
      feedback: 'Blue Bottle Coffee at 66 Mint St has closed.',
      category: 'data_quality',
      coordinates: { longitude: -122.4057, latitude: 37.7825 }
    });

    expect(sentBody(mockHttpRequest)).toMatchObject({
      category: 'data_quality',
      lat: 37.7825,
      lon: -122.4057
    });
  });

  it('returns an error when the API rejects the report', async () => {
    const { httpRequest } = setupReportApi({
      status: 401,
      body: { message: 'Not Authorized - Invalid Token' }
    });

    const result = await new ReportTool({ httpRequest }).run(input);

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain('401');
  });

  it('still succeeds when the response body is unexpected', async () => {
    const { httpRequest, mockHttpRequest } = setupReportApi({ body: 'ok' });

    const result = await new ReportTool({ httpRequest }).run(input);

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({
      id: sentBody(mockHttpRequest).id,
      category: 'wrong_result'
    });
  });

  it('rejects an unknown category', async () => {
    const { httpRequest, mockHttpRequest } = setupReportApi();

    const result = await new ReportTool({ httpRequest }).run({
      ...input,
      category: 'poi_closed'
    });

    expect(result.isError).toBe(true);
    expect(mockHttpRequest).not.toHaveBeenCalled();
  });

  describe('confirmation through elicitation', () => {
    it('asks first and sends when the user confirms', async () => {
      const { httpRequest, mockHttpRequest } = setupReportApi();
      const tool = new ReportTool({ httpRequest });
      const mockServer = createMockServer({ elicitation: true });
      tool.installTo(mockServer);

      await tool.run({ ...input, tool_name: 'directions_tool' });

      const request = mockServer.server.elicitInput.mock.calls[0][0];
      expect(request.mode).toBe('form');
      expect(request.message).toContain(input.feedback);
      expect(request.message).toContain('wrong_result');
      expect(request.message).toContain('directions_tool');
      expect(mockHttpRequest).toHaveBeenCalledOnce();
    });

    it.each([
      ['declines', { action: 'decline' }],
      ['unticks send', { action: 'accept', content: { send: false } }]
    ])('sends nothing when the user %s', async (_label, elicitResult) => {
      const { httpRequest, mockHttpRequest } = setupReportApi();
      const tool = new ReportTool({ httpRequest });
      tool.installTo(createMockServer({ elicitation: true, elicitResult }));

      const result = await tool.run(input);

      expect(mockHttpRequest).not.toHaveBeenCalled();
      expect(textOf(result)).toContain('nothing was sent');
    });

    it('sends nothing when the prompt fails', async () => {
      const { httpRequest, mockHttpRequest } = setupReportApi();
      const tool = new ReportTool({ httpRequest });
      tool.installTo(
        createMockServer({
          elicitation: true,
          elicitError: new Error('timed out')
        })
      );

      await tool.run(input);

      expect(mockHttpRequest).not.toHaveBeenCalled();
    });
  });
});
