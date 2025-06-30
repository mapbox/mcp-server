import { patchGlobalFetch, cleanup } from './requestUtils.js';

describe('requestUtils', () => {
  let originalGlobalFetch: typeof global.fetch;

  beforeEach(() => {
    // Save original fetch
    originalGlobalFetch = global.fetch;
  });

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalGlobalFetch;
    cleanup();
  });

  describe('patchGlobalFetch', () => {
    it('should handle case when global.fetch is undefined at module load time', () => {
      // Simulate scenario where global.fetch doesn't exist initially
      delete (global as any).fetch;
      delete (globalThis as any).fetch;

      // This should throw because no fetch is available
      expect(() => {
        patchGlobalFetch({
          name: 'TestServer',
          version: '1.0.0',
          sha: 'abcdef',
          tag: 'no-tag',
          branch: 'default'
        });
      }).toThrow('No fetch implementation available');
    });

    it('should properly initialize originalFetch before patching', async () => {
      // Mock fetch function
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true })
      });

      global.fetch = mockFetch;

      // Patch global fetch
      patchGlobalFetch({
        name: 'TestServer',
        version: '1.0.0',
        sha: 'abcdef',
        tag: 'no-tag',
        branch: 'default'
      });

      // Make a fetch call
      await global.fetch('https://example.com', {
        headers: { 'Custom-Header': 'test' }
      });

      // Verify that the original fetch was called with User-Agent added
      expect(mockFetch).toHaveBeenCalledWith('https://example.com', {
        headers: {
          'Custom-Header': 'test',
          'User-Agent': 'TestServer/1.0.0 (default, no-tag, abcdef)'
        }
      });
    });

    it('should not throw originalFetch is not a function error', async () => {
      // Mock a scenario where fetch might be called before proper initialization
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true })
      });

      global.fetch = mockFetch;

      patchGlobalFetch({
        name: 'TestServer',
        version: '1.0.0',
        sha: 'abcdef',
        tag: 'no-tag',
        branch: 'default'
      });

      // This should not throw "originalFetch is not a function"
      await expect(global.fetch('https://example.com')).resolves.toBeDefined();
    });

    it('should handle multiple patch calls without breaking', () => {
      const mockFetch = jest.fn();
      global.fetch = mockFetch;

      // First patch
      patchGlobalFetch({
        name: 'TestServer',
        version: '1.0.0',
        sha: 'abcdef',
        tag: 'no-tag',
        branch: 'default'
      });

      // Second patch (should not break)
      patchGlobalFetch({
        name: 'TestServer2',
        version: '2.0.0',
        sha: 'abcdef2',
        tag: 'v2',
        branch: 'main'
      });

      // Should still work
      expect(typeof global.fetch).toBe('function');
    });

    it('should restore original fetch on cleanup', () => {
      const mockFetch = jest.fn();
      global.fetch = mockFetch;

      patchGlobalFetch({
        name: 'TestServer',
        version: '1.0.0',
        sha: 'abcdef',
        tag: 'no-tag',
        branch: 'default'
      });

      // Verify fetch was patched
      expect(global.fetch).not.toBe(mockFetch);

      // Cleanup should restore original
      cleanup();
      expect(global.fetch).toBe(mockFetch);
    });
  });
});
