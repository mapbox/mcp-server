// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { getVersionInfo } from './versionUtils.js';
import { type HttpRequest } from './types.js';
import { trace } from '@opentelemetry/api';

function createRandomId(prefix: string): string {
  return `${prefix}${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export interface HttpPolicy {
  id: string;
  handle(
    input: string | URL | Request,
    init: RequestInit,
    next: HttpRequest
  ): Promise<Response>;
}

export class HttpPipeline {
  private policies: HttpPolicy[] = [];
  private httpRequestImpl: HttpRequest;

  constructor(httpRequestImpl?: HttpRequest) {
    this.httpRequestImpl = httpRequestImpl ?? fetch;
  }

  usePolicy(policy: HttpPolicy) {
    this.policies.push(policy);
  }

  removePolicy(policyOrId: HttpPolicy | string) {
    if (typeof policyOrId === 'string') {
      this.policies = this.policies.filter((p) => p.id !== policyOrId);
    } else {
      this.policies = this.policies.filter((p) => p !== policyOrId);
    }
  }

  findPolicyById(id: string): HttpPolicy | undefined {
    return this.policies.find((p) => p.id === id);
  }

  listPolicies() {
    return this.policies;
  }

  async execute(
    input: string | URL | Request,
    init: RequestInit = {}
  ): Promise<Response> {
    const dispatch = async (
      i: number,
      req: string | URL | Request,
      options: RequestInit
    ): Promise<Response> => {
      if (i < this.policies.length) {
        return this.policies[i].handle(
          req,
          options,
          (nextReq: string | URL | Request, nextOptions?: RequestInit) =>
            dispatch(i + 1, nextReq, nextOptions || {})
        );
      }
      return this.httpRequestImpl(req, options); // Use injected httpRequest
    };
    return dispatch(0, input, init);
  }
}

export class UserAgentPolicy implements HttpPolicy {
  id: string;

  constructor(
    private userAgent: string,
    id?: string
  ) {
    this.id = id ?? createRandomId('user-agent-');
  }
  async handle(
    input: string | URL | Request,
    init: RequestInit,
    next: HttpRequest
  ): Promise<Response> {
    let headers: Headers | Record<string, string>;

    if (init.headers instanceof Headers) {
      headers = init.headers;
      if (!headers.has('User-Agent')) {
        headers.set('User-Agent', this.userAgent);
      }
    } else {
      const h = (init.headers ?? {}) as Record<string, string>;
      if (!('User-Agent' in h)) {
        h['User-Agent'] = this.userAgent;
      }
      headers = h;
    }

    return next(input, { ...init, headers });
  }

  static fromVersionInfo(
    versionInfo: {
      name: string;
      version: string;
      sha: string;
      tag: string;
      branch: string;
    },
    id?: string
  ): UserAgentPolicy {
    const userAgent = `${versionInfo.name}/${versionInfo.version} (${versionInfo.branch}, ${versionInfo.tag}, ${versionInfo.sha})`;
    return new UserAgentPolicy(userAgent, id);
  }
}

export class RetryPolicy implements HttpPolicy {
  id: string;

  constructor(
    private maxRetries: number = 3,
    private baseDelayMs: number = 200,
    private maxDelayMs: number = 2000,
    id?: string
  ) {
    this.id = id ?? createRandomId('retry-');
  }

  async handle(
    input: string | URL | Request,
    init: RequestInit,
    next: HttpRequest
  ): Promise<Response> {
    let attempt = 0;
    let lastError: Response | undefined;

    while (attempt <= this.maxRetries) {
      const response = await next(input, init);

      if (response.ok || (response.status < 500 && response.status !== 429)) {
        return response;
      }

      // Calculate exponential backoff with jitter
      const expBackoff = Math.min(
        this.baseDelayMs * 2 ** attempt,
        this.maxDelayMs
      );
      const jitter = Math.random() * expBackoff * 0.5;
      const delay = expBackoff + jitter;

      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt++;
      lastError = response;
    }

    // If all retries failed, return last response
    return lastError!;
  }
}

export class TracingPolicy implements HttpPolicy {
  id: string;

  constructor(id?: string) {
    this.id = id ?? createRandomId('tracing-');
  }

  async handle(
    input: string | URL | Request,
    init: RequestInit,
    next: HttpRequest
  ): Promise<Response> {
    const response = await next(input, init);

    // Capture response headers in the active span
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      // Only capture Mapbox-specific headers for Mapbox API requests
      const mapboxEndpoint =
        process.env.MAPBOX_API_ENDPOINT || 'https://api.mapbox.com/';
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;

      if (url && url.startsWith(mapboxEndpoint)) {
        // Capture Mapbox/CloudFront headers
        const cfId = response.headers.get('x-amz-cf-id');
        if (cfId) {
          activeSpan.setAttribute('http.response.header.x_amz_cf_id', cfId);
        }

        const cfPop = response.headers.get('x-amz-cf-pop');
        if (cfPop) {
          activeSpan.setAttribute('http.response.header.x_amz_cf_pop', cfPop);
        }

        const xCache = response.headers.get('x-cache');
        if (xCache) {
          activeSpan.setAttribute('http.response.header.x_cache', xCache);
        }

        const etag = response.headers.get('etag');
        if (etag) {
          activeSpan.setAttribute('http.response.header.etag', etag);
        }
      }

      // Always capture HTTP status for all requests
      activeSpan.setAttribute('http.response.status_code', response.status);
    }

    return response;
  }
}

const pipeline = new HttpPipeline();
const versionInfo = getVersionInfo();
pipeline.usePolicy(
  UserAgentPolicy.fromVersionInfo(versionInfo, 'system-user-agent-policy')
);
pipeline.usePolicy(new RetryPolicy(3, 200, 2000, 'system-retry-policy'));
pipeline.usePolicy(new TracingPolicy('system-tracing-policy'));

export const httpRequest = pipeline.execute.bind(pipeline);
export const systemHttpPipeline = pipeline;
