// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

/**
 * Widget utilities for ChatGPT App integration.
 * Provides helper functions for creating widget-compatible tool responses.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Configuration for widget metadata in tool responses
 */
export interface WidgetConfig {
  /** URI of the widget template resource (e.g., "ui://widget/map-widget.html") */
  templateUri: string;
  /** Message shown while tool is executing (e.g., "Searching for places...") */
  invoking: string;
  /** Message shown after tool completes (e.g., "Found locations") */
  invoked: string;
  /** Whether widget content is accessible to assistive technologies */
  widgetAccessible?: boolean;
  /** Description of the widget for accessibility */
  widgetDescription?: string;
}

/**
 * Environment variable to enable ChatGPT widget support
 */
export function isChatGptWidgetsEnabled(): boolean {
  return process.env.ENABLE_CHATGPT_WIDGETS === 'true';
}

/**
 * Creates a tool response with ChatGPT widget support.
 *
 * Returns structuredContent (for schema validation) and _meta with OpenAI hints + widget data.
 * When widgets are disabled, returns a standard response without widget metadata.
 *
 * @param config Widget configuration
 * @param originalData Original API response data (for schema validation)
 * @param widgetData Transformed data for widget rendering
 * @param textContent Markdown/text content for model narration
 * @returns CallToolResult with widget metadata
 */
export function createWidgetResponse(
  config: WidgetConfig,
  originalData: unknown,
  widgetData: unknown,
  textContent: string
): CallToolResult {
  if (!isChatGptWidgetsEnabled()) {
    return {
      content: [{ type: 'text', text: textContent }],
      structuredContent: originalData as Record<string, unknown>
    };
  }

  return {
    content: [{ type: 'text', text: textContent }],
    structuredContent: originalData as Record<string, unknown>,
    _meta: {
      'openai/outputTemplate': config.templateUri,
      'openai/toolInvocation/invoking': config.invoking,
      'openai/toolInvocation/invoked': config.invoked,
      'openai/widgetAccessible': config.widgetAccessible ?? true,
      'openai/resultCanProduceWidget': true,
      ...(config.widgetDescription && {
        'openai/widgetDescription': config.widgetDescription
      }),
      // Widget-specific data that doesn't need schema validation
      widgetData
    }
  };
}

/**
 * Widget template URIs for different widget types
 */
export const WIDGET_URIS = {
  MAP_WIDGET: 'ui://widget/map-widget.html'
} as const;

/**
 * Default widget configurations for common use cases
 */
export const WIDGET_CONFIGS = {
  categorySearch: {
    templateUri: WIDGET_URIS.MAP_WIDGET,
    invoking: 'Searching for places...',
    invoked: 'Found locations',
    widgetAccessible: true,
    widgetDescription: 'Interactive map showing search results'
  } satisfies WidgetConfig,

  searchAndGeocode: {
    templateUri: WIDGET_URIS.MAP_WIDGET,
    invoking: 'Searching...',
    invoked: 'Found locations',
    widgetAccessible: true,
    widgetDescription: 'Interactive map showing search results'
  } satisfies WidgetConfig,

  directions: {
    templateUri: WIDGET_URIS.MAP_WIDGET,
    invoking: 'Calculating route...',
    invoked: 'Route found',
    widgetAccessible: true,
    widgetDescription: 'Interactive map showing route directions'
  } satisfies WidgetConfig,

  isochrone: {
    templateUri: WIDGET_URIS.MAP_WIDGET,
    invoking: 'Calculating reachable area...',
    invoked: 'Isochrone calculated',
    widgetAccessible: true,
    widgetDescription: 'Interactive map showing reachable area'
  } satisfies WidgetConfig
} as const;
