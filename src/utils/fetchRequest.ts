// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { getVersionInfo } from './versionUtils.js';

function createRandomId(prefix: string): string {
  return `${prefix}${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export interface FetchPolicy {
  id: string;
  handle(
    input: string | URL | Request,
    init: RequestInit,
    next: typeof fetch
  ): Promise<Response>;
}

export class PolicyPipeline {
  private policies: FetchPolicy[] = [];
  private fetchImpl: typeof fetch;

  constructor(fetchImpl?: typeof fetch) {
    this.fetchImpl = fetchImpl ?? fetch;
  }

  usePolicy(policy: FetchPolicy) {
    this.policies.push(policy);
  }

  removePolicy(policyOrId: FetchPolicy | string) {
    if (typeof policyOrId === 'string') {
      this.policies = this.policies.filter((p) => p.id !== policyOrId);
    } else {
      this.policies = this.policies.filter((p) => p !== policyOrId);
    }
  }

  findPolicyById(id: string): FetchPolicy | undefined {
    return this.policies.find((p) => p.id === id);
  }

  listPolicies() {
    return this.policies;
  }

  async fetch(
    input: string | URL | Request,
    init: RequestInit = {}
  ): Promise<Response> {
    const dispatch = async (
      i: number,
      req: string | URL | Request,
      options: RequestInit
    ): Promise<Response> => {
      if (i < this.policies.length) {
        return this.policies[i].handle(req, options, (nextReq, nextOptions) =>
          dispatch(i + 1, nextReq, nextOptions!)
        );
      }
      return this.fetchImpl(req, options); // Use injected fetch
    };
    return dispatch(0, input, init);
  }
}

export class UserAgentPolicy implements FetchPolicy {
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
    next: typeof fetch
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

export class RetryPolicy implements FetchPolicy {
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
    next: typeof fetch
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

const pipeline = new PolicyPipeline();
const versionInfo = getVersionInfo();
pipeline.usePolicy(
  UserAgentPolicy.fromVersionInfo(versionInfo, 'system-user-agent-policy')
);
pipeline.usePolicy(new RetryPolicy(3, 200, 2000, 'system-retry-policy'));

export const fetchClient = pipeline.fetch.bind(pipeline);
export const systemFetchPipeline = pipeline;
