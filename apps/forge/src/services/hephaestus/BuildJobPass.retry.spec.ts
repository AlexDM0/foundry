/**
 * The commit check (`aCommitSinceTheStart`) on a build retry, through the hold: a second attempt whose branch holds the failed attempt's
 * commit is measured from the ticket's fork point and passes, while a branch with no commit since its fork point is still sent back. Git
 * answers from the recorded flow stages of `src/testing/RecordedGitFlow.ts`.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import path, { join }              from 'node:path';
import { afterEach, expect, test } from 'bun:test';


import type { Job }                                       from '../../domain/tracker-model/@types/Job.ts';
import type { Board }                                     from '../../domain/tracker-model/Board.ts';
import { GitProcess }                                     from '../../lib/git/GitProcess.ts';
import { branchNamesOf }                                  from '../../shared/BranchNames.ts';
import { PRODUCT_NAMES }                                  from '../../shared/constants/ProductNames.ts';
import { boardFixture, ticketFixture }                    from '../../testing/BoardFixtures.ts';
import { fakeAgentAdapter }                               from '../../testing/FakeAgentAdapter.ts';
import { useRecordedGit }                                 from '../../testing/RecordedGit.ts';
import { RECORDED_FLOW_TICKET_BRANCH }                    from '../../testing/RecordedGitFlow.ts';
import { createScratchDirectory, removeScratchDirectory } from '../../testing/ScratchWorkspace.ts';
import { describeWhenGitIsRecorded }                      from '../../testing/ToolGuard.ts';
import type { BoardTransaction }                          from '../tracker/BoardTransaction.ts';
import type { JobLaunchContext }                          from './@types/JobLaunchContext.ts';
import { BuildJobPass }                                   from './BuildJobPass.ts';
import { jobFolderIn }                                    from './HephaestusFiles.ts';
import { JobLaunch }                                      from './JobLaunch.ts';
import { keptRedHandoffOf }                               from './testing/KeptRedHandoff.ts';

const AT = '2026-10-30T10:00:00+01:00';

const recordedGit = useRecordedGit();

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) removeScratchDirectory(folder);
});

interface RetryScene {
  board:             Board;
  context:           JobLaunchContext;
  worktree:          string;
  /** The first attempt's commit on the ticket branch. */
  commitOnTheBranch: () => void;
  /** Launches a build attempt on ticket `001` and records its start as Hephaestus does when its child is first launched. */
  launchAttempt:     (attempt: number) => Readonly<Job>;
  /** Hands the attempt's built report to the hold, which verifies it. */
  reportBuilt:       (job: Readonly<Job>) => void;
}

function retryScene(): RetryScene {
  const rootDirectory = createScratchDirectory('retry-root');
  const trackerParent = createScratchDirectory('retry-tracker');
  const trackerDirectory = join(trackerParent, PRODUCT_NAMES.DATA_FOLDER);
  folders.push(rootDirectory, trackerParent);
  const worktree = join(rootDirectory, PRODUCT_NAMES.WORKTREES_FOLDER, RECORDED_FLOW_TICKET_BRANCH);
  mkdirSync(worktree, { recursive: true });
  recordedGit.enterFlowStage('worktree made', rootDirectory);
  const { board } = boardFixture({ tickets: [ticketFixture({ id: '001', status: 'in-progress', task: 1 })] });
  const context = {
    workspace:     { rootDirectory, trackerDirectory },
    mainLine:      'main',
    branchNames:   branchNamesOf(null),
    log:           () => undefined,
    platformPorts: { dataFolders: { pathModule: path, foldsCase: false } },
    agentAdapter:  fakeAgentAdapter(),
  } as unknown as JobLaunchContext;
  const change = { board, at: AT } as unknown as BoardTransaction;
  const launchAttempt = (attempt: number): Readonly<Job> => {
    const { job } = board.launchJob({
      kind: 'build', role: 'builder', ticketIds: ['001'], parentJobId: null, attempt, target: 'main'
    }, AT);
    JobLaunch.recordJobStart(context, board, job);
    return job;
  };
  const reportBuilt = (job: Readonly<Job>): void => {
    for (const state of ['preparing', 'running', 'in-customs'] as const) board.moveJob(job.id, state, AT);
    const report = {
      role:              'builder',
      outcome:           'built',
      headCommit:        GitProcess.resolvedCommitOf(worktree, 'HEAD'),
      acceptance:        [{ item: 'A1', state: 'met', evidence: 'ExamplePage.spec.ts' }],
      alsoFixed:         [],
      gates:             [],
      handoff:           'Example handoff.',
      blockedReason:     null,
      cannotBuildReason: null,
    };
    BuildJobPass.applyBuildJobObservations(change, context, [{
      jobId:            job.id,
      setup:            'installed',
      installStepRuns:  [],
      calls:            1,
      report,
      agentEnd:         null,
      gate:             { verdict: 'pending' },
      sandboxRefusal:   null,
      targetCatchUp:    { verdict: 'not-checked' },
      mainMerge:        null,
      conflictReReview: null
    }]);
  };
  return {
    board, context, worktree, commitOnTheBranch: () => recordedGit.enterFlowStage('tree changed', rootDirectory), launchAttempt, reportBuilt
  };
}

function jobById(board: Board, jobId: string): Readonly<Job> | undefined {
  return board.jobs().find((job) => job.id === jobId);
}

/** A refused commit check sends the session back with a red handoff naming the check, its reason in the restart; `null` when nothing went red. */
function customsRefusalOf(scene: RetryScene, job: Readonly<Job>): string | null {
  const facts = keptRedHandoffOf(jobFolderIn(scene.context.workspace.trackerDirectory, job.id));
  if (facts === null) return null;
  const restart = readFileSync(facts.gateFailureNotePath, 'utf8');
  return `${facts.name}: ${restart.includes('no-commit-since-start') ? 'no-commit-since-start' : 'another reason'}`;
}

describeWhenGitIsRecorded('a build retry under V3', () => {
  test('passes to the gates when its branch already holds the failed first attempt\'s commit and it adds none', () => {
    const scene = retryScene();
    const firstAttempt = scene.launchAttempt(1);
    scene.commitOnTheBranch();
    scene.board.endJob(firstAttempt.id, { outcome: 'failed', cause: 'foreign-ref-moved' }, AT);

    const secondAttempt = scene.launchAttempt(2);
    scene.reportBuilt(secondAttempt);

    expect(customsRefusalOf(scene, secondAttempt)).toBeNull();
    expect(jobById(scene.board, secondAttempt.id)?.state).toBe('gating');
  });

  test('still fails V3 no-commit-since-start when the branch holds no commit since its fork point', () => {
    const scene = retryScene();
    const firstAttempt = scene.launchAttempt(1);
    scene.board.endJob(firstAttempt.id, { outcome: 'failed', cause: 'foreign-ref-moved' }, AT);

    const secondAttempt = scene.launchAttempt(2);
    scene.reportBuilt(secondAttempt);

    expect(customsRefusalOf(scene, secondAttempt)).toBe('V3: no-commit-since-start');
    expect(jobById(scene.board, secondAttempt.id)).toMatchObject({ state: 'interrupted', interruption: 'handoff-red' });
  });
});
