// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { randomUUID } from 'node:crypto';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { MapboxApiBasedTool } from '../MapboxApiBasedTool.js';
import {
  ReportInputSchema,
  type ReportInput
} from './ReportTool.input.schema.js';
import {
  ReportOutputSchema,
  type ReportOutput
} from './ReportTool.output.schema.js';
import { getVersionInfo } from '../../utils/versionUtils.js';
import type { HttpRequest } from '../../utils/types.js';

// An undocumented Feedback API endpoint the Feedback API team added for the
// Mapbox CLI's `mapbox report` (AGI-1168): the same body as
// `POST /user-feedback/v1/feedback`, but filed under Mapbox's own
// locationai-mapbox account rather than the caller's, and needing no scope.
// Spec: https://github.com/mapbox/mapbox-cli/blob/main/custom-openapi/report/openapi/report.yaml

type Confirmation = 'confirmed' | 'declined' | 'not-asked';

export class ReportTool extends MapboxApiBasedTool<
  typeof ReportInputSchema,
  typeof ReportOutputSchema
> {
  name = 'report_tool';
  description =
    'Send feedback about the Mapbox MCP server to the Mapbox team that builds it: a bug, a tool that ' +
    'failed or gave a wrong or confusing result, a missing capability or a suggestion, or a Mapbox data ' +
    "quality problem the user noticed. It goes to Mapbox, not to the user's account, needs no special " +
    'token scope, and cannot be read back or withdrawn afterward. ' +
    'For a wrong place, road or route the user wants filed under their own Mapbox account, use feedback_tool; ' +
    'if feedback_tool fails because the token lacks user-feedback:write, this tool can send it to Mapbox instead. ' +
    'Use it only when the user asks to send feedback, or agrees when you offer. Before calling it, show the ' +
    'user the exact text you will send and get their go-ahead. Leave out personal details the user did not ' +
    'ask to share. The server adds its own version and the client name. Send one report per problem, and do ' +
    'not resend one that already succeeded. Returns the report id.';
  annotations = {
    title: 'Send Feedback to Mapbox',
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true
  };

  constructor(params: { httpRequest: HttpRequest }) {
    super({
      inputSchema: ReportInputSchema,
      outputSchema: ReportOutputSchema,
      httpRequest: params.httpRequest
    });
  }

  /**
   * Same confirmation as feedback_tool: ask through elicitation when the
   * client supports it, and send nothing if the prompt itself fails.
   */
  private async confirmWithUser(input: ReportInput): Promise<Confirmation> {
    const server = this.activeServer;
    const supportsElicitation =
      server?.server.getClientCapabilities?.()?.elicitation !== undefined;
    if (!server || !supportsElicitation) return 'not-asked';

    try {
      const result = await server.server.elicitInput({
        mode: 'form',
        message:
          'Send this feedback to Mapbox?\n\n' +
          `"${input.feedback}"\n` +
          `Category: ${input.category}` +
          (input.tool_name ? `\nTool: ${input.tool_name}` : '') +
          (input.coordinates
            ? `\nLocation: ${input.coordinates.latitude}, ${input.coordinates.longitude}`
            : ''),
        requestedSchema: {
          type: 'object',
          properties: {
            send: {
              type: 'boolean',
              title: 'Send feedback',
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
   * Appended to the text so the team can tell MCP server reports from the
   * CLI's, which share the endpoint, and see where they came from. The
   * client comes from the active server rather than tracing's module-level
   * value, since the hosted server serves many clients from one process.
   */
  private signature(input: ReportInput): string {
    const client = this.activeServer?.server.getClientVersion?.();
    return (
      `\n\n— mapbox-mcp-server ${getVersionInfo().version}` +
      (client?.name
        ? ` via ${client.name}${client.version ? ` ${client.version}` : ''}`
        : '') +
      (input.tool_name ? `, about ${input.tool_name}` : '')
    );
  }

  protected async execute(
    input: ReportInput,
    accessToken: string
  ): Promise<CallToolResult> {
    const confirmation = await this.confirmWithUser(input);
    if (confirmation === 'declined') {
      return {
        content: [
          {
            type: 'text',
            text: 'The user did not confirm the feedback, so nothing was sent to Mapbox.'
          }
        ],
        isError: false
      };
    }

    // The endpoint still requires lat/lon; feedback with no place sends 0, 0
    // as the CLI does. Picking the id here means a retry of a 5xx or 429
    // resends the same item rather than a second one.
    const body = {
      id: randomUUID(),
      feedback: input.feedback + this.signature(input),
      category: input.category,
      lat: input.coordinates?.latitude ?? 0,
      lon: input.coordinates?.longitude ?? 0
    };

    const url = new URL(
      'user-feedback/v1/cli-feedback',
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
      return {
        content: [
          {
            type: 'text',
            text: `Feedback API error: ${errorMessage}.`
          }
        ],
        isError: true
      };
    }

    // The feedback is in at this point, so an unexpected response body must
    // not turn into an error (the model might resend).
    const parsed = ReportOutputSchema.safeParse(
      await response.json().catch(() => undefined)
    );
    const data: ReportOutput = parsed.success
      ? parsed.data
      : {
          id: body.id,
          status: 'received',
          category: body.category,
          feedback: body.feedback
        };

    return {
      content: [
        {
          type: 'text',
          text: `Sent to Mapbox. Report ${data.id}.`
        }
      ],
      structuredContent: data as unknown as Record<string, unknown>,
      isError: false
    };
  }
}
