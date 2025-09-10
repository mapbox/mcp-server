import { expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  PolicyPipeline,
  UserAgentPolicy
} from '../../src/utils/fetchRequest.js';

export function setupFetch(overrides?: any) {
  const mockFetch = vi.fn();
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({ success: true }),
    arrayBuffer: async () => new ArrayBuffer(0),
    ...overrides
  });

  // Build a real pipeline with UserAgentPolicy
  const userAgent = 'TestServer/1.0.0 (default, no-tag, abcdef)';
  const pipeline = new PolicyPipeline(mockFetch);
  pipeline.usePolicy(new UserAgentPolicy(userAgent));

  return { fetch: pipeline.fetch.bind(pipeline), mockFetch };
}

export function assertHeadersSent(mockFetch: Mock) {
  expect(mockFetch).toHaveBeenCalledTimes(1);
  const callArgs = mockFetch.mock.calls[0];
  const requestInit = callArgs[1];
  expect(requestInit?.headers).toMatchObject({
    'User-Agent': expect.any(String)
  });
}
