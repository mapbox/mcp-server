import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  root: resolve(__dirname, 'interactive-map'),
  plugins: [viteSingleFile()],
  build: {
    rollupOptions: {
      input: resolve(__dirname, 'interactive-map/interactive-map.html')
    },
    outDir: resolve(__dirname, '../dist/ui'),
    emptyOutDir: false
  }
});
