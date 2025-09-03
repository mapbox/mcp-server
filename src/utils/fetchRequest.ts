import { getVersionInfo } from './versionUtils.js';

export interface FetchPolicy {
  handle(
    input: string | URL | Request,
    init: RequestInit,
    next: typeof fetch
  ): Promise<Response>;
}

export class PolicyPipeline {
  private policies: FetchPolicy[] = [];

  use(policy: FetchPolicy) {
    this.policies.push(policy);
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
      return fetch(req, options);
    };
    return dispatch(0, input, init);
  }
}

export class UserAgentPolicy implements FetchPolicy {
  constructor(private userAgent: string) {}
  async handle(
    input: string | URL | Request,
    init: RequestInit,
    next: typeof fetch
  ): Promise<Response> {
    const headers = { ...(init.headers || {}), 'User-Agent': this.userAgent };
    return next(input, { ...init, headers });
  }

  static fromVersionInfo(versionInfo: {
    name: string;
    version: string;
    sha: string;
    tag: string;
    branch: string;
  }): UserAgentPolicy {
    const userAgent = `${versionInfo.name}/${versionInfo.version} (${versionInfo.branch}, ${versionInfo.tag}, ${versionInfo.sha})`;
    return new UserAgentPolicy(userAgent);
  }
}

const pipeline = new PolicyPipeline();
const versionInfo = getVersionInfo();
pipeline.use(UserAgentPolicy.fromVersionInfo(versionInfo));

export const fetchClient = pipeline.fetch.bind(pipeline);
