import { fileURLToPath } from 'node:url';

import base from '@reliquary/eslint-config';

const REPOSITORY_FOLDER = fileURLToPath(new URL('.', import.meta.url));

// The dev tools are devDependencies of the workspace root, so a spec or test helper may import what either manifest names.
const MANIFEST_FOLDERS = [REPOSITORY_FOLDER, fileURLToPath(new URL('../..', import.meta.url))];

const TYPESCRIPT_FILES = ['**/*.{ts,tsx}'];

const SPECS_AND_TESTING_FOLDERS = ['**/*.spec.ts', '**/testing/**/*.ts'];

/**
 * Each process reach CLAUDE.md confines, with the exact files allowed to make it. A `shippingOnly` reach binds no spec or
 * testing folder, which exercise the platform directly.
 */
const CONFINED_REACHES = [
  {
    shippingOnly: true,
    allowedIn:    ['cli/CommandContext.ts', 'talos.ts', 'setup.ts', 'src/lib/atomic-file/FileReplaceFor.ts', 'src/services/overseer/HeldSlotCreateFor.ts'],
    property:     { object: 'process', property: 'platform', message: 'Take the platform as a parameter; only the selectors decide on it.' },
  },
  {
    shippingOnly: true,
    allowedIn:    ['src/lib/owner-only-files/PosixOwnerOnlyFiles.ts'],
    importName:   { name: 'node:fs', importNames: ['chmodSync'], message: 'Restrict a file through the OwnerOnlyFiles port.' },
  },
  {
    // src/shared/Environment.integration.spec.ts tests the getters themselves, and talos.ts, which reaches no src/shared, reads SystemRoot
    // and the variables a launch copies (both Deviations).
    allowedIn: ['src/shared/Environment.ts', 'src/shared/Environment.integration.spec.ts', 'talos.ts'],
    property:  { object: 'process', property: 'env', message: 'Read the environment through src/shared/Environment.ts.' },
  },
  {
    // A src/lib package cannot import src/shared, so the one git spawn passes the inherited environment on itself (a Deviation).
    allowedIn: ['src/shared/Environment.ts', 'src/lib/git/GitProcess.ts'],
    property:  { object: 'Bun', property: 'env', message: 'Read the environment through src/shared/Environment.ts.' },
  },
  {
    allowedIn: ['agent-progress.ts', 'talos.ts', 'setup.ts'],
    property:  { object: 'process', property: 'exit', message: 'Only agent-progress.ts, talos.ts and setup.ts exit; return an exit code.' },
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
];

const CONFINED_REACHES_OF_SPECS = CONFINED_REACHES.filter((reach) => !reach.shippingOnly);

function confinedReachRules(exemptFile, reaches) {
  const binding = reaches.filter((reach) => !reach.allowedIn.includes(exemptFile));
  return {
    'no-restricted-properties': ['error', ...binding.filter((reach) => reach.property).map((reach) => reach.property)],
    'no-restricted-imports':    ['error', { paths: binding.filter((reach) => reach.importName).map((reach) => reach.importName) }],
  };
}

const CONFINED_REACH_SITES = [...new Set(CONFINED_REACHES.flatMap((reach) => reach.allowedIn))];

const CLOCK_MESSAGE = 'Take the clock from the CommandContext.';

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
    ],
    rules: { 'import/no-extraneous-dependencies': ['error', { devDependencies: true, packageDir: MANIFEST_FOLDERS }] },
  },
  { files: ['**/*.spec.ts'], rules: { 'import/no-extraneous-dependencies': ['error', { devDependencies: true, packageDir: MANIFEST_FOLDERS }] } },
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
    files:   ['src/**/*.ts', 'cli/**/*.ts', 'agent-progress.ts', 'talos.ts'],
    ignores: [...SPECS_AND_TESTING_FOLDERS, 'cli/CommandContext.ts', 'talos.ts'],
    rules:   {
      'no-restricted-syntax': [
        'error',
        { selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']", message: CLOCK_MESSAGE },
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: CLOCK_MESSAGE },
      ],
    },
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
