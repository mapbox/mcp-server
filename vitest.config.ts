import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 1200000,
    hookTimeout: 1200000,
    reporters: ['default', 'junit'],
    outputFile: {
      junit: 'test-results.xml'
    },
    watch: false,
    include: ['test/**/*.test.ts'],
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/**/*-cjs.cts', 'vitest*.config.ts'],
      provider: 'istanbul',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: 'coverage'
    }
  }
});
