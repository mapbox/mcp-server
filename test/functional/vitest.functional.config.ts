import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30000,
    hookTimeout: 30000,
    reporters: ['default', 'junit'],
    outputFile: {
      junit: 'test-results-functional.xml'
    },
    watch: false,
    include: ['test/functional/**/*.test.ts']
  }
});
