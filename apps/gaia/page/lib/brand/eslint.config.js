import { join } from 'node:path';

import base from '@reliquary/eslint-config';

const TYPESCRIPT_FILES = ['**/*.{ts,tsx}'];

const TEST_AND_STORY_FILES = ['**/*.spec.ts', '**/*.dom.tsx', '**/*.stories.tsx', 'testing/**/*.ts', '.storybook/**/*.ts'];

/** The library has no manifest of its own: its host's manifest, and the workspace root's, which holds the dev tools every workspace shares. */
const MANIFEST_FOLDERS = [join(import.meta.dirname, '..', '..', '..'), join(import.meta.dirname, '..', '..', '..', '..', '..')];

export default [
  ...base,
  { ignores: ['**/*.js', 'node_modules/**'] },
  {
    files: TEST_AND_STORY_FILES,
    rules: { 'import/no-extraneous-dependencies': ['error', { devDependencies: true, packageDir: MANIFEST_FOLDERS }] },
  },
  { files: TYPESCRIPT_FILES, rules: { 'import/enforce-node-protocol-usage': ['error', 'always'] } },
  { files: TYPESCRIPT_FILES, rules: { '@stylistic/no-trailing-spaces': 'error' } },
  { files: TYPESCRIPT_FILES, rules: { '@stylistic/linebreak-style': ['error', 'unix'] } },
  {
    // One style for local specifiers: the full file name.
    files:    TYPESCRIPT_FILES,
    settings: { 'import/resolver': { node: { extensions: ['.ts', '.tsx'] } } },
    rules:    { 'import/extensions': ['error', 'always', { ignorePackages: true }] },
  },
  {
    files: TYPESCRIPT_FILES,
    rules: {
      '@typescript-eslint/no-non-null-assertion':   'error',
      '@typescript-eslint/no-explicit-any':         'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-warning-comments':                        ['error', { terms: ['todo', 'fixme', 'xxx', 'hack'], location: 'anywhere' }],
      'id-length':                                  ['error', { min: 2, exceptions: ['i', 'a', 'b'], properties: 'never' }],
    },
  },
];
