/**
 * What matters: no process that answers git from recordings reaches the real gpgconf, in the spec's own process through `useRecordedGit`
 * or in a spawned binary through each exported `*InThisProcess` player its preload calls. The table of players is exact both ways, so a
 * new player fails here until it is listed and shown to answer gpgconf as missing. A replaced `read` is checked before it is called, so a
 * failing case never starts gpgconf itself.
 */
import { join } from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';

import { GitProcess }                                     from '../lib/git/GitProcess.ts';
import { GpgDirectories }                                 from '../services/hephaestus/GpgDirectories.ts';
import * as RecordedGitModule                             from './RecordedGit.ts';
import { useRecordedGit }                                 from './RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory } from './ScratchWorkspace.ts';

const GPGCONF_AS_THE_PROCESS_STARTED = GpgDirectories.read;
const EXAMPLE_HOME = '/home/alex-example';
const PLAYER_NAME_SUFFIX = 'InThisProcess';

useRecordedGit();

let scratchFolder = '';
let readBeforeTheCase = GpgDirectories.read;
let gitProcessBeforeTheCase = { ...GitProcess };

beforeEach(() => {
  scratchFolder = createScratchDirectory('recorded-git-players');
  readBeforeTheCase = GpgDirectories.read;
  gitProcessBeforeTheCase = { ...GitProcess };
});

afterEach(() => {
  Object.assign(GpgDirectories, { read: readBeforeTheCase });
  Object.assign(GitProcess, gitProcessBeforeTheCase);
  removeScratchDirectory(scratchFolder);
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
