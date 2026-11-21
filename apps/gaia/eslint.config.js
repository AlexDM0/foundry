import { join } from 'node:path';

import base       from '@reliquary/eslint-config';
import reactHooks from 'eslint-plugin-react-hooks';

const TYPESCRIPT_FILES = ['**/*.{ts,tsx}'];

const SPECS_AND_TESTING_FOLDERS = ['**/*.spec.ts', '**/*.spec.tsx', '**/*.dom.tsx', '**/testing/**/*.ts'];

/** Gaia's own manifest and the workspace root's, which holds the dev tools every workspace shares. */
const MANIFEST_FOLDERS = [import.meta.dirname, join(import.meta.dirname, '..', '..')];

const RAW_MARKUP_MESSAGE = 'React escapes every value; never set raw markup.';

const CLOCK_MESSAGE = 'Take the clock as an injected `now`; a clock decides nothing.';

const BROWSER_STORAGE_SITES = ['page/board/preferences/PreferenceStore.ts', 'page/shell/ThemeBootstrap.ts', 'page/api/FleetStreamClient.ts'];

const BROWSER_STORAGE_MESSAGE = 'Reach browser storage through page/board/preferences/PreferenceStore.ts; only it, ThemeBootstrap and FleetStreamClient may.';

/** Each process or browser reach CLAUDE.md confines, with the exact files allowed to make it. */
const CONFINED_REACHES = [
  {
    allowedIn: ['src/services/Environment.ts'],
    property:  { object: 'process', property: 'env', message: 'Read the environment through src/services/Environment.ts.' },
  },
  {
    allowedIn: ['src/services/Environment.ts'],
    property:  { object: 'Bun', property: 'env', message: 'Read the environment through src/services/Environment.ts.' },
  },
  {
    allowedIn: ['src/Main.ts'],
    property:  { object: 'process', property: 'exit', message: 'Only src/Main.ts exits; return an exit code.' },
  },
  { allowedIn: [], property: { object: 'process', property: 'chdir', message: 'Never change the working directory; pass a directory instead.' } },
  {
    allowedIn:  ['src/services/Environment.ts'],
    importName: { name: 'node:os', importNames: ['homedir'], message: 'Take the home folder from src/services/Environment.ts.' },
  },
  ...['localStorage', 'sessionStorage'].flatMap((storageName) => [
    { allowedIn: BROWSER_STORAGE_SITES, global: { name: storageName, message: BROWSER_STORAGE_MESSAGE } },
    ...['window', 'globalThis', 'self'].map((owner) => ({
      allowedIn: BROWSER_STORAGE_SITES,
      property:  { object: owner, property: storageName, message: BROWSER_STORAGE_MESSAGE },
    })),
  ]),
];

function confinedReachRules(exemptFile) {
  const binding = CONFINED_REACHES.filter((reach) => !reach.allowedIn.includes(exemptFile));
  const restrictedGlobals = binding.filter((reach) => reach.global).map((reach) => reach.global);
  return {
    'no-restricted-properties': ['error', ...binding.filter((reach) => reach.property).map((reach) => reach.property)],
    'no-restricted-imports':    ['error', { paths: binding.filter((reach) => reach.importName).map((reach) => reach.importName) }],
    // A severity alone keeps the options an earlier block gave, so a site allowed every global turns the rule off.
    'no-restricted-globals':    restrictedGlobals.length === 0 ? 'off' : ['error', ...restrictedGlobals],
  };
}

const CONFINED_REACH_SITES = [...new Set(CONFINED_REACHES.flatMap((reach) => reach.allowedIn))];

export default [
  ...base,
  { ignores: ['**/*.js', 'node_modules/**', '.claude/**', '.scratch/**', '.forge/**', '.forge-worktrees/**', '.turbo/**', 'design_handoff*/**'] },
  {
    // Test-only helpers may import devDependencies; nothing that ships may import these folders.
    files: SPECS_AND_TESTING_FOLDERS,
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
  { files: TYPESCRIPT_FILES, rules: confinedReachRules(null) },
  ...CONFINED_REACH_SITES.map((site) => ({ files: [site], rules: confinedReachRules(site) })),
  {
    // The clock is read in one module, as the environment is, and handed to every other as an injected `now`.
    files:   ['src/**/*.ts'],
    ignores: [...SPECS_AND_TESTING_FOLDERS, 'src/services/Clock.ts'],
    rules:   {
      'no-restricted-syntax': [
        'error',
        { selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']", message: CLOCK_MESSAGE },
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: CLOCK_MESSAGE },
        { selector: "CallExpression[callee.object.name='performance'][callee.property.name='now']", message: CLOCK_MESSAGE },
      ],
    },
  },
  {
    files:   ['page/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules:   {
      ...reactHooks.configs.flat.recommended.rules,
      'react-hooks/exhaustive-deps': 'error',
      'no-restricted-syntax':        [
        'error',
        { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: RAW_MARKUP_MESSAGE },
        { selector: "AssignmentExpression > MemberExpression.left[property.name=/^(innerHTML|outerHTML)$/]", message: RAW_MARKUP_MESSAGE },
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
    ignores: [...SPECS_AND_TESTING_FOLDERS, '**/constants/**/*.ts'],
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
