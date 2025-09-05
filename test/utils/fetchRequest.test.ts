import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  RetryPolicy,
  PolicyPipeline,
  UserAgentPolicy
} from '../../src/utils/fetchRequest.js';
import type { Mock } from 'vitest';

function createMockFetch(
  responses: Array<{ status: number; ok?: boolean }>
): typeof fetch {
  let call = 0;
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const res = responses[Math.min(call, responses.length - 1)];
    call++;
    return {
      ok: res.ok ?? res.status < 400,
      status: res.status,
      statusText: `Status ${res.status}`,
      json: async () => ({ status: res.status })
    } as Response;
  }) as typeof fetch;
}

describe('PolicyPipeline', () => {
  describe('RetryPolicy', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('retries on 500 and returns last response after max retries', async () => {
      const mockFetch = createMockFetch([
        { status: 500 },
        { status: 500 },
        { status: 500 },
        { status: 500 }
      ]);
      const pipeline = new PolicyPipeline(mockFetch);
      pipeline.use(new RetryPolicy(3, 1, 10)); // Use small delays for test speed

      const response = await pipeline.fetch('http://test', {});

      expect(mockFetch).toHaveBeenCalledTimes(4);
      expect(response.status).toBe(500);
    });

    it('retries on 429 and succeeds if later response is ok', async () => {
      const mockFetch = createMockFetch([
        { status: 429 },
        { status: 429 },
        { status: 200, ok: true }
      ]);
      const pipeline = new PolicyPipeline(mockFetch);
      pipeline.use(new RetryPolicy(3, 1, 10));

      const response = await pipeline.fetch('http://test', {});

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(response.status).toBe(200);
      expect(response.ok).toBe(true);
    });

    it('does not retry on 400 errors', async () => {
      const mockFetch = createMockFetch([{ status: 400 }]);
      const pipeline = new PolicyPipeline(mockFetch);
      pipeline.use(new RetryPolicy(3, 1, 10));

      const response = await pipeline.fetch('http://test', {});

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(400);
    });

    it('returns immediately on first success', async () => {
      const mockFetch = createMockFetch([{ status: 200, ok: true }]);
      const pipeline = new PolicyPipeline(mockFetch);
      pipeline.use(new RetryPolicy(3, 1, 10));

      const response = await pipeline.fetch('http://test', {});

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(200);
      expect(response.ok).toBe(true);
    });
  });

  describe('UserAgentPolicy', () => {
    it('sets the User-Agent header if not present', async () => {
      const mockFetch = vi.fn(
        async (input: string | URL | Request, init?: RequestInit) => {
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({}),
            headers: init?.headers
          } as Response;
        }
      ) as Mock;

      const pipeline = new PolicyPipeline(mockFetch as unknown as typeof fetch);
      pipeline.use(new UserAgentPolicy('TestAgent/1.0'));

      await pipeline.fetch('http://test', {});

      const headers = mockFetch.mock.calls[0][1]?.headers as Record<
        string,
        string
      >;
      expect(headers['User-Agent']).toBe('TestAgent/1.0');
    });

    it('does not overwrite an existing User-Agent header', async () => {
      const mockFetch = vi.fn(
        async (input: string | URL | Request, init?: RequestInit) => {
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({}),
            headers: init?.headers
          } as Response;
        }
      ) as Mock;

      const pipeline = new PolicyPipeline(mockFetch as unknown as typeof fetch);
      pipeline.use(new UserAgentPolicy('TestAgent/1.0'));

      await pipeline.fetch('http://test', {
        headers: {
          'User-Agent': 'CustomAgent/2.0'
        }
      });

      const headers = mockFetch.mock.calls[0][1]?.headers as Record<
        string,
        string
      >;
      expect(headers['User-Agent']).toBe('CustomAgent/2.0');
    });

    it('works with headers as Headers object', async () => {
      const mockFetch = vi.fn(
        async (input: string | URL | Request, init?: RequestInit) => {
          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({}),
            headers: init?.headers
          } as Response;
        }
      ) as Mock;

      const pipeline = new PolicyPipeline(mockFetch as unknown as typeof fetch);
      pipeline.use(new UserAgentPolicy('TestAgent/1.0'));

      const headers = new Headers();
      await pipeline.fetch('http://test', { headers });

      expect(headers.get('User-Agent')).toBe('TestAgent/1.0');
    });
  });
});
