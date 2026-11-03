/**
 * A snapshot the removal leaves is named in the log as a leftover, and a repository there is never deleted by hand. It runs real git: the
 * removal reaches git through `REAL_WORKTREE_REMOVAL_PRIMITIVES`, which holds `GitProcess.run` from load, so no mock of `GitProcess`
 * reaches it, and a mock another spec file left behind can answer it in the default suite.
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join }                  from 'node:path';

import { afterEach, beforeEach, expect } from 'bun:test';

import { boardFixture }                                   from '../../testing/BoardFixtures.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { testWhenGitIsPresent }                           from '../../testing/ToolGuard.ts';
import { OnboardingProposal }                             from '../lifecycle/OnboardingProposal.ts';
import type { TrackerChange }                             from '../tracker/TrackerPipeline.ts';
import { Onboarding }                                     from './Onboarding.ts';

const AT = '2026-10-31T12:00:00+01:00';

let rootDirectory = '';
let trackerDirectory = '';

beforeEach(() => {
  rootDirectory = createScratchDirectory('onboarding-root');
  trackerDirectory = createScratchDirectory('onboarding-tracker');
});

afterEach(() => {
  removeScratchDirectory(rootDirectory);
  removeScratchDirectory(trackerDirectory);
});

testWhenGitIsPresent('a snapshot the removal leaves is reported as a leftover in the log, and a repository there is never deleted by hand', () => {
  const { board } = boardFixture();
  const { job } = board.launchJob({
    kind: 'onboarder', role: 'onboarder', ticketIds: [], parentJobId: null, attempt: 1, target: null
  }, AT);
  OnboardingProposal.storeOutcome(trackerDirectory, job.id, { verdict: 'advised' });
  const leftoverSnapshot = join(trackerDirectory, 'onboard', job.id);
  mkdirSync(leftoverSnapshot, { recursive: true });
  Bun.spawnSync(['git', 'init', '-q'], { cwd: leftoverSnapshot });
  const change = { board, at: AT, workspace: { rootDirectory, trackerDirectory } } as unknown as TrackerChange;

  Onboarding.applySettledOnboarders(change, trackerDirectory, () => ({ questions: [], context: '' }));

  const notes = board.logRecordsSoFar().flatMap((record) => (record.kind === 'note' ? [record.fields.text] : []));
  expect(notes).toEqual([expect.stringContaining(`The onboarder snapshot ${leftoverSnapshot} is a leftover`)]);
  expect(existsSync(join(leftoverSnapshot, '.git'))).toBe(true);
});
