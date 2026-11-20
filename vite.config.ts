import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { cpSync, writeFileSync } from 'node:fs';
import { csp, securityHeaders } from './src/scripts/security.mjs';
export default defineConfig({
  root: 'src',
  publicDir: '../public',
  build: { outDir: 'build/dist', emptyOutDir: true },
  base: './',
  server: { host: '127.0.0.1', port: 5173 },
  preview: { headers: securityHeaders },
  plugins: [
    {
      name: 'release-security',
      apply: 'build',
      transformIndexHtml() {
        return [
          {
            tag: 'meta',
            attrs: { 'http-equiv': 'Content-Security-Policy', content: csp },
            injectTo: 'head-prepend',
          },
        ];
      },
    },
    {
      name: 'local-assets',
      closeBundle() {
        writeFileSync(
          'src/build/dist/_headers',
          '/*\n' +
            Object.entries(securityHeaders)
              .map(([key, value]) => `  ${key}: ${value}`)
              .join('\n') +
            '\n',
        );
        for (const folder of ['cmaps', 'standard_fonts', 'wasm'])
          cpSync(
            `node_modules/pdfjs-dist/${folder}`,
            `src/build/dist/pdfjs/${folder}`,
            {
              recursive: true,
            },
          );
        cpSync(
          'node_modules/pdfjs-dist/LICENSE',
          'src/build/dist/pdfjs/LICENSE',
        );
      },
      configureServer(server) {
        server.middlewares.use('/pdfjs', async (req, res, next) => {
          const { readFile } = await import('node:fs/promises');
          const path = decodeURIComponent((req.url ?? '').split('?')[0]);
          if (!/^\/(cmaps|standard_fonts|wasm)\/[\w.-]+$/.test(path))
            return next();
          try {
            res.setHeader(
              'Content-Type',
              path.endsWith('.wasm')
                ? 'application/wasm'
                : 'application/octet-stream',
            );
            res.end(
              await readFile(resolve('node_modules/pdfjs-dist', `.${path}`)),
            );
          } catch {
            next();
          }
        });
      },
    },
  ],
});
