import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/e2e',
  outputDir: './test/results',
  workers: 1,
  use: { channel: 'chrome', baseURL: 'http://127.0.0.1:4173' },
});
