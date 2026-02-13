import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 60000,
    hookTimeout: 60000,
    reporters: ['default', 'junit'],
    outputFile: {
      junit: 'test-results.xml'
    },
    watch: false,
    include: ['test/**/*.test.ts'],
    exclude: ['test/functional/**'],
    coverage: {
      include: ['src/**/*.ts'],
      exclude: ['src/**/*-cjs.cts', 'vitest*.config.ts'],
      provider: 'istanbul',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: 'coverage'
    }
  }
});
