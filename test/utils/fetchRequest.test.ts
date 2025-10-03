// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

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
  return vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => {
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
      pipeline.usePolicy(new RetryPolicy(3, 1, 10)); // Use small delays for test speed

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
      pipeline.usePolicy(new RetryPolicy(3, 1, 10));

      const response = await pipeline.fetch('http://test', {});

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(response.status).toBe(200);
      expect(response.ok).toBe(true);
    });

    it('does not retry on 400 errors', async () => {
      const mockFetch = createMockFetch([{ status: 400 }]);
      const pipeline = new PolicyPipeline(mockFetch);
      pipeline.usePolicy(new RetryPolicy(3, 1, 10));

      const response = await pipeline.fetch('http://test', {});

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(400);
    });

    it('returns immediately on first success', async () => {
      const mockFetch = createMockFetch([{ status: 200, ok: true }]);
      const pipeline = new PolicyPipeline(mockFetch);
      pipeline.usePolicy(new RetryPolicy(3, 1, 10));

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
      pipeline.usePolicy(new UserAgentPolicy('TestAgent/1.0'));

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
      pipeline.usePolicy(new UserAgentPolicy('TestAgent/1.0'));

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
      pipeline.usePolicy(new UserAgentPolicy('TestAgent/1.0'));

      const headers = new Headers();
      await pipeline.fetch('http://test', { headers });

      expect(headers.get('User-Agent')).toBe('TestAgent/1.0');
    });
  });

  describe('Policy Management', () => {
    it('can add and list policies', () => {
      const mockFetch = vi.fn();
      const pipeline = new PolicyPipeline(mockFetch as unknown as typeof fetch);

      const userAgentPolicy = new UserAgentPolicy(
        'TestAgent/1.0',
        'user-agent-test'
      );
      const retryPolicy = new RetryPolicy(3, 100, 1000, 'retry-test');

      pipeline.usePolicy(userAgentPolicy);
      pipeline.usePolicy(retryPolicy);

      const policies = pipeline.listPolicies();
      expect(policies).toHaveLength(2);
      expect(policies[0].id).toBe('user-agent-test');
      expect(policies[1].id).toBe('retry-test');
    });

    it('can find policy by ID', () => {
      const mockFetch = vi.fn();
      const pipeline = new PolicyPipeline(mockFetch as unknown as typeof fetch);

      const userAgentPolicy = new UserAgentPolicy(
        'TestAgent/1.0',
        'user-agent-test'
      );
      pipeline.usePolicy(userAgentPolicy);

      const foundPolicy = pipeline.findPolicyById('user-agent-test');
      expect(foundPolicy).toBe(userAgentPolicy);

      const notFoundPolicy = pipeline.findPolicyById('non-existent');
      expect(notFoundPolicy).toBeUndefined();
    });

    it('can remove policy by ID', () => {
      const mockFetch = vi.fn();
      const pipeline = new PolicyPipeline(mockFetch as unknown as typeof fetch);

      const userAgentPolicy = new UserAgentPolicy(
        'TestAgent/1.0',
        'user-agent-test'
      );
      const retryPolicy = new RetryPolicy(3, 100, 1000, 'retry-test');

      pipeline.usePolicy(userAgentPolicy);
      pipeline.usePolicy(retryPolicy);

      expect(pipeline.listPolicies()).toHaveLength(2);

      pipeline.removePolicy('user-agent-test');

      const policies = pipeline.listPolicies();
      expect(policies).toHaveLength(1);
      expect(policies[0].id).toBe('retry-test');
    });

    it('can remove policy by reference', () => {
      const mockFetch = vi.fn();
      const pipeline = new PolicyPipeline(mockFetch as unknown as typeof fetch);

      const userAgentPolicy = new UserAgentPolicy(
        'TestAgent/1.0',
        'user-agent-test'
      );
      const retryPolicy = new RetryPolicy(3, 100, 1000, 'retry-test');

      pipeline.usePolicy(userAgentPolicy);
      pipeline.usePolicy(retryPolicy);

      expect(pipeline.listPolicies()).toHaveLength(2);

      pipeline.removePolicy(userAgentPolicy);

      const policies = pipeline.listPolicies();
      expect(policies).toHaveLength(1);
      expect(policies[0].id).toBe('retry-test');
    });

    it('generates automatic IDs for policies without explicit ID', () => {
      const userAgentPolicy = new UserAgentPolicy('TestAgent/1.0');
      const retryPolicy = new RetryPolicy(3, 100, 1000);

      expect(userAgentPolicy.id).toMatch(/^user-agent-\d+-[a-z0-9]+$/);
      expect(retryPolicy.id).toMatch(/^retry-\d+-[a-z0-9]+$/);
    });

    it('uses provided IDs when specified', () => {
      const userAgentPolicy = new UserAgentPolicy(
        'TestAgent/1.0',
        'custom-ua-id'
      );
      const retryPolicy = new RetryPolicy(3, 100, 1000, 'custom-retry-id');

      expect(userAgentPolicy.id).toBe('custom-ua-id');
      expect(retryPolicy.id).toBe('custom-retry-id');
    });
  });
});
