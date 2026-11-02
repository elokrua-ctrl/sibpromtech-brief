// Запасная сборка в один HTML-файл через esbuild (без Vite).
// Основной способ — `npm run build` / `npm run build:single`.
// Использование: node scripts/build-single-esbuild.mjs [выходной.html]
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] ?? resolve(root, 'dist-single/index.html'));

const res = await build({
  entryPoints: [resolve(root, 'src/main.tsx')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  jsx: 'automatic',
  write: false,
  outdir: 'out',
  define: { 'process.env.NODE_ENV': '"production"' },
  nodePaths: (process.env.NODE_PATH ?? '').split(':').filter(Boolean),
  legalComments: 'none',
});

let js = '';
let css = '';
for (const f of res.outputFiles) {
  if (f.path.endsWith('.js')) js = f.text;
  if (f.path.endsWith('.css')) css = f.text;
}

const tpl = readFileSync(resolve(root, 'index.html'), 'utf8');
const html = tpl
  .replace('<script type="module" src="/src/main.tsx"></script>', () => `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`)
  .replace('</head>', () => `<style>${css}</style>\n  </head>`);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`OK: ${out} (${(html.length / 1024).toFixed(0)} КБ)`);
