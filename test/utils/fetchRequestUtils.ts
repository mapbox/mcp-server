import { expect, vi } from 'vitest';
import type { Mock } from 'vitest';

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

  // Example: User-Agent policy
  const userAgent = 'TestServer/1.0.0 (default, no-tag, abcdef)';
  function fetchWithPolicy(
    input: string | URL | Request,
    init: RequestInit = {}
  ) {
    const headers = { ...(init.headers || {}), 'User-Agent': userAgent };
    return mockFetch(input, { ...init, headers });
  }

  return { fetch: fetchWithPolicy, mockFetch };
}

export function assertHeadersSent(mockFetch: Mock) {
  expect(mockFetch).toHaveBeenCalledTimes(1);
  const callArgs = mockFetch.mock.calls[0];
  const requestInit = callArgs[1];
  expect(requestInit?.headers).toMatchObject({
    'User-Agent': expect.any(String)
  });
}
