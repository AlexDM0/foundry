/**
 * No process that answers git from recordings reaches the real gpgconf, in the spec's process or through a spawned binary's `*InThisProcess`
 * player; the table of players is exact both ways, and a replaced `read` is checked before it is called. An unanswered git call fails its
 * case in the guard's hook: Bun skips the hooks after one that throws, a spec's teardown among them.
 */
import { realpathSync } from 'node:fs';
import { join }         from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { GitProcess }                                     from '../lib/git/GitProcess.ts';
import { discoverRepositoryRoot }                         from '../lib/git/RepositoryRoot.ts';
import { GpgDirectories }                                 from '../services/hephaestus/GpgDirectories.ts';
import * as RecordedGitModule                             from './RecordedGit.ts';
import { useRecordedGit }                                 from './RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory } from './ScratchWorkspace.ts';
import { takeUnansweredRecordedGitCalls }                 from './UnansweredRecordedGitCalls.ts';

const GPGCONF_AS_THE_PROCESS_STARTED = GpgDirectories.read;
const EXAMPLE_HOME = '/home/alex-example';
const PLAYER_NAME_SUFFIX = 'InThisProcess';

useRecordedGit();

let scratchFolder = '';
/** What the hook of `useRecordedGit` must have handed to the guard by the time this file's own hook runs; `null` when the case names none. */
let unansweredCallsTheCaseExpects: string[] | null = null;
let readBeforeTheCase = GpgDirectories.read;
let gitProcessBeforeTheCase = { ...GitProcess };

beforeEach(() => {
  scratchFolder = createScratchDirectory('recorded-git-players');
  readBeforeTheCase = GpgDirectories.read;
  gitProcessBeforeTheCase = { ...GitProcess };
});

// Registered after the hook of `useRecordedGit`, as a spec's teardown is: it runs only when that hook did not throw.
afterEach(() => {
  Object.assign(GpgDirectories, { read: readBeforeTheCase });
  Object.assign(GitProcess, gitProcessBeforeTheCase);
  removeScratchDirectory(scratchFolder);
  const expectedCalls = unansweredCallsTheCaseExpects;
  unansweredCallsTheCaseExpects = null;
  if (expectedCalls !== null) expect(takeUnansweredRecordedGitCalls()).toEqual(expectedCalls);
});

function expectGpgconfAnsweredAsMissing(): void {
  expect(GpgDirectories.read).not.toBe(GPGCONF_AS_THE_PROCESS_STARTED);
  expect(GpgDirectories.read(EXAMPLE_HOME)).toBeNull();
}

const PLAYER_INSTALLS: Readonly<Record<string, (reportPath: string) => void>> = {
  playRecordedGitInThisProcess:   (reportPath) => RecordedGitModule.playRecordedGitInThisProcess([], reportPath),
  answerSharedFlowInThisProcess:  (reportPath) => RecordedGitModule.answerSharedFlowInThisProcess(join(scratchFolder, 'flow-stage.json'), reportPath),
  answerRecordedGitInThisProcess: (reportPath) => RecordedGitModule.answerRecordedGitInThisProcess([], reportPath),
};

test('every exported in-process player is listed, and every listed one is exported', () => {
  const exportedPlayers = Object.keys(RecordedGitModule).filter((name) => name.endsWith(PLAYER_NAME_SUFFIX));
  expect(exportedPlayers.length).toBeGreaterThan(0);
  expect(exportedPlayers.sort()).toEqual(Object.keys(PLAYER_INSTALLS).sort());
});

test.each(Object.entries(PLAYER_INSTALLS))('%s answers gpgconf as missing in the process it is installed in', (_playerName, install) => {
  Object.assign(GpgDirectories, { read: GPGCONF_AS_THE_PROCESS_STARTED });
  install(join(scratchFolder, 'unanswered.txt'));
  expectGpgconfAnsweredAsMissing();
});

test('a spec file on recorded git answers gpgconf as missing in its own process', () => {
  expectGpgconfAnsweredAsMissing();
});

test('a git call no recording answered is handed to the guard after the case, so the hooks a spec registered after `useRecordedGit` still run', () => {
  const askedIn = realpathSync(scratchFolder);
  const unanswered = `git rev-parse --git-common-dir in ${askedIn} has no recorded answer: the stage expected no call`;

  expect(() => discoverRepositoryRoot(scratchFolder)).toThrow(unanswered);
  unansweredCallsTheCaseExpects = [unanswered];
});
