/**
 * How far main moved past a setup's snapshot: git counts once per (snapshot commit, main tip), and no snapshot, no tip or a snapshot at the
 * tip is 0 with no git. Git answers from `src/testing/RecordedGit.ts`, and a stage fails a call it does not hold, which counts the calls.
 */
import { afterEach, beforeEach, expect } from 'bun:test';

import { GIT_CALL_SHAPES, useRecordedGit, type RecordedGitStep } from '../../testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory }        from '../../testing/ScratchWorkspace.ts';
import { testWhenGitIsRecorded }                                 from '../../testing/ToolGuard.ts';
import { MainMovedCounts }                                       from './MainMovedCounts.ts';

const SNAPSHOT_COMMIT = '1'.repeat(40);
const MAIN_TIP = '2'.repeat(40);
const LATER_MAIN_TIP = '3'.repeat(40);

const recordedGit = useRecordedGit();

let repositoryDirectory = '';

beforeEach(() => {
  repositoryDirectory = createScratchDirectory('main-moved-counts');
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

function countAsked(snapshotCommit: string, mainTip: string): RecordedGitStep {
  return { gitArguments: ['rev-list', '--count', '--end-of-options', `${snapshotCommit}..${mainTip}`], answeredAs: GIT_CALL_SHAPES.COMMITS_AHEAD_ONE };
}

testWhenGitIsRecorded('a second read with the same main tip runs no git', async () => {
  const counts = new MainMovedCounts(repositoryDirectory);

  const first = await recordedGit.playStage([countAsked(SNAPSHOT_COMMIT, MAIN_TIP)], async () => counts.mainMovedByCommitsOf(SNAPSHOT_COMMIT, MAIN_TIP));
  const second = await recordedGit.playStage([], async () => counts.mainMovedByCommitsOf(SNAPSHOT_COMMIT, MAIN_TIP));

  expect([first, second]).toEqual([1, 1]);
});

testWhenGitIsRecorded('a moved main tip or a new snapshot commit asks git again, once each', async () => {
  const counts = new MainMovedCounts(repositoryDirectory);
  await recordedGit.playStage([countAsked(SNAPSHOT_COMMIT, MAIN_TIP)], async () => counts.mainMovedByCommitsOf(SNAPSHOT_COMMIT, MAIN_TIP));

  await recordedGit.playStage([countAsked(SNAPSHOT_COMMIT, LATER_MAIN_TIP)], async () => counts.mainMovedByCommitsOf(SNAPSHOT_COMMIT, LATER_MAIN_TIP));
  const afterResume = await recordedGit.playStage([], async () => counts.mainMovedByCommitsOf(LATER_MAIN_TIP, LATER_MAIN_TIP));
  await recordedGit.playStage([countAsked(MAIN_TIP, LATER_MAIN_TIP)], async () => counts.mainMovedByCommitsOf(MAIN_TIP, LATER_MAIN_TIP));

  expect(afterResume).toBe(0);
});

testWhenGitIsRecorded('no snapshot commit and no main tip count 0 with no git', async () => {
  const counts = new MainMovedCounts(repositoryDirectory);

  const read = await recordedGit.playStage([], async () => [counts.mainMovedByCommitsOf(null, MAIN_TIP), counts.mainMovedByCommitsOf(SNAPSHOT_COMMIT, null)]);

  expect(read).toEqual([0, 0]);
});
