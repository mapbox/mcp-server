// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { BaseResource } from '../BaseResource.js';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * MIME type for ChatGPT widget templates (Skybridge format)
 */
const WIDGET_MIME_TYPE = 'text/html+skybridge';

/**
 * Widget template definition
 */
interface WidgetTemplate {
  name: string;
  uri: string;
  htmlFile: string;
}

/**
 * Available widget templates
 */
const WIDGET_TEMPLATES: WidgetTemplate[] = [
  {
    name: 'map-widget',
    uri: 'ui://widget/map-widget.html',
    htmlFile: 'map-widget.html'
  }
];

/**
 * Resolves the widgets directory path.
 * Uses WIDGETS_DIR env var if set, otherwise resolves from cwd or node_modules.
 */
function resolveWidgetsDir(): string {
  // Allow explicit override via environment variable
  if (process.env.WIDGETS_DIR) {
    return process.env.WIDGETS_DIR;
  }

  // Try widgets/dist relative to current working directory (package root)
  const cwdPath = path.resolve(process.cwd(), 'widgets/dist');
  if (fs.existsSync(cwdPath)) {
    return cwdPath;
  }

  // Fallback: try node_modules location for when installed as dependency
  const nodeModulesPath = path.resolve(
    process.cwd(),
    'node_modules/@mapbox/mcp-server/widgets/dist'
  );
  if (fs.existsSync(nodeModulesPath)) {
    return nodeModulesPath;
  }

  // Return the cwd path as default (will error on read if not found)
  return cwdPath;
}

/**
 * Resource that serves widget HTML templates for ChatGPT integration.
 *
 * Widget templates are registered as MCP resources with the special
 * `text/html+skybridge` MIME type required by ChatGPT.
 */
export class WidgetTemplatesResource extends BaseResource {
  // Use the exact URI for the map widget - SDK doesn't support wildcard patterns
  readonly uri = 'ui://widget/map-widget.html';
  readonly name = 'Map Widget Template';
  readonly description = 'HTML template for ChatGPT map widget rendering';
  readonly mimeType = WIDGET_MIME_TYPE;

  private widgetsDir: string;

  constructor() {
    super();
    this.widgetsDir = resolveWidgetsDir();
  }

  /**
   * Read the map widget template
   */
  async read(uri: string): Promise<ReadResourceResult> {
    // For now we only support the map widget
    const template = WIDGET_TEMPLATES.find((t) => t.uri === uri);

    if (!template) {
      throw new Error(`Unknown widget template: ${uri}`);
    }

    const htmlPath = path.join(this.widgetsDir, template.htmlFile);

    if (!fs.existsSync(htmlPath)) {
      this.log(
        'warning',
        `Widget template not found: ${htmlPath}. Run 'npm run build:widgets' to generate.`
      );
      throw new Error(
        `Widget template not found: ${htmlPath}. Ensure widgets are built.`
      );
    }

    const html = fs.readFileSync(htmlPath, 'utf8');

    return {
      contents: [
        {
          uri: template.uri,
          mimeType: WIDGET_MIME_TYPE,
          text: html,
          _meta: {
            'openai/widgetPrefersBorder': false,
            'openai/widgetDomain': 'https://chatgpt.com',
            'openai/widgetCSP': {
              connect_domains: [
                'https://api.mapbox.com',
                'https://*.tiles.mapbox.com',
                'https://events.mapbox.com'
              ],
              resource_domains: [
                'https://*.mapbox.com',
                'https://persistent.oaistatic.com'
              ]
            }
          }
        }
      ]
    };
  }
}
