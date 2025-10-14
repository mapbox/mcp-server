// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import { HttpPipeline, UserAgentPolicy } from '../../src/utils/httpPipeline.js';

export function setupHttpRequest(overrides?: Partial<Response>) {
  const mockHttpRequest = vi.fn();
  mockHttpRequest.mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({ success: true }),
    arrayBuffer: async () => new ArrayBuffer(0),
    ...overrides
  });

  // Build a real pipeline with UserAgentPolicy
  const userAgent = 'TestServer/1.0.0 (default, no-tag, abcdef)';
  const pipeline = new HttpPipeline(mockHttpRequest);
  pipeline.usePolicy(new UserAgentPolicy(userAgent));

  return { httpRequest: pipeline.execute.bind(pipeline), mockHttpRequest };
}

export function assertHeadersSent(mockFetch: Mock) {
  expect(mockFetch).toHaveBeenCalledTimes(1);
  const callArgs = mockFetch.mock.calls[0];
  const requestInit = callArgs[1];
  expect(requestInit?.headers).toMatchObject({
    'User-Agent': expect.any(String)
  });
}
