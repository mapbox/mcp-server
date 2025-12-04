import { build, type InlineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fg from 'fast-glob';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import tailwindcss from '@tailwindcss/vite';
import { parseEnv } from 'node:util';

// Read package.json for version
const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf-8')) as { version: string };

// Load MAPBOX_ACCESS_TOKEN from parent directory's .env file
const parentEnvPath = path.resolve('..', '.env');
if (fs.existsSync(parentEnvPath)) {
  const envFile = fs.readFileSync(parentEnvPath, 'utf-8');
  const parsed = parseEnv(envFile);
  if (parsed.MAPBOX_ACCESS_TOKEN && !process.env.VITE_MAPBOX_ACCESS_TOKEN) {
    process.env.VITE_MAPBOX_ACCESS_TOKEN = parsed.MAPBOX_ACCESS_TOKEN;
    console.log('Loaded MAPBOX_ACCESS_TOKEN from parent .env file');
  }
}

const entries = fg.sync('src/**/index.{tsx,jsx}');
const outDir = 'dist';

const PER_ENTRY_CSS_GLOB = '**/*.{css,pcss,scss,sass}';
const PER_ENTRY_CSS_IGNORE = '**/*.module.*'.split(',').map((s) => s.trim());
const GLOBAL_CSS_LIST = [path.resolve('src/index.css')];

// Only build specific widget targets
const targets: string[] = ['map-widget'];
const builtNames: string[] = [];

function wrapEntryPlugin(
  virtualId: string,
  entryFile: string,
  cssPaths: string[]
): Plugin {
  return {
    name: `virtual-entry-wrapper:${entryFile}`,
    resolveId(id) {
      if (id === virtualId) return id;
    },
    load(id) {
      if (id !== virtualId) {
        return null;
      }

      const cssImports = cssPaths
        .map((css) => `import ${JSON.stringify(css)};`)
        .join('\n');

      return `
    ${cssImports}
    export * from ${JSON.stringify(entryFile)};

    import * as __entry from ${JSON.stringify(entryFile)};
    export default (__entry.default ?? __entry.App);

    import ${JSON.stringify(entryFile)};
  `;
    }
  };
}

fs.rmSync(outDir, { recursive: true, force: true });

for (const file of entries) {
  const name = path.basename(path.dirname(file));
  if (targets.length && !targets.includes(name)) {
    continue;
  }

  const entryAbs = path.resolve(file);
  const entryDir = path.dirname(entryAbs);

  // Collect CSS for this entry using the glob(s) rooted at its directory
  const perEntryCss = fg.sync(PER_ENTRY_CSS_GLOB, {
    cwd: entryDir,
    absolute: true,
    dot: false,
    ignore: PER_ENTRY_CSS_IGNORE
  });

  // Global CSS (Tailwind, etc.), only include those that exist
  const globalCss = GLOBAL_CSS_LIST.filter((p) => fs.existsSync(p));

  // Final CSS list (global first for predictable cascade)
  const cssToInclude = [...globalCss, ...perEntryCss].filter((p) =>
    fs.existsSync(p)
  );

  const virtualId = `\0virtual-entry:${entryAbs}`;

  const createConfig = (): InlineConfig => ({
    plugins: [
      wrapEntryPlugin(virtualId, entryAbs, cssToInclude),
      tailwindcss(),
      react(),
      {
        name: 'remove-manual-chunks',
        outputOptions(options) {
          if ('manualChunks' in options) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            delete (options as any).manualChunks;
          }
          return options;
        }
      }
    ],
    esbuild: {
      jsx: 'automatic',
      jsxImportSource: 'react',
      target: 'es2022'
    },
    build: {
      target: 'es2022',
      outDir,
      emptyOutDir: false,
      chunkSizeWarningLimit: 2000,
      minify: 'esbuild',
      cssCodeSplit: false,
      rollupOptions: {
        input: virtualId,
        output: {
          format: 'es',
          entryFileNames: `${name}.js`,
          inlineDynamicImports: true,
          assetFileNames: (info) =>
            (info.name || '').endsWith('.css')
              ? `${name}.css`
              : `[name]-[hash][extname]`
        },
        preserveEntrySignatures: 'allow-extension',
        treeshake: true
      }
    }
  });

  console.group(`Building ${name} (react)`);
  await build(createConfig());
  console.groupEnd();
  builtNames.push(name);
  console.log(`Built ${name}`);
}

const outputs = fs
  .readdirSync('dist')
  .filter((f) => f.endsWith('.js') || f.endsWith('.css'))
  .map((f) => path.join('dist', f))
  .filter((p) => fs.existsSync(p));

const h = crypto
  .createHash('sha256')
  .update(pkg.version, 'utf8')
  .digest('hex')
  .slice(0, 4);

console.group('Hashing outputs');
for (const out of outputs) {
  const dir = path.dirname(out);
  const ext = path.extname(out);
  const base = path.basename(out, ext);
  const newName = path.join(dir, `${base}-${h}${ext}`);

  fs.renameSync(out, newName);
  console.log(`${out} -> ${newName}`);
}
console.groupEnd();

console.log('new hash: ', h);

// Generate self-contained HTML files with inlined JS and CSS
// This is required for ChatGPT widget resources served via MCP
console.group('Generating self-contained HTML files');
for (const name of builtNames) {
  const dir = outDir;
  const jsPath = path.join(dir, `${name}-${h}.js`);
  const cssPath = path.join(dir, `${name}-${h}.css`);
  const hashedHtmlPath = path.join(dir, `${name}-${h}.html`);
  const liveHtmlPath = path.join(dir, `${name}.html`);

  // Read JS and CSS content
  const jsContent = fs.existsSync(jsPath) ? fs.readFileSync(jsPath, 'utf8') : '';
  const cssContent = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';

  // Create self-contained HTML with inlined JS and CSS
  const html = `<!doctype html>
<html style="height: 100%; margin: 0;">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${cssContent}</style>
</head>
<body style="height: 100%; margin: 0;">
  <div id="${name}-root" style="width: 100%; height: 100%; position: absolute; top: 0; left: 0;"></div>
  <script type="module">${jsContent}</script>
</body>
</html>
`;
  fs.writeFileSync(hashedHtmlPath, html, { encoding: 'utf8' });
  fs.writeFileSync(liveHtmlPath, html, { encoding: 'utf8' });
  console.log(`Created ${liveHtmlPath} (self-contained, ${Math.round(html.length / 1024)}KB)`);
}
console.groupEnd();
