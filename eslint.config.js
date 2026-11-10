import ts from 'typescript-eslint';
export default [
  { ignores: ['dist/**', 'node_modules/**', 'vendor/**', '.npm-cache/**'] },
  ...ts.configs.recommended.map((config) => ({
    ...config,
    files: ['src/**/*.ts', 'vite.config.ts'],
  })),
];
