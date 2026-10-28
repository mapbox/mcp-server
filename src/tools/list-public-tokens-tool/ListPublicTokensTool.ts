// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { CallToolResult } from '@modelcontextprotocol/server';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import type { HttpRequest } from '../../utils/types.js';
import { getUserNameFromToken } from '../../utils/jwtUtils.js';
import {
  ListPublicTokensInputSchema,
  type ListPublicTokensInput
} from './ListPublicTokensTool.input.schema.js';
import {
  ListPublicTokensOutputSchema,
  type ListPublicTokensOutput,
  type PublicToken
} from './ListPublicTokensTool.output.schema.js';

// Docs: https://docs.mapbox.com/api/accounts/tokens/#list-tokens

const CREATE_TOKEN_URL = 'https://account.mapbox.com/access-tokens/create';

const GUIDANCE =
  'Public (pk.) tokens are meant for client-side code, but anyone who copies one can use it, and the ' +
  "usage bills to this account. For a site you publish, use a token restricted to the site's URL; " +
  `if none matches, ask the user to create one at ${CREATE_TOKEN_URL} (add the site's URL under URL ` +
  'restrictions) and use that instead. The default token is fine for local prototypes.';

/** What the Tokens API returns for each token; only pk entries are kept. */
interface ApiToken {
  usage?: string;
  token?: string;
  note?: string | null;
  default?: boolean;
  allowedUrls?: string[];
  scopes?: string[];
}

/**
 * Host and path, lowercased, without scheme or trailing slash: how the
 * restriction and the site are compared.
 */
function normalizeUrl(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/\/+$/, '');
}

/**
 * Whether a token restricted to `allowed` would work on `site`. Best effort:
 * Mapbox makes the final call when the page loads.
 */
export function urlMatches(allowed: string, site: string): boolean {
  const a = normalizeUrl(allowed);
  const s = normalizeUrl(site);
  if (a.startsWith('*.')) {
    const host = s.split('/')[0];
    return host.endsWith(a.slice(1));
  }
  return s === a || s.startsWith(`${a}/`);
}

function pickToken(
  tokens: PublicToken[],
  siteUrl: string | undefined
): ListPublicTokensOutput['recommended'] {
  if (siteUrl) {
    const restricted = tokens.find((t) =>
      t.allowedUrls.some((allowed) => urlMatches(allowed, siteUrl))
    );
    if (restricted) {
      return {
        token: restricted.token,
        reason: `Restricted to URLs that include ${siteUrl}, so it can't be reused elsewhere.`
      };
    }
  }
  // Never fall back to a token restricted to some other site: it wouldn't
  // load there anyway.
  const unrestricted = tokens.filter((t) => t.allowedUrls.length === 0);
  const fallback = unrestricted.find((t) => t.default) ?? unrestricted[0];
  if (!fallback) return undefined;
  const which = fallback.default
    ? "The account's default public token"
    : 'A public token on the account';
  return {
    token: fallback.token,
    reason: siteUrl
      ? `${which}. No public token is restricted to ${siteUrl}, so this one works from any site; ` +
        'for a published site, create a restricted one and use it instead.'
      : `${which}. Pass site_url to look for a token restricted to where the page will run.`
  };
}

/**
 * Lists the account's public tokens so an agent building a page or app
 * outside the chat (where render_map_tool can't help) can use Mapbox GL JS.
 * Never returns secret or temporary tokens, and never creates tokens:
 * that needs `tokens:write` (see mcp-devkit-server's create_token_tool).
 */
export class ListPublicTokensTool extends MapboxApiBasedTool<
  typeof ListPublicTokensInputSchema,
  typeof ListPublicTokensOutputSchema
> {
  name = 'list_public_tokens_tool';
  description =
    "Lists the Mapbox account's public (pk.) access tokens, for when you build a web page or app " +
    'outside this chat that loads Mapbox GL JS or calls Mapbox APIs from the browser. ' +
    'To show a map in the chat, use render_map_tool instead; it needs no token. ' +
    'Pass site_url (where the page will run) to get a token restricted to that URL when the account ' +
    "has one. Returns each token's name, whether it is the default, its URL restrictions and scopes, " +
    'a recommended token, and guidance: for a published site, use a URL-restricted token, and tell ' +
    'the user the default token can be reused by anyone who copies it. Secret tokens are never listed.';
  annotations = {
    title: 'List Public Tokens',
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true
  };

  constructor({ httpRequest }: { httpRequest: HttpRequest }) {
    super({
      inputSchema: ListPublicTokensInputSchema,
      outputSchema: ListPublicTokensOutputSchema,
      httpRequest
    });
  }

  protected async execute(
    input: ListPublicTokensInput,
    accessToken: string
  ): Promise<CallToolResult> {
    // A public token can't list tokens (that takes tokens:read), but it is
    // itself a public token the page can use.
    if (accessToken.startsWith('pk.')) {
      return this.result({
        tokens: [],
        recommended: {
          token: accessToken,
          reason:
            "The public token this server is configured with. Listing the account's other tokens needs a token with the tokens:read scope."
        },
        guidance: GUIDANCE
      });
    }

    // MAPBOX_PUBLIC_TOKEN belongs to whoever runs the server. Only hand it out
    // when the caller is running on the server's own access token too (a
    // local install); a hosted caller with its own token must never get it.
    const envFallback =
      accessToken === MapboxApiBasedTool.mapboxAccessToken
        ? process.env.MAPBOX_PUBLIC_TOKEN
        : undefined;

    const username = getUserNameFromToken(accessToken);
    if (!username) {
      return this.fallbackOr(
        envFallback,
        "Couldn't read the account name from the access token."
      );
    }

    const url = new URL(
      `${MapboxApiBasedTool.mapboxApiEndpoint}tokens/v2/${username}`
    );
    url.searchParams.set('usage', 'pk');
    url.searchParams.set('limit', '100');
    url.searchParams.set('access_token', accessToken);

    const response = await this.httpRequest(url.toString());
    if (!response.ok) {
      const scopeHint =
        response.status === 401 || response.status === 403
          ? ' Listing tokens needs an access token with the tokens:read scope.'
          : '';
      return this.fallbackOr(
        envFallback,
        `Listing tokens failed: ${await this.getErrorMessage(response)}.${scopeHint}`
      );
    }

    const body = (await response.json()) as unknown;
    const entries: ApiToken[] = Array.isArray(body)
      ? body
      : ((body as { tokens?: ApiToken[] })?.tokens ?? []);

    // usage=pk already filters, but never pass anything else through.
    const tokens: PublicToken[] = entries
      .filter(
        (t): t is ApiToken & { token: string } =>
          t?.usage === 'pk' &&
          typeof t.token === 'string' &&
          t.token.startsWith('pk.')
      )
      .map((t) => ({
        token: t.token,
        note: t.note ?? null,
        default: t.default === true,
        allowedUrls: t.allowedUrls ?? [],
        scopes: t.scopes ?? []
      }));

    return this.result({
      tokens,
      recommended: pickToken(tokens, input.site_url),
      guidance: GUIDANCE
    });
  }

  /** The server's MAPBOX_PUBLIC_TOKEN when allowed and set, otherwise the error. */
  private fallbackOr(
    envToken: string | undefined,
    message: string
  ): CallToolResult {
    if (envToken?.startsWith('pk.')) {
      return this.result({
        tokens: [],
        recommended: {
          token: envToken,
          reason: `The public token this server is configured with (MAPBOX_PUBLIC_TOKEN). ${message}`
        },
        guidance: GUIDANCE
      });
    }
    return { content: [{ type: 'text', text: message }], isError: true };
  }

  private result(output: ListPublicTokensOutput): CallToolResult {
    const lines = output.tokens.map((t) => {
      const name = t.note ? `"${t.note}"` : '(unnamed)';
      const restriction =
        t.allowedUrls.length > 0
          ? `restricted to ${t.allowedUrls.join(', ')}`
          : 'no URL restrictions';
      return `- ${name}${t.default ? ' (default)' : ''}: ${t.token} (${restriction})`;
    });
    const text = [
      output.tokens.length > 0
        ? `Public tokens (${output.tokens.length}):\n${lines.join('\n')}`
        : undefined,
      output.recommended
        ? `Recommended: ${output.recommended.token}\n${output.recommended.reason}`
        : output.tokens.length > 0
          ? 'Every public token on this account is restricted to other URLs, so none is recommended.'
          : 'This account has no public tokens.',
      output.guidance
    ]
      .filter(Boolean)
      .join('\n\n');

    return {
      content: [{ type: 'text', text }],
      structuredContent: output,
      isError: false
    };
  }
}
