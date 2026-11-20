import ts from 'typescript-eslint';
export default [
  {
    ignores: [
      'src/build/**',
      'node_modules/**',
      'public/vendor/**',
      'test/results/**',
    ],
  },
  ...ts.configs.recommended.map((config) => ({
    ...config,
    files: ['src/**/*.ts', 'vite.config.ts'],
  })),
];
