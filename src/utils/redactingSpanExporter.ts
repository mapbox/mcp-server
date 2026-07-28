// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import type { ExportResult } from '@opentelemetry/core';
import type { Attributes } from '@opentelemetry/api';
import { redactToken } from './redactToken.js';

/**
 * Rewrites every string attribute value through `redactToken`, returning the
 * original object when nothing changed so unaffected spans pass through as-is.
 */
function redactAttributes(attributes: Attributes): Attributes {
  let redacted: Attributes | undefined;

  for (const [key, value] of Object.entries(attributes)) {
    if (typeof value !== 'string') {
      continue;
    }
    const clean = redactToken(value);
    if (clean !== value) {
      redacted ??= { ...attributes };
      redacted[key] = clean;
    }
  }

  return redacted ?? attributes;
}

/**
 * Collect every property name reachable on a span, including accessors defined
 * on its prototype chain. Copying by key list rather than a hardcoded field list
 * keeps this working across OpenTelemetry SDK versions, which have moved fields
 * (e.g. `parentSpanId` to `parentSpanContext`) between releases.
 */
function collectKeys(span: ReadableSpan): Set<string> {
  const keys = new Set<string>();

  for (
    let current: object | null = span;
    current && current !== Object.prototype;
    current = Object.getPrototypeOf(current)
  ) {
    for (const key of Object.getOwnPropertyNames(current)) {
      if (key !== 'constructor') {
        keys.add(key);
      }
    }
  }

  return keys;
}

/**
 * Return a copy of `span` with redacted attributes, or the span itself when no
 * attribute needed redaction. The copy is a plain object rather than a mutation
 * of the original, so the SDK's own span state is left untouched.
 */
function redactSpan(span: ReadableSpan): ReadableSpan {
  const attributes = redactAttributes(span.attributes);
  const events = span.events.map((event) =>
    event.attributes
      ? { ...event, attributes: redactAttributes(event.attributes) }
      : event
  );

  const attributesChanged = attributes !== span.attributes;
  const eventsChanged = events.some(
    (event, index) => event !== span.events[index]
  );

  if (!attributesChanged && !eventsChanged) {
    return span;
  }

  const copy: Record<string, unknown> = {};
  for (const key of collectKeys(span)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic property copy across unknown SDK span shapes
    const value = (span as any)[key];
    copy[key] = typeof value === 'function' ? value.bind(span) : value;
  }
  copy.attributes = attributes;
  copy.events = events;

  return copy as unknown as ReadableSpan;
}

/**
 * Wraps a SpanExporter and strips `access_token` values from span attributes
 * before they leave the process.
 *
 * Auto-instrumentation of `fetch`/`undici` records the full request URL on client
 * spans (`url.full`, `url.query`), and Mapbox APIs take the access token as a
 * query parameter. Without this wrapper, an operator who configures an OTLP
 * endpoint gets those tokens copied verbatim into their telemetry backend.
 *
 * Redaction happens at the exporter rather than in an instrumentation
 * `requestHook` so it covers every attribute on every span, including attribute
 * names introduced by future semantic-convention or instrumentation changes.
 */
export class RedactingSpanExporter implements SpanExporter {
  constructor(private readonly delegate: SpanExporter) {}

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ): void {
    this.delegate.export(spans.map(redactSpan), resultCallback);
  }

  shutdown(): Promise<void> {
    return this.delegate.shutdown();
  }

  forceFlush(): Promise<void> {
    return this.delegate.forceFlush?.() ?? Promise.resolve();
  }
}
