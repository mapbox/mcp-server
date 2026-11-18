// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  RetryPolicy,
  HttpPipeline,
  UserAgentPolicy,
  TracingPolicy
} from '../../src/utils/httpPipeline.js';
import type { Mock } from 'vitest';
import * as traceApi from '@opentelemetry/api';

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

describe('HttpPipeline', () => {
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
      const pipeline = new HttpPipeline(mockFetch);
      pipeline.usePolicy(new RetryPolicy(3, 1, 10)); // Use small delays for test speed

      const response = await pipeline.execute('http://test', {});

      expect(mockFetch).toHaveBeenCalledTimes(4);
      expect(response.status).toBe(500);
    });

    it('retries on 429 and succeeds if later response is ok', async () => {
      const mockFetch = createMockFetch([
        { status: 429 },
        { status: 429 },
        { status: 200, ok: true }
      ]);
      const pipeline = new HttpPipeline(mockFetch);
      pipeline.usePolicy(new RetryPolicy(3, 1, 10));

      const response = await pipeline.execute('http://test', {});

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(response.status).toBe(200);
      expect(response.ok).toBe(true);
    });

    it('does not retry on 400 errors', async () => {
      const mockFetch = createMockFetch([{ status: 400 }]);
      const pipeline = new HttpPipeline(mockFetch);
      pipeline.usePolicy(new RetryPolicy(3, 1, 10));

      const response = await pipeline.execute('http://test', {});

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(response.status).toBe(400);
    });

    it('returns immediately on first success', async () => {
      const mockFetch = createMockFetch([{ status: 200, ok: true }]);
      const pipeline = new HttpPipeline(mockFetch);
      pipeline.usePolicy(new RetryPolicy(3, 1, 10));

      const response = await pipeline.execute('http://test', {});

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

      const pipeline = new HttpPipeline(mockFetch as unknown as typeof fetch);
      pipeline.usePolicy(new UserAgentPolicy('TestAgent/1.0'));

      await pipeline.execute('http://test', {});

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

      const pipeline = new HttpPipeline(mockFetch as unknown as typeof fetch);
      pipeline.usePolicy(new UserAgentPolicy('TestAgent/1.0'));

      await pipeline.execute('http://test', {
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

      const pipeline = new HttpPipeline(mockFetch as unknown as typeof fetch);
      pipeline.usePolicy(new UserAgentPolicy('TestAgent/1.0'));

      const headers = new Headers();
      await pipeline.execute('http://test', { headers });

      expect(headers.get('User-Agent')).toBe('TestAgent/1.0');
    });
  });

  describe('Policy Management', () => {
    it('can add and list policies', () => {
      const mockFetch = vi.fn();
      const pipeline = new HttpPipeline(mockFetch as unknown as typeof fetch);

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
      const pipeline = new HttpPipeline(mockFetch as unknown as typeof fetch);

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
      const pipeline = new HttpPipeline(mockFetch as unknown as typeof fetch);

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
      const pipeline = new HttpPipeline(mockFetch as unknown as typeof fetch);

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

  describe('TracingPolicy', () => {
    let mockSpan: {
      setAttribute: Mock;
    };

    beforeEach(() => {
      mockSpan = {
        setAttribute: vi.fn()
      };
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('captures CloudFront response headers for Mapbox API requests when span is active', async () => {
      vi.spyOn(traceApi.trace, 'getActiveSpan').mockReturnValue(
        mockSpan as unknown as traceApi.Span
      );

      const mockFetch = vi.fn(
        async (_input: string | URL | Request, _init?: RequestInit) => {
          const headers = new Headers();
          headers.set(
            'x-amz-cf-id',
            'HsL_E2ZgW72g4tg_ppvpljSFWa2yYcWziQjZ4d7_1czoC7-53UkAdg=='
          );
          headers.set('x-amz-cf-pop', 'IAD55-P3');
          headers.set('x-cache', 'Miss from cloudfront');
          headers.set('etag', 'W/"21fe5-88gHkqbxd+dMWiCvnvxi2sikhUs"');

          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            headers,
            json: async () => ({})
          } as Response;
        }
      ) as Mock;

      const pipeline = new HttpPipeline(mockFetch as unknown as typeof fetch);
      pipeline.usePolicy(new TracingPolicy());

      await pipeline.execute('https://api.mapbox.com/geocoding/v5/test', {});

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        'http.response.header.x_amz_cf_id',
        'HsL_E2ZgW72g4tg_ppvpljSFWa2yYcWziQjZ4d7_1czoC7-53UkAdg=='
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        'http.response.header.x_amz_cf_pop',
        'IAD55-P3'
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        'http.response.header.x_cache',
        'Miss from cloudfront'
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        'http.response.header.etag',
        'W/"21fe5-88gHkqbxd+dMWiCvnvxi2sikhUs"'
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        'http.response.status_code',
        200
      );
    });

    it('does not capture headers when span is not active', async () => {
      vi.spyOn(traceApi.trace, 'getActiveSpan').mockReturnValue(undefined);

      const mockFetch = vi.fn(
        async (_input: string | URL | Request, _init?: RequestInit) => {
          const headers = new Headers();
          headers.set('x-amz-cf-id', 'test-id');

          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            headers,
            json: async () => ({})
          } as Response;
        }
      ) as Mock;

      const pipeline = new HttpPipeline(mockFetch as unknown as typeof fetch);
      pipeline.usePolicy(new TracingPolicy());

      await pipeline.execute('http://test', {});

      expect(mockSpan.setAttribute).not.toHaveBeenCalled();
    });

    it('only captures headers that are present in the response', async () => {
      vi.spyOn(traceApi.trace, 'getActiveSpan').mockReturnValue(
        mockSpan as unknown as traceApi.Span
      );

      const mockFetch = vi.fn(
        async (_input: string | URL | Request, _init?: RequestInit) => {
          const headers = new Headers();
          headers.set('x-amz-cf-id', 'test-id');
          // Only set one header

          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            headers,
            json: async () => ({})
          } as Response;
        }
      ) as Mock;

      const pipeline = new HttpPipeline(mockFetch as unknown as typeof fetch);
      pipeline.usePolicy(new TracingPolicy());

      await pipeline.execute('https://api.mapbox.com/test', {});

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        'http.response.header.x_amz_cf_id',
        'test-id'
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        'http.response.status_code',
        200
      );
      // Should not call setAttribute for headers that don't exist
      expect(mockSpan.setAttribute).toHaveBeenCalledTimes(2);
    });

    it('does not capture Mapbox-specific headers for non-Mapbox URLs', async () => {
      vi.spyOn(traceApi.trace, 'getActiveSpan').mockReturnValue(
        mockSpan as unknown as traceApi.Span
      );

      const mockFetch = vi.fn(
        async (_input: string | URL | Request, _init?: RequestInit) => {
          const headers = new Headers();
          headers.set('x-amz-cf-id', 'should-not-be-captured');
          headers.set('x-amz-cf-pop', 'IAD55-P3');
          headers.set('x-cache', 'Hit from cloudfront');
          headers.set('etag', 'W/"test"');

          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            headers,
            json: async () => ({})
          } as Response;
        }
      ) as Mock;

      const pipeline = new HttpPipeline(mockFetch as unknown as typeof fetch);
      pipeline.usePolicy(new TracingPolicy());

      await pipeline.execute('https://api.openai.com/v1/chat/completions', {});

      // Should only capture status code, not Mapbox-specific headers
      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        'http.response.status_code',
        200
      );
      expect(mockSpan.setAttribute).toHaveBeenCalledTimes(1);

      // Verify Mapbox headers were NOT captured
      expect(mockSpan.setAttribute).not.toHaveBeenCalledWith(
        'http.response.header.x_amz_cf_id',
        expect.anything()
      );
    });

    it('respects MAPBOX_API_ENDPOINT environment variable', async () => {
      const originalEndpoint = process.env.MAPBOX_API_ENDPOINT;
      process.env.MAPBOX_API_ENDPOINT = 'https://custom.mapbox.example.com/';

      vi.spyOn(traceApi.trace, 'getActiveSpan').mockReturnValue(
        mockSpan as unknown as traceApi.Span
      );

      const mockFetch = vi.fn(
        async (_input: string | URL | Request, _init?: RequestInit) => {
          const headers = new Headers();
          headers.set('x-amz-cf-id', 'custom-endpoint-id');

          return {
            ok: true,
            status: 200,
            statusText: 'OK',
            headers,
            json: async () => ({})
          } as Response;
        }
      ) as Mock;

      const pipeline = new HttpPipeline(mockFetch as unknown as typeof fetch);
      pipeline.usePolicy(new TracingPolicy());

      await pipeline.execute(
        'https://custom.mapbox.example.com/test/endpoint',
        {}
      );

      expect(mockSpan.setAttribute).toHaveBeenCalledWith(
        'http.response.header.x_amz_cf_id',
        'custom-endpoint-id'
      );

      // Restore original
      if (originalEndpoint) {
        process.env.MAPBOX_API_ENDPOINT = originalEndpoint;
      } else {
        delete process.env.MAPBOX_API_ENDPOINT;
      }
    });

    it('generates automatic ID if not provided', () => {
      const tracingPolicy = new TracingPolicy();
      expect(tracingPolicy.id).toMatch(/^tracing-\d+-[a-z0-9]+$/);
    });

    it('uses provided ID when specified', () => {
      const tracingPolicy = new TracingPolicy('custom-tracing-id');
      expect(tracingPolicy.id).toBe('custom-tracing-id');
    });
  });
});
