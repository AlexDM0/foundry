/**
 * The rules of forge's `CLAUDE.md` that its `eslint.config.js` holds, each watched failing: every form a rule claims is planted at a path
 * it governs and must be reported by that rule, and each exact exception (the one module allowed a reach, a spec, a constants folder, an
 * arithmetic identity) is planted too and must pass. `bun run lint` is what proves the tree itself passes. The line ending under a win32
 * `process.platform` needs a child process, so `src/LintRules.integration.spec.ts` holds it and records the child's answer, which the
 * last case here reads. The workspace packages hold their own rules and planted cases in their own `LintRules.spec.ts`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join }                     from 'node:path';
import { describe, expect, test }   from 'bun:test';
import { ESLint }                   from 'eslint';

import { repositoryRootOfThisCheckout } from './testing/ImportGraph.ts';
import { ESLINT_RECORDING }             from './testing/RecordedBoundaryCommands.ts';
import { recordedCommandOf }            from './testing/RecordedCommand.ts';

interface PlantedViolation {
  readonly path:   string;
  readonly text:   string;
  readonly ruleId: string;
}

const MECHANISED_RULE_IDS = [
  'no-restricted-properties',
  'no-restricted-globals',
  'no-restricted-imports',
  'no-restricted-syntax',
  '@typescript-eslint/no-non-null-assertion',
  'no-warning-comments',
  '@typescript-eslint/consistent-type-imports',
  'id-length',
  '@typescript-eslint/no-magic-numbers',
  'react-hooks/rules-of-hooks',
  'import/no-extraneous-dependencies',
];

const LINEBREAK_RULE_ID = '@stylistic/linebreak-style';

const ALLOWED_SITE_LIST = /(?:allowedIn|STORAGE_SITES)\s*[:=]\s*\[([^\]]*)\]/g;
const QUOTED_PATH = /'([^']+)'/g;

function allowedSitesNamedIn(configText: string): string[] {
  return [...configText.matchAll(ALLOWED_SITE_LIST)]
    .flatMap((listMatch) => [...(listMatch[1] ?? '').matchAll(QUOTED_PATH)].map((pathMatch) => pathMatch[1] ?? ''));
}

const LINTER = new ESLint({ cwd: repositoryRootOfThisCheckout() });

async function ruleIdsReportedFor(path: string, text: string): Promise<string[]> {
  const [result] = await LINTER.lintText(text, { filePath: path });
  return (result?.messages ?? []).map((message) => message.ruleId ?? 'parse-error');
}

const HOME_DIRECTORY_IMPORT = 'import { homedir } from \'node:os\';\n\nexport const home = homedir();\n';
const PLATFORM_READ = 'export const platform = process.platform;\n';
const MODE_CHANGE_IMPORT = 'import { chmodSync } from \'node:fs\';\n\nexport const changeMode = chmodSync;\n';

const PLANTED_VIOLATIONS: readonly PlantedViolation[] = [
  { path: 'cli/Planted.ts', text: 'export const home = process.env[\'HOME\'];\n', ruleId: 'no-restricted-properties' },
  { path: 'src/services/overseer/Planted.ts', text: 'export const home = Bun.env[\'HOME\'];\n', ruleId: 'no-restricted-properties' },
  { path: 'src/lib/git/Planted.ts', text: 'export const environment = { ...Bun.env };\n', ruleId: 'no-restricted-properties' },
  { path: 'cli/Planted.ts', text: 'export const value = \'text\';\r\n', ruleId: LINEBREAK_RULE_ID },
  { path: 'cli/Planted.ts', text: 'process.exit(1);\n', ruleId: 'no-restricted-properties' },
  { path: 'cli/CommandContext.ts', text: 'process.chdir(\'/\');\n', ruleId: 'no-restricted-properties' },
  { path: 'src/Planted.ts', text: 'export const here = process.cwd();\n', ruleId: 'no-restricted-properties' },
  { path: 'cli/Planted.ts', text: HOME_DIRECTORY_IMPORT, ruleId: 'no-restricted-imports' },
  { path: 'cli/Planted.ts', text: PLATFORM_READ, ruleId: 'no-restricted-properties' },
  { path: 'src/lib/atomic-file/AtomicFile.ts', text: PLATFORM_READ, ruleId: 'no-restricted-properties' },
  { path: 'src/lib/data-folders/DataFoldersFor.ts', text: PLATFORM_READ, ruleId: 'no-restricted-properties' },
  { path: 'cli/Planted.ts', text: MODE_CHANGE_IMPORT, ruleId: 'no-restricted-imports' },
  { path: 'src/lib/owner-only-files/Planted.ts', text: MODE_CHANGE_IMPORT, ruleId: 'no-restricted-imports' },
  { path: 'cli/Planted.ts', text: 'export const now = Date.now();\n', ruleId: 'no-restricted-syntax' },
  { path: 'src/Planted.ts', text: 'export const now = new Date();\n', ruleId: 'no-restricted-syntax' },
  { path: 'cli/Planted.ts', text: 'export const firstOf = (list: string[]): string => list[0]!;\n', ruleId: '@typescript-eslint/no-non-null-assertion' },
  ...['TODO', 'FIXME', 'XXX', 'HACK'].map((term) => ({ path: 'cli/Planted.ts', text: `// ${term}: name the value\nexport const value = 1;\n`, ruleId: 'no-warning-comments' })),
  {
    path:   'cli/Planted.ts',
    text:   'import { CommandContext } from \'./CommandContext.ts\';\n\nexport type Alias = CommandContext;\n',
    ruleId: '@typescript-eslint/consistent-type-imports',
  },
  { path: 'cli/Planted.ts', text: 'export const x = \'value\';\n', ruleId: 'id-length' },
  { path: 'cli/Planted.ts', text: 'export const scaled = (side: number): number => side * 7;\n', ruleId: '@typescript-eslint/no-magic-numbers' },
];

const PLANTED_EXCEPTIONS: readonly (readonly [string, string, string])[] = [
  ['the environment module reading the environment', 'src/shared/Environment.ts', 'export const home = process.env[\'HOME\'];\n'],
  ['the environment module reading the Bun environment', 'src/shared/Environment.ts', 'export const home = Bun.env[\'HOME\'];\n'],
  ['the git spawn passing the inherited environment on', 'src/lib/git/GitProcess.ts', 'export const environment = { ...Bun.env };\n'],
  ['the binary exiting', 'agent-progress.ts', 'process.exit(1);\n'],
  ['the Talos binary exiting', 'talos.ts', 'process.exit(1);\n'],
  ['the Talos binary reading its wall clock', 'talos.ts', 'export const now = Date.now();\n'],
  ['the machine setup exiting', 'setup.ts', 'process.exit(1);\n'],
  ['the command context reading the directory', 'cli/CommandContext.ts', 'export const here = process.cwd();\n'],
  ['the command context reading the home directory', 'cli/CommandContext.ts', HOME_DIRECTORY_IMPORT],
  ['the machine setup reading the home directory', 'setup.ts', HOME_DIRECTORY_IMPORT],
  ['the command context reading the clock', 'cli/CommandContext.ts', 'export const now = (): Date => new Date();\n'],
  ['the command context reading the platform', 'cli/CommandContext.ts', PLATFORM_READ],
  ['the Talos binary reading the platform', 'talos.ts', PLATFORM_READ],
  ['the file-replace selector reading the platform', 'src/lib/atomic-file/FileReplaceFor.ts', PLATFORM_READ],
  ['the machine setup reading the platform', 'setup.ts', PLATFORM_READ],
  ['the held-slot selector reading the platform', 'src/services/overseer/HeldSlotCreateFor.ts', PLATFORM_READ],
  ['a spec reading the platform', 'cli/Planted.spec.ts', PLATFORM_READ],
  ['a testing folder reading the platform', 'src/testing/Planted.ts', PLATFORM_READ],
  ['the POSIX owner-only adapter changing a mode', 'src/lib/owner-only-files/PosixOwnerOnlyFiles.ts', MODE_CHANGE_IMPORT],
  ['a spec changing a mode', 'cli/Planted.spec.ts', MODE_CHANGE_IMPORT],
  ['a testing folder changing a mode', 'src/testing/Planted.ts', MODE_CHANGE_IMPORT],
  ['a spec reading the clock', 'cli/Planted.spec.ts', 'export const now = Date.now();\n'],
  ['a dated Date', 'cli/Planted.ts', 'export const epoch = new Date(0);\n'],
  ['a loop index and a comparator pair', 'cli/Planted.ts', 'export const sorted = [\'b\', \'a\'].sort((a, b) => a.localeCompare(b)).map((value, i) => `${value}${i}`);\n'],
  ['arithmetic identities', 'cli/Planted.ts', 'export const share = (part: number): string => (part * 100 / 2 - 1).toString(16);\n'],
  ['a number in a constants folder', 'cli/constants/Planted.ts', 'export const scaled = (side: number): number => side * 7;\n'],
  ['a number in a spec', 'cli/Planted.spec.ts', 'export const scaled = (side: number): number => side * 7;\n'],
];

describe('the mechanised CLAUDE.md rules in eslint.config.js', () => {
  test.each(PLANTED_VIOLATIONS.map((planted) => [`${planted.ruleId} in ${planted.path}: ${planted.text.trim()}`, planted] as const))(
    'reports %s',
    async (_title, planted) => {
      expect(await ruleIdsReportedFor(planted.path, planted.text)).toContain(planted.ruleId);
    },
  );

  test.each(PLANTED_EXCEPTIONS)('lets through %s', async (_title, path, text) => {
    const reported = await ruleIdsReportedFor(path, text);
    expect(reported.filter((ruleId) => MECHANISED_RULE_IDS.includes(ruleId) || ruleId === 'parse-error')).toEqual([]);
  });
});

describe('every allowed site in eslint.config.js names a file', () => {
  const repositoryRoot = repositoryRootOfThisCheckout();
  const allowedSites = allowedSitesNamedIn(readFileSync(join(repositoryRoot, 'eslint.config.js'), 'utf8'));

  test('the scan finds the allowed sites, and each one exists', () => {
    expect(allowedSites.length).toBeGreaterThan(10);
    expect(allowedSites.filter((site) => !existsSync(join(repositoryRoot, site)))).toEqual([]);
  });

  test('an allowed site that names no file is found', () => {
    const planted = 'const STORAGE_SITES = [\'bridge/Planted.ts\'];\n  { allowedIn: [\'cli/Missing.ts\', \'setup.ts\'] },\n';
    expect(allowedSitesNamedIn(planted).filter((site) => !existsSync(join(repositoryRoot, site)))).toEqual(['bridge/Planted.ts', 'cli/Missing.ts']);
  });
});

test('the recorded child under a win32 process.platform resolved the line ending to unix, where the shared config alone demands windows', () => {
  const lineEndingScript = 'the line ending script';
  const recorded = recordedCommandOf(ESLINT_RECORDING.BOUNDARY, {
    [ESLINT_RECORDING.BUN_PLACEHOLDER]:    process.execPath,
    [ESLINT_RECORDING.SCRIPT_PLACEHOLDER]: lineEndingScript,
  });
  const child = recorded.spawnSync([process.execPath, '-e', lineEndingScript]);
  expect(child.stderr.toString()).toBe('');
  expect(JSON.parse(child.stdout.toString())).toEqual({ shared: 'windows', resolved: 'unix' });
});
