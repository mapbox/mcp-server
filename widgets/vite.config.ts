import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import fg from 'fast-glob';
import path from 'node:path';

function buildInputs(): Record<string, string> {
  const files = fg.sync('src/**/index.{tsx,jsx}', { dot: false });
  return Object.fromEntries(
    files.map((f) => [path.basename(path.dirname(f)), path.resolve(f)])
  );
}

const inputs = buildInputs();

export default defineConfig({
  // Use singlefile plugin in production to inline all assets into HTML
  plugins: [tailwindcss(), react(), viteSingleFile()],
  cacheDir: 'node_modules/.vite-react',
  server: {
    port: 4444,
    strictPort: true,
    cors: true
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
    target: 'es2022'
  },
  build: {
    target: 'es2022',
    sourcemap: false, // Disable sourcemaps for singlefile output
    minify: 'esbuild',
    outDir: 'dist',
    assetsDir: '.',
    cssCodeSplit: false, // Required for singlefile
    rollupOptions: {
      input: inputs,
      preserveEntrySignatures: 'strict',
      output: {
        inlineDynamicImports: true // Required for singlefile
      }
    }
  }
});
