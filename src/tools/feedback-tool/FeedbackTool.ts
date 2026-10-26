// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { randomUUID } from 'node:crypto';
import { distance as turfDistance } from '@turf/turf';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import {
  FeedbackInputSchema,
  type FeedbackInput
} from './FeedbackTool.input.schema.js';
import {
  FeedbackOutputSchema,
  type FeedbackOutput
} from './FeedbackTool.output.schema.js';
import type { HttpRequest } from '../../utils/types.js';

// Docs: https://docs.mapbox.com/api/feedback/#create-a-single-feedback-item

type Confirmation = 'confirmed' | 'declined' | 'not-asked';

/** How far back, and how close, an earlier report counts as the same one. */
const DUPLICATE_WINDOW_DAYS = 30;
const DUPLICATE_RADIUS_METERS = 50;

type DuplicateCheck =
  | { kind: 'duplicate'; item: FeedbackOutput }
  | { kind: 'none' }
  | { kind: 'unchecked'; reason: string };

export class FeedbackTool extends MapboxApiBasedTool<
  typeof FeedbackInputSchema,
  typeof FeedbackOutputSchema
> {
  name = 'feedback_tool';
  description =
    'Report a problem with Mapbox map, place or routing data to Mapbox through the Feedback API, ' +
    'for example a place that has closed, wrong details or location for a place, a missing place, ' +
    'a closed road, or a route with an illegal turn. Mapbox reviews each report and may fix the data. ' +
    'Use it only when the user asks to report a problem, or agrees when you offer. ' +
    'Before calling it, show the user the exact feedback text, category and location you will send ' +
    'and get their go-ahead; the report goes to Mapbox under their account. ' +
    'Take the coordinates from an earlier search, place or directions result rather than guessing. ' +
    'Send one report per problem, and do not resend one that already succeeded. ' +
    "Each report may be billed to the account, so before sending, the tool checks the account's own " +
    `reports from the last ${DUPLICATE_WINDOW_DAYS} days and does not send if one with the same category ` +
    `within ${DUPLICATE_RADIUS_METERS} m is still awaiting review; it returns that report instead. ` +
    'Only set send_anyway when the user says the earlier report is about a different problem. ' +
    'Returns the report id and its status (received).';
  annotations = {
    title: 'Report Map Feedback',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true
  };

  constructor(params: { httpRequest: HttpRequest }) {
    super({
      inputSchema: FeedbackInputSchema,
      outputSchema: FeedbackOutputSchema,
      httpRequest: params.httpRequest
    });
  }

  /**
   * When the client supports elicitation, ask the user to confirm the report
   * before it is sent. A client without elicitation relies on the model having
   * confirmed in chat, as the description asks. If the prompt itself fails,
   * nothing is sent: unlike directions_tool's route picker, falling through
   * here would send a report the user never saw.
   */
  private async confirmWithUser(input: FeedbackInput): Promise<Confirmation> {
    const server = this.activeServer;
    const supportsElicitation =
      server?.server.getClientCapabilities?.()?.elicitation !== undefined;
    if (!server || !supportsElicitation) return 'not-asked';

    try {
      const { longitude, latitude } = input.coordinates;
      const result = await server.server.elicitInput({
        mode: 'form',
        message:
          'Send this report to Mapbox?\n\n' +
          `"${input.feedback}"\n` +
          `Category: ${input.category}\n` +
          `Location: ${latitude}, ${longitude}`,
        requestedSchema: {
          type: 'object',
          properties: {
            send: {
              type: 'boolean',
              title: 'Send report',
              default: true
            }
          },
          required: ['send']
        }
      });
      return result.action === 'accept' && result.content?.send === true
        ? 'confirmed'
        : 'declined';
    } catch {
      return 'declined';
    }
  }

  /**
   * Look for a report this account already sent about the same problem: same
   * category, still awaiting review, sent recently, within a few meters. The
   * Feedback API only lists the token's own account's reports and can't filter
   * by location, so this fetches recent ones and compares distances here. It
   * can't see other accounts' reports. Needs user-feedback:read; without it,
   * or on any error, the report is sent unchecked rather than blocked.
   */
  private async findEarlierReport(
    input: FeedbackInput,
    accessToken: string
  ): Promise<DuplicateCheck> {
    const url = new URL(
      'user-feedback/v1/feedback',
      MapboxApiBasedTool.mapboxApiEndpoint
    );
    url.searchParams.set('category', input.category);
    url.searchParams.set('status', 'received');
    url.searchParams.set(
      'created_after',
      new Date(
        Date.now() - DUPLICATE_WINDOW_DAYS * 24 * 60 * 60 * 1000
      ).toISOString()
    );
    url.searchParams.set('sort_by', 'created_at');
    url.searchParams.set('order', 'desc');
    url.searchParams.set('limit', '200');
    url.searchParams.set('access_token', accessToken);

    try {
      const response = await this.httpRequest(url.toString());
      if (!response.ok) {
        return {
          kind: 'unchecked',
          reason:
            response.status === 401 || response.status === 403
              ? 'the access token lacks the user-feedback:read scope'
              : `the Feedback API returned ${response.status}`
        };
      }
      const page = (await response.json()) as { items?: unknown[] };
      const here = [input.coordinates.longitude, input.coordinates.latitude];
      for (const raw of page.items ?? []) {
        const parsed = FeedbackOutputSchema.safeParse(raw);
        if (!parsed.success || !parsed.data.location) continue;
        const { lon, lat } = parsed.data.location;
        const meters = turfDistance(here, [lon, lat], { units: 'meters' });
        if (meters <= DUPLICATE_RADIUS_METERS) {
          return { kind: 'duplicate', item: parsed.data };
        }
      }
      return { kind: 'none' };
    } catch {
      return {
        kind: 'unchecked',
        reason: 'the Feedback API could not be reached'
      };
    }
  }

  protected async execute(
    input: FeedbackInput,
    accessToken: string
  ): Promise<CallToolResult> {
    const check: DuplicateCheck = input.send_anyway
      ? { kind: 'unchecked', reason: 'send_anyway was set' }
      : await this.findEarlierReport(input, accessToken);
    if (check.kind === 'duplicate') {
      const earlier = check.item;
      return {
        content: [
          {
            type: 'text',
            text:
              `Not sent: this account already reported a ${earlier.category} here ` +
              `(report ${earlier.id}, status: ${earlier.status}${earlier.created_at ? `, sent ${earlier.created_at}` : ''}): ` +
              `"${earlier.feedback}". It is still awaiting review, so a second report would only add a charge. ` +
              'If the user says this is a different problem, call again with send_anyway: true.'
          }
        ],
        structuredContent: {
          ...(earlier as unknown as Record<string, unknown>),
          duplicate: true
        },
        isError: false
      };
    }

    const confirmation = await this.confirmWithUser(input);
    if (confirmation === 'declined') {
      return {
        content: [
          {
            type: 'text',
            text: 'The user did not confirm the report, so nothing was sent to Mapbox.'
          }
        ],
        isError: false
      };
    }

    // The pipeline's RetryPolicy retries 5xx and 429 responses, POSTs
    // included. Picking the id here means a retry resends the same item
    // rather than a second one.
    const body = {
      id: randomUUID(),
      feedback: input.feedback,
      category: input.category,
      lat: input.coordinates.latitude,
      lon: input.coordinates.longitude
    };

    const url = new URL(
      'user-feedback/v1/feedback',
      MapboxApiBasedTool.mapboxApiEndpoint
    );
    url.searchParams.set('access_token', accessToken);

    const response = await this.httpRequest(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorMessage = await this.getErrorMessage(response);
      const scopeHint =
        response.status === 401 || response.status === 403
          ? ' The access token needs the user-feedback:write scope to send feedback.'
          : '';
      return {
        content: [
          {
            type: 'text',
            text: `Feedback API error: ${errorMessage}.${scopeHint}`
          }
        ],
        isError: true
      };
    }

    // The report is in at this point, so an unexpected response body must not
    // turn into an error (the model might resend). Fall back to what we sent,
    // which still matches the output schema the SDK validates against. No
    // log message: Claude Desktop shows a call that logs as failed.
    const parsed = FeedbackOutputSchema.safeParse(
      await response.json().catch(() => undefined)
    );
    const data: FeedbackOutput = parsed.success
      ? parsed.data
      : {
          id: body.id,
          status: 'received',
          category: body.category,
          feedback: body.feedback,
          location: { lon: body.lon, lat: body.lat }
        };

    return {
      content: [
        {
          type: 'text',
          text:
            `Sent to Mapbox. Report ${data.id}, status: ${data.status}. ` +
            'Mapbox reviews reports and may update the map data; the status changes to fixed, reviewed or out_of_scope once it has.' +
            (check.kind === 'unchecked' && !input.send_anyway
              ? ` (Earlier reports were not checked for duplicates: ${check.reason}.)`
              : '')
        }
      ],
      structuredContent: data as unknown as Record<string, unknown>,
      isError: false
    };
  }
}
