/**
 * The lifecycle components carry the names the owner decided (CLAUDE.md, Rules): no repository file but this one, the live board, the
 * design documents and the dated research names one by its retired name, in a path, an identifier or a wire literal; a package the
 * program declares counts as its own. The files come from a folder walk that runs no git;
 * `src/lib/git/TrackedFileWalk.integration.spec.ts` proves the walk reaches every file git tracks. What matters: the scan provably read the
 * tree, the allowlist is exact both ways, and the scan catches a planted name of each kind and passes once it is gone.
 */
import { readFileSync } from 'node:fs';
import { join }         from 'node:path';

import { expect, test } from 'bun:test';

import { repositoryRootOfThisCheckout } from '../src/testing/ImportGraph.ts';
import type { ProgramFile }             from '../src/testing/RepositorySources.ts';
import { programFiles }                 from '../src/testing/RepositorySources.ts';

const REPOSITORY_ROOT = repositoryRootOfThisCheckout();

const THIS_FILE = 'architecture/ComponentNames.spec.ts';

const UNSCANNED_FOLDERS = ['.agent-progress/', 'docs/design/', 'docs/research/'];

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
  'watcher.ts',
  'src/lib/watcher',
  'WatcherFleet',
  'WatcherBundle',
  'LegacyWatcherReader',
  'WatcherBoardChildren',
  'WatcherSocketServer',
  'WATCHER_PROTOCOL_VERSION',
  'WATCHER_PROTOCOL_OLDEST_SUPPORTED',
  'WATCHER_LINGER_FRAMES',
  'runWatcher',
  'PlantedWatcher',
  'IdleWatcherSocket',
  'RecordedWatcherStages',
  'WatcherProtocolClient',
  'watcherProtocolVersion',
  'watcherInstance',
  'FIRST_WATCHER_INSTANCE',
  'watcher-instance',
  'ProcessWatcherSandbox',
  'createProcessWatcherSandbox',
  'ProcessWatcherLaunch',
  'ProcessWatcherLaunchOutcome',
  'ProcessWatcherSpawn',
  'ProcessWatcherStep',
  'LostWatcherFacts',
  'environmentFromWatcher',
  'WatcherObservation',
  'WatcherEventFacts',
  'AppliedWatcherEvents',
  'WATCHER_RUNNING_STATES',
  'GATE_WATCHER_FOLDER_PREFIX',
  'GATE_PREPARE_WATCHER_FOLDER',
  'INSTALL_WATCHER_FOLDER',
  'MAIN_MERGE_WATCHER_FOLDER',
  'TARGET_MERGE_WATCHER_FOLDER',
  'gateWatcherFolderIn',
  'highestWatcherInstanceOf',
  'newestFinishedWatcherInstanceOf',
  'lostWatcherCauseOf',
  'jobsNeedingAWatcher',
  'killWatcher',
  'launchProcessWatcher',
  'spawnProcessWatcher',
  'stopLiveProcessWatchers',
  'syncWatchers',
  'hatchFolderWatchers',
  'liveWatcherInstances',
  'lastWatcherInstance',
  'watcherJudgedSlotsIn',
  'watcherProcessIdOf',
  'watcherEventFacts',
  'watcherFolder',
  'watcherFilesOf',
  'watcherRecordPath',
  'endStepWatcher',
  'plantLiveWatcher',
  'pinWatcherBundle',
  'legacy-watcher',
  'watcher-events',
  'watcher-bundle-failed',
  'watcher-endpoint-does-not-fit',
  'Bridge',
  'bridge/',
  'Oversee',
  'oversee',
  'OVERSEE',
  'Baton',
  'baton',
  'BATON',
  'watcher-lost',
];

/** `<file>: <retired name>` pairs a file may keep. */
const VENDOR_FIXTURES_NAMING_THE_PROBE_FOLDER = [
  'ask-user-question-live-answer.stdout',
  'mid-turn-line-folded.stdout',
  'permission-denials-under-deny-rules.stdout',
  'rate-limit-rejected.stdout',
  'rate-limit-window-rejected-under-allowed.stdout',
  'resume-structured-output.stdout',
];

/** `<file>: <retired name>` pairs a file may keep: records of older installs and of what Claude Code printed. */
const ALLOWED_RETIRED_NAMES: readonly string[] = [
  'cli/FrozenInstalledSurface.json: oversee',
  ...VENDOR_FIXTURES_NAMING_THE_PROBE_FOLDER.map((name) => `src/lib/claude-code/testing/fixtures/${name}.jsonl: oversee`),
];

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
  expect(filePaths).toContain('README.md');
  expect(filePaths).toEqual(expect.arrayContaining(['forge-contracts/package.json', 'system-versions/package.json']));
  expect(filePaths.some((filePath) => filePath.startsWith('src/services/hephaestus/'))).toBe(true);
  expect(filePaths.some((filePath) => filePath.startsWith('talos/'))).toBe(true);
  expect(filePaths.filter((filePath) => filePath === THIS_FILE || UNSCANNED_FOLDERS.some((folder) => filePath.startsWith(folder)))).toEqual([]);
  expect(readFileSync(join(REPOSITORY_ROOT, 'README.md'), 'utf8')).toContain('Hephaestus');
});

test('no repository file names a component by its retired name, beyond the exact allowlist', () => {
  const found = scannedFiles().flatMap(({ path, location }) => retiredNamesIn(path, readFileSync(location, 'utf8')));
  expect(found.toSorted()).toEqual(ALLOWED_RETIRED_NAMES.toSorted());
});

test('the scan fails on a planted path, identifier and wire literal, and passes without them', () => {
  expect(retiredNamesIn('src/services/runner/Example.ts', 'export const EXAMPLE = 1;\n')).toEqual(['src/services/runner/Example.ts: src/services/runner']);
  expect(retiredNamesIn('src/Example.ts', 'import { RunnerLease } from "./HephaestusLock.ts";\n')).toEqual(['src/Example.ts: RunnerLease']);
  expect(retiredNamesIn('src/Example.ts', 'const cause = \'host-lost\';\n')).toEqual(['src/Example.ts: host-lost']);
  expect(retiredNamesIn('src/lib/watcher/Example.ts', 'export const EXAMPLE = 1;\n')).toEqual(['src/lib/watcher/Example.ts: src/lib/watcher']);
  expect(retiredNamesIn('src/Example.ts', 'import { WatcherFleet } from "./Example.ts";\n')).toEqual(['src/Example.ts: WatcherFleet']);
  expect(retiredNamesIn('src/Example.ts', 'const phase = \'watcher-events\';\n')).toEqual(['src/Example.ts: watcher-events']);
  expect(retiredNamesIn('src/Example.ts', '/** As the Bridge shows it. */\n')).toEqual(['src/Example.ts: Bridge']);
  expect(retiredNamesIn('bridge/Example.ts', 'export const EXAMPLE = 1;\n')).toEqual(['bridge/Example.ts: bridge/']);
  expect(retiredNamesIn('src/Example.ts', 'const cause = \'watcher-lost\';\n')).toEqual(['src/Example.ts: watcher-lost']);
  expect(retiredNamesIn('src/services/overseer/Example.ts', 'export const EXAMPLE = 1;\n')).toEqual(['src/services/overseer/Example.ts: oversee']);
  expect(retiredNamesIn('src/Example.ts', 'import { OverseerServer } from "./Example.ts";\n')).toEqual(['src/Example.ts: Oversee']);
  expect(retiredNamesIn('src/Example.ts', 'const kind = \'overseer-stop\';\n')).toEqual(['src/Example.ts: oversee']);
  expect(retiredNamesIn('src/Example.ts', 'const OVERSEER_PORT_FIRST = 1;\n')).toEqual(['src/Example.ts: OVERSEE']);
  expect(retiredNamesIn('src/Example.ts', 'const commandLine = [\'oversee\', \'stop\'];\n')).toEqual(['src/Example.ts: oversee']);
  expect(retiredNamesIn('src/services/hephaestus/Baton.ts', 'export const EXAMPLE = 1;\n')).toEqual(['src/services/hephaestus/Baton.ts: Baton']);
  expect(retiredNamesIn('src/Example.ts', 'const kind = \'baton-taken\';\n')).toEqual(['src/Example.ts: baton']);
  expect(retiredNamesIn('src/Example.ts', 'const BATON_FILE_PATTERN = 1;\n')).toEqual(['src/Example.ts: BATON']);
  expect(retiredNamesIn('src/services/hephaestus/HephaestusLock.ts', 'const kind = \'hephaestus-lock-taken\';\n')).toEqual([]);
  expect(retiredNamesIn('src/services/hephaestus/Example.ts', 'import { HephaestusServer } from "./Example.ts";\nconst kind = \'hephaestus-stop\';\n')).toEqual([]);
  expect(retiredNamesIn('src/Example.ts', 'const HEPHAESTUS_PORT_FIRST = 1;\nconst commandLine = [\'stop\'];\nconst cause = \'talos-lost\';\n')).toEqual([]);
});
