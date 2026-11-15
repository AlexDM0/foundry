import { fileURLToPath } from 'node:url';

import base       from '@reliquary/eslint-config';
import reactHooks from 'eslint-plugin-react-hooks';

const REPOSITORY_FOLDER = fileURLToPath(new URL('.', import.meta.url));

const STORAGE_MESSAGE = 'Browser storage is reached only in bridge/preferences/PreferenceStore.ts.';
const STORAGE_SITES = ['bridge/preferences/PreferenceStore.ts'];

const TYPESCRIPT_FILES = ['**/*.{ts,tsx}'];

const RAW_MARKUP_MESSAGE = 'React escapes every value; agent-written HTML reaches the DOM only as a sandboxed iframe\'s srcdoc.';

const DESIGN_SYSTEM_MARKUP_MESSAGE = 'design-system/ renders every value through React, which escapes it; it injects no markup as text.';

const SPECS_AND_TESTING_FOLDERS = ['**/*.spec.ts', '**/*.dom.tsx', '**/testing/**/*.ts'];

/**
 * Each process or browser reach CLAUDE.md confines, with the exact files allowed to make it. A `shippingOnly` reach binds no spec or
 * testing folder, which exercise the platform directly.
 */
const CONFINED_REACHES = [
  {
    shippingOnly: true,
    allowedIn:    ['cli/CommandContext.ts', 'watcher.ts', 'setup.ts', 'src/lib/atomic-file/FileReplaceFor.ts', 'src/services/overseer/HeldSlotCreateFor.ts'],
    property:     { object: 'process', property: 'platform', message: 'Take the platform as a parameter; only the selectors decide on it.' },
  },
  {
    shippingOnly: true,
    allowedIn:    ['src/lib/owner-only-files/PosixOwnerOnlyFiles.ts'],
    importName:   { name: 'node:fs', importNames: ['chmodSync'], message: 'Restrict a file through the OwnerOnlyFiles port.' },
  },
  {
    // src/shared/Environment.integration.spec.ts tests the getters themselves, and watcher.ts, whose bundle reaches no src/shared, reads
    // SystemRoot and the variables a launch copies (both Deviations).
    allowedIn: ['src/shared/Environment.ts', 'src/shared/Environment.integration.spec.ts', 'watcher.ts'],
    property:  { object: 'process', property: 'env', message: 'Read the environment through src/shared/Environment.ts.' },
  },
  {
    // A src/lib package cannot import src/shared, so the one git spawn passes the inherited environment on itself (a Deviation).
    allowedIn: ['src/shared/Environment.ts', 'src/lib/git/GitProcess.ts'],
    property:  { object: 'Bun', property: 'env', message: 'Read the environment through src/shared/Environment.ts.' },
  },
  {
    allowedIn: ['agent-progress.ts', 'watcher.ts', 'setup.ts'],
    property:  { object: 'process', property: 'exit', message: 'Only agent-progress.ts, watcher.ts and setup.ts exit; return an exit code.' },
  },
  { allowedIn: [], property: { object: 'process', property: 'chdir', message: 'Never change the working directory; pass a directory instead.' } },
  {
    allowedIn: ['cli/CommandContext.ts'],
    property:  { object: 'process', property: 'cwd', message: 'Take the directory from the CommandContext.' },
  },
  {
    allowedIn:  ['cli/CommandContext.ts', 'setup.ts'],
    importName: { name: 'node:os', importNames: ['homedir'], message: 'Take the home directory from the CommandContext.' },
  },
  ...['localStorage', 'sessionStorage'].flatMap((storageName) => [
    { allowedIn: STORAGE_SITES, property: { object: 'window', property: storageName, message: STORAGE_MESSAGE } },
    { allowedIn: STORAGE_SITES, global: { name: storageName, message: STORAGE_MESSAGE } },
  ]),
];

const CONFINED_REACHES_OF_SPECS = CONFINED_REACHES.filter((reach) => !reach.shippingOnly);

function confinedReachRules(exemptFile, reaches) {
  const binding = reaches.filter((reach) => !reach.allowedIn.includes(exemptFile));
  return {
    'no-restricted-properties': ['error', ...binding.filter((reach) => reach.property).map((reach) => reach.property)],
    'no-restricted-globals':    ['error', ...binding.filter((reach) => reach.global).map((reach) => reach.global)],
    'no-restricted-imports':    ['error', { paths: binding.filter((reach) => reach.importName).map((reach) => reach.importName) }],
  };
}

const CONFINED_REACH_SITES = [...new Set(CONFINED_REACHES.flatMap((reach) => reach.allowedIn))];

const CLOCK_MESSAGE = 'Take the clock from the CommandContext.';

const FLINT_CLOCK_MESSAGE = 'flint/ reads no clock: time comes from the injected frame source.';
const FLINT_MARKUP_MESSAGE = 'flint/ draws with createElementNS and setAttribute, never with markup as text.';
const FLINT_REACH_MESSAGE = 'flint/ makes no network call and reads no browser storage: the host gives a storage port.';

export default [
  ...base,
  // The worktrees an Overseer makes inside a checkout hold copies of this repository, linted in their own checkout.
  { ignores: ['**/*.js', 'node_modules/**', '.claude/**', '.forge-worktrees/**', '.agent-progress-worktrees/**'] },
  {
    // Test-only helpers may import devDependencies; nothing that ships may import these folders.
    files: [
      'src/testing/**/*.ts',
      'src/lib/tracker-model/testing/**/*.ts',
      'cli/testing/**/*.ts',
      'src/adapters/progress/testing/**/*.ts',
      'src/services/tracker/testing/**/*.ts',
      'bridge/testing/**/*.ts',
      'bridge/**/*.dom.tsx',
    ],
    rules: { 'import/no-extraneous-dependencies': ['error', { devDependencies: true }] },
  },
  {
    // design-system/ has its own package.json with React as its one peer; its specs and stories run on the forge's devDependencies until
    // the split.
    files: [
      'design-system/testing/**/*.ts',
      'design-system/**/*.spec.ts',
      'design-system/**/*.dom.tsx',
      'design-system/**/*.stories.tsx',
      'design-system/.storybook/**/*.ts',
    ],
    rules: { 'import/no-extraneous-dependencies': ['error', { devDependencies: true, packageDir: [REPOSITORY_FOLDER, `${REPOSITORY_FOLDER}/design-system`] }] },
  },
  {
    // flint/ has its own package.json with no dependencies; its specs run on the forge's test packages until the package is split off.
    files: ['flint/testing/**/*.ts', 'flint/**/*.spec.ts', 'flint/**/*.dom.tsx'],
    rules: { 'import/no-extraneous-dependencies': ['error', { devDependencies: true, packageDir: [REPOSITORY_FOLDER, `${REPOSITORY_FOLDER}/flint`] }] },
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
  { files: TYPESCRIPT_FILES, rules: confinedReachRules(null, CONFINED_REACHES) },
  { files: SPECS_AND_TESTING_FOLDERS, rules: confinedReachRules(null, CONFINED_REACHES_OF_SPECS) },
  ...CONFINED_REACH_SITES.map((site) => ({
    files: [site],
    rules: confinedReachRules(site, site.endsWith('.spec.ts') ? CONFINED_REACHES_OF_SPECS : CONFINED_REACHES),
  })),
  {
    files:   ['src/**/*.ts', 'cli/**/*.ts', 'agent-progress.ts', 'watcher.ts'],
    ignores: [...SPECS_AND_TESTING_FOLDERS, 'cli/CommandContext.ts', 'watcher.ts'],
    rules:   {
      'no-restricted-syntax': [
        'error',
        { selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']", message: CLOCK_MESSAGE },
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: CLOCK_MESSAGE },
      ],
    },
  },
  {
    files:   ['bridge/**/*.{ts,tsx}'],
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
    files:   ['design-system/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules:   {
      ...reactHooks.configs.flat.recommended.rules,
      'react-hooks/exhaustive-deps': 'error',
      'no-restricted-syntax':        [
        'error',
        { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: DESIGN_SYSTEM_MARKUP_MESSAGE },
        { selector: "AssignmentExpression > MemberExpression.left[property.name=/^(innerHTML|outerHTML)$/]", message: DESIGN_SYSTEM_MARKUP_MESSAGE },
      ],
    },
  },
  {
    files: ['flint/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: "CallExpression[callee.object.name=/^(Date|performance)$/][callee.property.name='now']", message: FLINT_CLOCK_MESSAGE },
        { selector: "NewExpression[callee.name='Date']", message: FLINT_CLOCK_MESSAGE },
        { selector: "AssignmentExpression > MemberExpression.left[property.name=/^(innerHTML|outerHTML)$/]", message: FLINT_MARKUP_MESSAGE },
        { selector: "CallExpression[callee.property.name='insertAdjacentHTML']", message: FLINT_MARKUP_MESSAGE },
        { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: FLINT_MARKUP_MESSAGE },
        { selector: "CallExpression[callee.name='fetch']", message: FLINT_REACH_MESSAGE },
        { selector: "NewExpression[callee.name=/^(XMLHttpRequest|WebSocket|EventSource)$/]", message: FLINT_REACH_MESSAGE },
        { selector: "Identifier[name='indexedDB']", message: FLINT_REACH_MESSAGE },
      ],
    },
  },
  {
    files:   ['flint/react/**/*.{ts,tsx}'],
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
    ignores: [...SPECS_AND_TESTING_FOLDERS, '**/constants/**/*.ts', '**/*.stories.tsx'],
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
