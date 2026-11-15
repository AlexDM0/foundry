import { join } from 'node:path';

import base from '@reliquary/eslint-config';

const TYPESCRIPT_FILES = ['**/*.ts'];

export default [
  ...base,
  { ignores: ['**/*.js', 'node_modules/**'] },
  {
    // A spec may import the dev tools the workspace root shares; the contract modules import only the version model.
    files: ['**/*.spec.ts'],
    rules: { 'import/no-extraneous-dependencies': ['error', { devDependencies: true, packageDir: [import.meta.dirname, join(import.meta.dirname, '..', '..')] }] },
  },
  { files: TYPESCRIPT_FILES, rules: { 'import/enforce-node-protocol-usage': ['error', 'always'] } },
  {
    files:    TYPESCRIPT_FILES,
    settings: { 'import/resolver': { node: { extensions: ['.ts'] } } },
    rules:    { 'import/extensions': ['error', 'always', { ignorePackages: true }] },
  },
  {
    files: TYPESCRIPT_FILES,
    rules: {
      '@typescript-eslint/no-non-null-assertion':   'error',
      '@typescript-eslint/no-explicit-any':         'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'id-length':                                  ['error', { min: 2, exceptions: ['i', 'a', 'b'], properties: 'never' }],
    },
  },
];
