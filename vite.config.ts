import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { csp, securityHeaders } from './scripts/security.mjs';
export default defineConfig({
  base: './', server: { host: '127.0.0.1', port: 5173 },
  preview: { headers: securityHeaders },
  plugins: [{ name: 'release-security', apply: 'build', transformIndexHtml() {
    return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp }, injectTo: 'head-prepend' }];
  } }, { name: 'local-assets', closeBundle() {
    writeFileSync('dist/_headers', '/*\n' + Object.entries(securityHeaders).map(([key, value]) => `  ${key}: ${value}`).join('\n') + '\n');
    mkdirSync('dist/vendor', { recursive: true });
    cpSync('vendor/cadesplugin_api.js', 'dist/vendor/cadesplugin_api.js');
    for (const folder of ['cmaps', 'standard_fonts', 'wasm']) cpSync(`node_modules/pdfjs-dist/${folder}`, `dist/pdfjs/${folder}`, { recursive: true });
    cpSync('node_modules/pdfjs-dist/LICENSE', 'dist/pdfjs/LICENSE');
  }, configureServer(server) {
    server.middlewares.use('/pdfjs', async (req, res, next) => {
      const { readFile } = await import('node:fs/promises');
      const path = decodeURIComponent((req.url ?? '').split('?')[0]);
      if (!/^\/(cmaps|standard_fonts|wasm)\/[\w.-]+$/.test(path)) return next();
      try { res.setHeader('Content-Type', path.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream'); res.end(await readFile(resolve('node_modules/pdfjs-dist', `.${path}`))); } catch { next(); }
    });
  } }],
  build: { rollupOptions: { input: { main: resolve('index.html'), lab: resolve('lab.html') } } },
});
