// Copyright (c) Mapbox, Inc.
// Licensed under the MIT License.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initializeTracing,
  shutdownTracing,
  isTracingInitialized,
  getTracer,
  createToolSpan,
  createHttpSpan,
  markSpanSuccess,
  markSpanError,
  validateJwtForTracing,
  getObjectSize
} from '../../src/utils/tracing.js';

// Mock the OpenTelemetry modules to avoid actual tracing in tests
vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined)
  }))
}));

vi.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: vi.fn().mockReturnValue({
      startSpan: vi.fn().mockReturnValue({
        setAttributes: vi.fn(),
        setStatus: vi.fn(),
        recordException: vi.fn(),
        end: vi.fn()
      })
    })
  },
  SpanStatusCode: {
    OK: 1,
    ERROR: 2
  },
  SpanKind: {
    INTERNAL: 0,
    CLIENT: 3
  }
}));

describe('tracing utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (isTracingInitialized()) {
      await shutdownTracing();
    }
  });

  describe('initialization', () => {
    it('should skip initialization in test environment', async () => {
      // Should not initialize in test environment
      await initializeTracing();
      expect(isTracingInitialized()).toBe(false);
    });

    it('should handle initialization errors gracefully', async () => {
      // Mock environment to not be test
      const originalNodeEnv = process.env.NODE_ENV;
      const originalVitest = process.env.VITEST;

      delete process.env.NODE_ENV;
      delete process.env.VITEST;

      try {
        // This should not throw even if initialization fails
        await initializeTracing();
        // We can't test actual initialization due to mocking
      } catch (error) {
        // Should not throw
        expect(error).toBeUndefined();
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
        process.env.VITEST = originalVitest;
      }
    });
  });

  describe('tracer access', () => {
    it('should return a tracer instance', () => {
      const tracer = getTracer();
      expect(tracer).toBeDefined();
      expect(tracer.startSpan).toBeDefined();
    });
  });

  describe('span creation', () => {
    it('should create tool span with basic attributes', () => {
      const tracer = getTracer();
      const mockSpan = {
        setAttributes: vi.fn(),
        setStatus: vi.fn(),
        recordException: vi.fn(),
        end: vi.fn()
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(tracer.startSpan).mockReturnValue(mockSpan as any);

      const span = createToolSpan('test_tool', 1024);
      expect(tracer.startSpan).toHaveBeenCalledWith('tool.test_tool', {
        kind: expect.any(Number),
        attributes: {
          'tool.name': 'test_tool',
          'tool.input.size': 1024,
          'operation.type': 'tool_execution'
        }
      });
      expect(span).toBe(mockSpan);
    });

    it('should create tool span with session context', () => {
      const tracer = getTracer();
      const mockSpan = {
        setAttributes: vi.fn(),
        setStatus: vi.fn(),
        recordException: vi.fn(),
        end: vi.fn()
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(tracer.startSpan).mockReturnValue(mockSpan as any);

      const _span = createToolSpan('test_tool', 1024, {
        sessionId: 'session-123',
        userId: 'user-456',
        accountId: 'account-789'
      });

      expect(tracer.startSpan).toHaveBeenCalledWith('tool.test_tool', {
        kind: expect.any(Number),
        attributes: {
          'tool.name': 'test_tool',
          'tool.input.size': 1024,
          'operation.type': 'tool_execution',
          'session.id': 'session-123',
          'user.id': 'user-456',
          'account.id': 'account-789'
        }
      });
    });

    it('should create HTTP span with basic attributes', () => {
      const tracer = getTracer();
      const mockSpan = {
        setAttributes: vi.fn(),
        setStatus: vi.fn(),
        recordException: vi.fn(),
        end: vi.fn()
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(tracer.startSpan).mockReturnValue(mockSpan as any);

      const _span = createHttpSpan('POST', 'https://example.com/api');
      expect(tracer.startSpan).toHaveBeenCalledWith('http.post', {
        kind: expect.any(Number),
        attributes: {
          'http.method': 'POST',
          'http.url': 'https://example.com/api',
          'operation.type': 'http_request'
        }
      });
    });
  });

  describe('span completion', () => {
    it('should mark span as successful', () => {
      const mockSpan = {
        setAttributes: vi.fn(),
        setStatus: vi.fn(),
        recordException: vi.fn(),
        end: vi.fn()
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      markSpanSuccess(mockSpan as any, {
        'custom.attr': 'value'
      });

      expect(mockSpan.setAttributes).toHaveBeenCalledWith({
        'custom.attr': 'value'
      });
      expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 1 }); // SpanStatusCode.OK
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should mark span as failed with error', () => {
      const mockSpan = {
        setAttributes: vi.fn(),
        setStatus: vi.fn(),
        recordException: vi.fn(),
        end: vi.fn()
      };

      const error = new Error('Test error');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      markSpanError(mockSpan as any, error);

      expect(mockSpan.setAttributes).toHaveBeenCalledWith({
        'error.type': 'Error',
        'error.message': 'Test error'
      });
      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: 2, // SpanStatusCode.ERROR
        message: 'Test error'
      });
      expect(mockSpan.end).toHaveBeenCalled();
    });

    it('should mark span as failed with string error', () => {
      const mockSpan = {
        setAttributes: vi.fn(),
        setStatus: vi.fn(),
        recordException: vi.fn(),
        end: vi.fn()
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      markSpanError(mockSpan as any, 'String error');

      expect(mockSpan.setAttributes).toHaveBeenCalledWith({
        'error.type': 'Error',
        'error.message': 'String error'
      });
      expect(mockSpan.recordException).not.toHaveBeenCalled();
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: 2, // SpanStatusCode.ERROR
        message: 'String error'
      });
    });
  });

  describe('JWT validation for tracing', () => {
    it('should validate valid JWT format', () => {
      const validJwt =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const result = validateJwtForTracing(validJwt);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should handle invalid JWT format', () => {
      const result = validateJwtForTracing('invalid.jwt');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid JWT format');
    });

    it('should handle malformed JWT encoding', () => {
      const result = validateJwtForTracing('invalid.invalid.invalid');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Invalid JWT encoding');
    });

    it('should handle no token as valid', () => {
      const result = validateJwtForTracing();
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  describe('object size calculation', () => {
    it('should calculate size of simple objects', () => {
      expect(getObjectSize({ name: 'test' })).toBeGreaterThan(0);
      expect(getObjectSize('hello')).toBe(7); // JSON.stringify('hello').length
      expect(getObjectSize(123)).toBe(3); // JSON.stringify(123).length
    });

    it('should handle circular references gracefully', () => {
      const circular: Record<string, unknown> = { name: 'test' };
      circular.self = circular;

      // Should return 0 for objects that can't be stringified
      expect(getObjectSize(circular)).toBe(0);
    });

    it('should handle complex objects', () => {
      const complex = {
        array: [1, 2, 3],
        nested: { deep: { value: 'test' } },
        number: 42,
        string: 'hello world'
      };

      const size = getObjectSize(complex);
      expect(size).toBeGreaterThan(0);
      expect(size).toBe(JSON.stringify(complex).length);
    });
  });
});
