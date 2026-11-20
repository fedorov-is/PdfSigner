import { spawn } from 'node:child_process';
import { preview } from 'vite';
// Own the preview server in this process so Windows teardown needs no process-tree kill.
const server = await preview({
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
});
const child = spawn(
  process.execPath,
  ['node_modules/@playwright/test/cli.js', 'test'],
  { stdio: 'inherit' },
);
child.on('exit', (code) => {
  server.httpServer.closeAllConnections();
  server.httpServer.close();
  process.exitCode = code ?? 1;
});
