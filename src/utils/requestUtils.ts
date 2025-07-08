import { VersionInfo } from './versionUtils.js';

let isPatched = false;
let originalFetch: (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export function patchGlobalFetch(versionInfo: VersionInfo): {
  'User-Agent': string;
} {
  // Initialize originalFetch if not already done
  if (!originalFetch) {
    if (
      typeof globalThis !== 'undefined' &&
      typeof globalThis.fetch === 'function'
    ) {
      originalFetch = globalThis.fetch;
    } else if (
      typeof global !== 'undefined' &&
      typeof global.fetch === 'function'
    ) {
      originalFetch = global.fetch;
    } else if (typeof fetch === 'function') {
      originalFetch = fetch;
    } else {
      throw new Error('No fetch implementation available');
    }
  }

  // In test environments, update originalFetch to current global.fetch if it was mocked
  if (
    typeof global !== 'undefined' &&
    typeof global.fetch === 'function' &&
    typeof (global.fetch as any).mockResolvedValue === 'function'
  ) {
    originalFetch = global.fetch;
  }

  const headers = {
    'User-Agent': `${versionInfo.name}/${versionInfo.version} (${versionInfo.branch}, ${versionInfo.tag}, ${versionInfo.sha})`
  };
  if (!isPatched) {
    const patchedFetch = async function (
      input: string | URL | Request,
      init?: RequestInit
    ): Promise<Response> {
      const modifiedInit: RequestInit = {
        ...init,
        headers: {
          ...(init?.headers || {}),
          ...headers
        }
      };
      return originalFetch(input, modifiedInit);
    };

    // Patch fetch in the same way we detected it during initialization
    if (
      typeof globalThis !== 'undefined' &&
      typeof globalThis.fetch === 'function'
    ) {
      (globalThis as any).fetch = patchedFetch;
    } else if (
      typeof global !== 'undefined' &&
      typeof global.fetch === 'function'
    ) {
      global.fetch = patchedFetch;
    }
    isPatched = true;
  }

  return headers;
}

export function cleanup() {
  if (isPatched) {
    global.fetch = originalFetch;
    isPatched = false;
  }
}
