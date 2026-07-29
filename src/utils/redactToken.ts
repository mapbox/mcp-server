// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/** Token prefixes Mapbox uses: public, secret, and temporary. */
const TOKEN_PREFIXES = new Set(['pk', 'sk', 'tk']);

/**
 * Character allowlist for an account name lifted out of a token payload, matching the
 * username validation in StyleComparisonTool. This bounds what a token payload can put
 * into a span attribute or log line; it is not a statement of Mapbox's account naming
 * rules. A name outside it is not partially disclosed — it falls back to `***`.
 */
const ACCOUNT_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Replace a token value with a placeholder that keeps the parts safe to publish.
 *
 * Mapbox tokens are JWTs (`<prefix>.<payload>.<signature>`) whose payload carries
 * the account name under `u`, so `pk.eyJ1IjoiZXhhbXBsZSJ9.signature` becomes
 * `pk.example.redacted`. Keeping the prefix and account name makes traces and logs
 * readable — you can still tell a secret token from a public one, and whose account
 * a request billed to — while the signature, which is the part that authenticates,
 * never leaves the process.
 *
 * Anything that does not parse cleanly as such a token falls back to `***`, so an
 * unrecognized shape is never partially disclosed on the assumption it was harmless.
 */
function maskTokenValue(token: string): string {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return '***';
  }

  const [prefix, payload] = parts;
  if (!TOKEN_PREFIXES.has(prefix)) {
    return '***';
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(payload, 'base64').toString('utf-8')
    ) as { u?: unknown };

    if (
      typeof decoded.u !== 'string' ||
      !ACCOUNT_NAME_PATTERN.test(decoded.u)
    ) {
      return '***';
    }

    return `${prefix}.${decoded.u}.redacted`;
  } catch {
    return '***';
  }
}

/** Remove access_token query parameter values from strings before logging or returning to callers. */
export function redactToken(s: string): string {
  return s.replace(
    /access_token=([^&\s#"']+)/g,
    (_match, token: string) => `access_token=${maskTokenValue(token)}`
  );
}
