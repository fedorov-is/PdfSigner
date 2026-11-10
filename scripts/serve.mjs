import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';

const root = resolve('.');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
http.createServer(async (req, res) => {
  try {
    const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname === '/' ? '/index.html' : new URL(req.url, 'http://localhost').pathname));
    const relative = path.slice(root.length + 1).split(sep);
    if (!path.startsWith(root + sep) || relative.some(part => part.startsWith('.')) || !['index.html', 'styles.css', 'src', 'vendor'].includes(relative[0])) {
      res.writeHead(403).end(); return;
    }
    const content = await readFile(path);
    res.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(content);
  } catch { if (!res.headersSent) res.writeHead(404); res.end(); }
}).listen(5173, '127.0.0.1', () => console.log('Feasibility harness: http://127.0.0.1:5173'));
