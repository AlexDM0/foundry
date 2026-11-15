/**
 * The lifecycle components carry the names the owner decided (CLAUDE.md, Rules): no repository file but this one, the live board and the
 * design documents names one by its retired name, in a path, an identifier or a wire literal; a package the program declares counts as
 * its own. The files come from a folder walk that runs no git; `src/lib/git/TrackedFileWalk.integration.spec.ts` proves the walk reaches
 * every file git tracks. What matters: the scan provably read the
 * tree, the allowlist is exact both ways, and the scan catches a planted name of each kind and passes once it is gone.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { expect, test } from 'bun:test';

import { repositoryRootOfThisCheckout } from './testing/ImportGraph.ts';
import type { ProgramFile }             from './testing/RepositorySources.ts';
import { programFiles }                 from './testing/RepositorySources.ts';

const REPOSITORY_ROOT = repositoryRootOfThisCheckout();

const THIS_FILE = 'src/ComponentNames.spec.ts';

const UNSCANNED_FOLDERS = ['.agent-progress/', 'docs/design/'];

const BINARY_FILE_PATTERN = /\.(png|jpe?g|gif|ico|woff2?)$/;

/** Well under today's count of repository files, so a walk that read the wrong folder fails rather than passing on nothing. */
const SMALLEST_SCANNED_FILE_COUNT = 500;

const RETIRED_NAMES = [
  'RunnerLease',
  'RunnerHandover',
  'RunnerLimits',
  'RunnerServer',
  'HostFleet',
  'HostBundle',
  'HostRecord',
  'HOST_PROTOCOL_VERSION',
  'agent-host',
  'src/services/runner',
  'cli/runner',
  'RelayInbox',
  'RelayUnderJob',
  'JobVerification',
  'verifyJob',
  'MergeSlot',
  'SlotPhase',
  'LifecyclePolicy',
  'LifecycleStep',
  'RoleCommandPolicy',
  'Reattachment',
  'BoardWatcher',
  'advanceLifecycle',
  'boot-orchestrator',
  'no-orchestrator',
  'runner-started',
  'runner-stopped',
  'runner-handover-failed',
  'host-lost',
  'host-instance',
  'host-bundle-failed',
  'lease-taken-over',
  'handing-over',
  '--login-runner',
];

/** `<file>: <retired name>` pairs a file may keep. */
const ALLOWED_RETIRED_NAMES: readonly string[] = [];

function scannedFiles(): ProgramFile[] {
  return programFiles(REPOSITORY_ROOT).filter(({ path }) => path !== THIS_FILE
    && !BINARY_FILE_PATTERN.test(path) && !UNSCANNED_FOLDERS.some((folder) => path.startsWith(folder)));
}

function retiredNamesIn(filePath: string, text: string): string[] {
  return RETIRED_NAMES.filter((name) => filePath.includes(name) || text.includes(name)).map((name) => `${filePath}: ${name}`);
}

test('the scan reads every program and package file but this one, the board and the design documents, the renamed roots among them', () => {
  const filePaths = scannedFiles().map(({ path }) => path);
  expect(filePaths.length).toBeGreaterThan(SMALLEST_SCANNED_FILE_COUNT);
  expect(filePaths).toContain('CLAUDE.md');
  expect(filePaths).toEqual(expect.arrayContaining(['design-system/CONSTITUTION.md', 'flint/package.json']));
  expect(filePaths.some((filePath) => filePath.startsWith('src/services/overseer/'))).toBe(true);
  expect(filePaths.some((filePath) => filePath.startsWith('src/lib/watcher/'))).toBe(true);
  expect(filePaths.filter((filePath) => filePath === THIS_FILE || UNSCANNED_FOLDERS.some((folder) => filePath.startsWith(folder)))).toEqual([]);
  expect(readFileSync(join(REPOSITORY_ROOT, 'CLAUDE.md'), 'utf8')).toContain('Overseer');
});

test('no repository file names a component by its retired name, beyond the exact allowlist', () => {
  const found = scannedFiles().flatMap(({ path, location }) => retiredNamesIn(path, readFileSync(location, 'utf8')));
  expect(found).toEqual([...ALLOWED_RETIRED_NAMES]);
});

test('the scan fails on a planted path, identifier and wire literal, and passes without them', () => {
  expect(retiredNamesIn('src/services/runner/Example.ts', 'export const EXAMPLE = 1;\n')).toEqual(['src/services/runner/Example.ts: src/services/runner']);
  expect(retiredNamesIn('src/Example.ts', 'import { RunnerLease } from "./Baton.ts";\n')).toEqual(['src/Example.ts: RunnerLease']);
  expect(retiredNamesIn('src/Example.ts', 'const cause = \'host-lost\';\n')).toEqual(['src/Example.ts: host-lost']);
  expect(retiredNamesIn('src/services/overseer/Example.ts', 'import { Baton } from \'./Baton.ts\';\nconst cause = \'watcher-lost\';\n')).toEqual([]);
});
