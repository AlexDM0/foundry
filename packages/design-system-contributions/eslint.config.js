import { join } from 'node:path';

import base       from '@reliquary/eslint-config';
import reactHooks from 'eslint-plugin-react-hooks';

const TYPESCRIPT_FILES = ['**/*.{ts,tsx}'];

const SPECS_STORIES_AND_TESTING = ['**/*.spec.ts', '**/*.dom.tsx', '**/*.stories.tsx', 'testing/**/*.ts', '.storybook/**/*.ts'];

/** The package's own manifest and the workspace root's, which holds the dev tools every workspace shares. */
const MANIFEST_FOLDERS = [import.meta.dirname, join(import.meta.dirname, '..', '..')];

const MARKUP_MESSAGE = 'The package renders every value through React, which escapes it; it injects no markup as text.';

export default [
  ...base,
  { ignores: ['**/*.js', 'node_modules/**'] },
  {
    // The specs, stories and test helpers run on the workspace root's dev tools; nothing that ships may import them.
    files: SPECS_STORIES_AND_TESTING,
    rules: { 'import/no-extraneous-dependencies': ['error', { devDependencies: true, packageDir: MANIFEST_FOLDERS }] },
  },
  {
    // The design-system package is a peer that the workspace links, so the shipping files resolve it from the package's peers.
    files:   TYPESCRIPT_FILES,
    ignores: SPECS_STORIES_AND_TESTING,
    rules:   { 'import/no-extraneous-dependencies': ['error', { peerDependencies: true, packageDir: MANIFEST_FOLDERS }] },
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
    files:   TYPESCRIPT_FILES,
    plugins: { 'react-hooks': reactHooks },
    rules:   {
      ...reactHooks.configs.flat.recommended.rules,
      'react-hooks/exhaustive-deps': 'error',
      'no-restricted-syntax':        [
        'error',
        { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: MARKUP_MESSAGE },
        { selector: "AssignmentExpression > MemberExpression.left[property.name=/^(innerHTML|outerHTML)$/]", message: MARKUP_MESSAGE },
      ],
    },
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
  {
    files:   TYPESCRIPT_FILES,
    ignores: SPECS_STORIES_AND_TESTING,
    rules:   {
      '@typescript-eslint/no-magic-numbers': ['error', {
        // Arithmetic identities stay inline: a step, a halving, the hexadecimal radix, a percent.
        ignore:                        [-1, 0, 1, 2, 16, 100],
        ignoreArrayIndexes:            true,
        ignoreDefaultValues:           true,
        ignoreEnums:                   true,
        ignoreNumericLiteralTypes:     true,
        ignoreReadonlyClassProperties: true,
        ignoreTypeIndexes:             true,
      }],
    },
  },
];
