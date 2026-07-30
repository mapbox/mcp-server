// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect, vi } from 'vitest';
import {
  BasicTracerProvider,
  SimpleSpanProcessor,
  type ReadableSpan,
  type SpanExporter
} from '@opentelemetry/sdk-trace-base';
import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import { SpanKind } from '@opentelemetry/api';
import { RedactingSpanExporter } from '../../src/utils/redactingSpanExporter.js';

const SECRET = 'sk.eyJ1IjoidGVzdHVzZXIifQ.signaturevalue';
const MASKED = 'sk.testuser.redacted';

class CapturingExporter implements SpanExporter {
  readonly captured: ReadableSpan[] = [];

  export(
    spans: ReadableSpan[],
    resultCallback: (result: ExportResult) => void
  ): void {
    this.captured.push(...spans);
    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * Produce a real ended span carrying the given attributes, so the exporter is
 * exercised against the SDK's own span implementation rather than a stub object.
 */
function endedSpanWith(
  attributes: Record<string, string | number>
): ReadableSpan {
  const captured = new CapturingExporter();
  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(captured)]
  });

  const span = provider
    .getTracer('test')
    .startSpan('GET', { kind: SpanKind.CLIENT, attributes });
  span.end();

  return captured.captured[0];
}

describe('RedactingSpanExporter', () => {
  it('redacts access tokens from url.full and url.query', () => {
    const delegate = new CapturingExporter();
    const exporter = new RedactingSpanExporter(delegate);

    exporter.export(
      [
        endedSpanWith({
          'url.full': `https://api.mapbox.com/tokens/v2/testuser?access_token=${SECRET}`,
          'url.query': `access_token=${SECRET}`
        })
      ],
      () => {}
    );

    const attributes = delegate.captured[0].attributes;
    expect(attributes['url.full']).toBe(
      `https://api.mapbox.com/tokens/v2/testuser?access_token=${MASKED}`
    );
    expect(attributes['url.query']).toBe(`access_token=${MASKED}`);
    expect(
      Object.values(attributes).filter((value) =>
        String(value).includes(SECRET)
      )
    ).toEqual([]);
  });

  it('redacts tokens regardless of which attribute carries them', () => {
    const delegate = new CapturingExporter();
    const exporter = new RedactingSpanExporter(delegate);

    exporter.export(
      [
        endedSpanWith({
          'some.future.url.attribute': `https://api.mapbox.com/styles/v1/u?access_token=${SECRET}&limit=5`
        })
      ],
      () => {}
    );

    expect(delegate.captured[0].attributes['some.future.url.attribute']).toBe(
      `https://api.mapbox.com/styles/v1/u?access_token=${MASKED}&limit=5`
    );
  });

  it('preserves span identity and non-sensitive attributes', () => {
    const delegate = new CapturingExporter();
    const exporter = new RedactingSpanExporter(delegate);
    const original = endedSpanWith({
      'url.full': `https://api.mapbox.com/tokens/v2/testuser?access_token=${SECRET}`,
      'server.address': 'api.mapbox.com',
      'http.response.status_code': 200
    });

    exporter.export([original], () => {});

    const exported = delegate.captured[0];
    expect(exported.name).toBe(original.name);
    expect(exported.kind).toBe(original.kind);
    expect(exported.spanContext()).toEqual(original.spanContext());
    expect(exported.startTime).toEqual(original.startTime);
    expect(exported.endTime).toEqual(original.endTime);
    expect(exported.duration).toEqual(original.duration);
    expect(exported.ended).toBe(true);
    expect(exported.resource).toBe(original.resource);
    expect(exported.status).toEqual(original.status);
    expect(exported.attributes['server.address']).toBe('api.mapbox.com');
    expect(exported.attributes['http.response.status_code']).toBe(200);
  });

  it('passes spans through untouched when nothing needs redaction', () => {
    const delegate = new CapturingExporter();
    const exporter = new RedactingSpanExporter(delegate);
    const original = endedSpanWith({ 'server.address': 'api.mapbox.com' });

    exporter.export([original], () => {});

    expect(delegate.captured[0]).toBe(original);
  });

  it('reports the delegate export result to the caller', () => {
    const delegate = new CapturingExporter();
    const exporter = new RedactingSpanExporter(delegate);
    const resultCallback = vi.fn();

    exporter.export([endedSpanWith({})], resultCallback);

    expect(resultCallback).toHaveBeenCalledWith({
      code: ExportResultCode.SUCCESS
    });
  });

  it('delegates shutdown and forceFlush', async () => {
    const delegate = new CapturingExporter();
    const shutdown = vi.spyOn(delegate, 'shutdown');
    const forceFlush = vi.spyOn(delegate, 'forceFlush');
    const exporter = new RedactingSpanExporter(delegate);

    await exporter.forceFlush();
    await exporter.shutdown();

    expect(forceFlush).toHaveBeenCalledOnce();
    expect(shutdown).toHaveBeenCalledOnce();
  });
});
