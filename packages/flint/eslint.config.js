import { fileURLToPath } from 'node:url';

import base       from '@reliquary/eslint-config';
import reactHooks from 'eslint-plugin-react-hooks';

const PACKAGE_FOLDER = fileURLToPath(new URL('.', import.meta.url));

// The test packages are devDependencies of the workspace root, so a spec or test helper may import what either manifest names.
const MANIFEST_FOLDERS = [PACKAGE_FOLDER, fileURLToPath(new URL('../..', import.meta.url))];

const TYPESCRIPT_FILES = ['**/*.{ts,tsx}'];

const SPECS_AND_TESTING_FOLDERS = ['**/*.spec.ts', '**/*.dom.tsx', '**/testing/**/*.ts'];

const CLOCK_MESSAGE = 'flint/ reads no clock: time comes from the injected frame source.';
const MARKUP_MESSAGE = 'flint/ draws with createElementNS and setAttribute, never with markup as text.';
const REACH_MESSAGE = 'flint/ makes no network call and reads no browser storage: the host gives a storage port.';
const RUNTIME_MESSAGE = 'flint/ is a browser library: the host hands it every value of its runtime.';

/** The process and browser reaches the package never makes. A `shippingOnly` reach binds no spec or testing folder. */
const CONFINED_REACHES = [
  { shippingOnly: true, property: { object: 'process', property: 'platform', message: RUNTIME_MESSAGE } },
  { shippingOnly: true, importName: { name: 'node:fs', importNames: ['chmodSync'], message: RUNTIME_MESSAGE } },
  ...['env', 'exit', 'chdir', 'cwd'].map((property) => ({ property: { object: 'process', property, message: RUNTIME_MESSAGE } })),
  { property: { object: 'Bun', property: 'env', message: RUNTIME_MESSAGE } },
  { importName: { name: 'node:os', importNames: ['homedir'], message: RUNTIME_MESSAGE } },
  ...['localStorage', 'sessionStorage'].flatMap((storageName) => [
    { property: { object: 'window', property: storageName, message: REACH_MESSAGE } },
    { global: { name: storageName, message: REACH_MESSAGE } },
  ]),
];

function confinedReachRules(reaches) {
  return {
    'no-restricted-properties': ['error', ...reaches.filter((reach) => reach.property).map((reach) => reach.property)],
    'no-restricted-globals':    ['error', ...reaches.filter((reach) => reach.global).map((reach) => reach.global)],
    'no-restricted-imports':    ['error', { paths: reaches.filter((reach) => reach.importName).map((reach) => reach.importName) }],
  };
}

export default [
  ...base,
  { ignores: ['**/*.js', 'node_modules/**'] },
  {
    files: SPECS_AND_TESTING_FOLDERS,
    rules: { 'import/no-extraneous-dependencies': ['error', { devDependencies: true, packageDir: MANIFEST_FOLDERS }] },
  },
  { files: TYPESCRIPT_FILES, rules: { 'import/enforce-node-protocol-usage': ['error', 'always'] } },
  // The shared config's object-curly-newline fix leaves a trailing space where it breaks a line of properties, which then want one per line.
  { files: TYPESCRIPT_FILES, rules: { '@stylistic/no-trailing-spaces': 'error' } },
  // The shared config demands CRLF on Windows, where `.gitattributes` checks out LF.
  { files: TYPESCRIPT_FILES, rules: { '@stylistic/linebreak-style': ['error', 'unix'] } },
  {
    // One style for local specifiers, the full file name; the resolver knows both, so an extensionless specifier is found and reported.
    files:    TYPESCRIPT_FILES,
    settings: { 'import/resolver': { node: { extensions: ['.ts', '.tsx'] } } },
    rules:    { 'import/extensions': ['error', 'always', { ignorePackages: true }] },
  },
  { files: TYPESCRIPT_FILES, rules: confinedReachRules(CONFINED_REACHES) },
  { files: SPECS_AND_TESTING_FOLDERS, rules: confinedReachRules(CONFINED_REACHES.filter((reach) => !reach.shippingOnly)) },
  {
    files: TYPESCRIPT_FILES,
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: "CallExpression[callee.object.name=/^(Date|performance)$/][callee.property.name='now']", message: CLOCK_MESSAGE },
        { selector: "NewExpression[callee.name='Date']", message: CLOCK_MESSAGE },
        { selector: "AssignmentExpression > MemberExpression.left[property.name=/^(innerHTML|outerHTML)$/]", message: MARKUP_MESSAGE },
        { selector: "CallExpression[callee.property.name='insertAdjacentHTML']", message: MARKUP_MESSAGE },
        { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: MARKUP_MESSAGE },
        { selector: "CallExpression[callee.name='fetch']", message: REACH_MESSAGE },
        { selector: "NewExpression[callee.name=/^(XMLHttpRequest|WebSocket|EventSource)$/]", message: REACH_MESSAGE },
        { selector: "Identifier[name='indexedDB']", message: REACH_MESSAGE },
      ],
    },
  },
  {
    files:   ['react/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules:   { ...reactHooks.configs.flat.recommended.rules, 'react-hooks/exhaustive-deps': 'error' },
  },
  {
    files: TYPESCRIPT_FILES,
    rules: {
      '@typescript-eslint/no-non-null-assertion':  'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      'no-warning-comments':                       ['error', { terms: ['todo', 'fixme', 'xxx', 'hack'], location: 'anywhere' }],
      'id-length':                                 ['error', { min: 2, exceptions: ['i', 'a', 'b'], properties: 'never' }],
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
