/* Offline build used when Vite is not available: bundles the app with esbuild, compiles Tailwind v4 through its
   JavaScript API, and writes one self-contained HTML file to standalone/index.html.
   Usage: node scripts/build-standalone.mjs   (set NODE_PATH to a node_modules containing react, react-dom, esbuild, tailwindcss) */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const nodePath = (process.env.NODE_PATH || '').split(':').filter(Boolean);
const req = createRequire(join(nodePath[0] || root, 'x.js'));
const esbuild = req('esbuild');
const twDir = dirname(req.resolve('tailwindcss/package.json'));
const { compile } = await import(pathToFileURL(join(twDir, 'dist/lib.mjs')).href);

/* ---- JavaScript ---- */
const js = await esbuild.build({
  entryPoints: [join(root, 'src/main.tsx')], bundle: true, write: false, minify: true, format: 'iife', target: 'es2020',
  jsx: 'automatic', loader: { '.css': 'empty' }, nodePaths: nodePath, define: { 'process.env.NODE_ENV': '"production"' }, legalComments: 'none',
});
const script = js.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

/* ---- Tailwind: scan sources for class candidates ---- */
function walk(dir) { return readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; }); }
const candidates = new Set();
for (const f of [...walk(join(root, 'src')).filter(f => /\.(tsx?|html)$/.test(f)), join(root, 'index.html')]) {
  for (const m of readFileSync(f, 'utf8').matchAll(/[^\s"'`<>={}()\;]+/g)) candidates.add(m[0]);
}
const css = readFileSync(join(root, 'src/styles/app.css'), 'utf8');
const compiler = await compile(css, {
  base: join(root, 'src/styles'),
  loadStylesheet: async (id, base) => {
    const file = id === 'tailwindcss' ? join(twDir, 'index.css') : id.startsWith('tailwindcss/') ? join(twDir, id.slice('tailwindcss/'.length) + '.css') : resolve(base, id);
    return { path: file, base: dirname(file), content: readFileSync(file, 'utf8') };
  },
});
const built = compiler.build([...candidates]);
const minCss = (await esbuild.transform(built, { loader: 'css', minify: true })).code;

const html = readFileSync(join(root, 'index.html'), 'utf8')
  .replace(/<script type="module"[^>]*><\/script>/, '')
  .replace('</head>', `<style>${minCss}</style>\n</head>`)
  .replace('</body>', `<script>${script}</script>\n</body>`);
mkdirSync(join(root, 'standalone'), { recursive: true });
writeFileSync(join(root, 'standalone/index.html'), html);
console.log(`standalone/index.html  ${(html.length / 1024).toFixed(0)} KB  (js ${(script.length / 1024).toFixed(0)} KB, css ${(minCss.length / 1024).toFixed(0)} KB)`);
if (existsSync(join(root, 'public/data'))) console.log('Note: public/data is not inlined; publish it next to the page to enable bundled game data.');
