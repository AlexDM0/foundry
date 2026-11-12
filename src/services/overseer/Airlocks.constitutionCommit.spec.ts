/**
 * The constitution commit through the main line's Airlock (plan section 8.7, Q1 and Q18). What matters: an Apply whose text main lacks
 * gets one `constitution-commit` job on the main line, before any ticket candidate and also while the board is paused, which commits only
 * `CONSTITUTION.md` and lands it with no gate, its slot going from `committing` to `landing`, and the landing's hold runs Apply's stage 2;
 * a main checkout that stops the fast-forward holds the request with its reason and files and never refuses it, and a clean main lands it
 * on the next sweep; a moved main line gets a fresh job on the new tip, and a changed `CONSTITUTION.md` refuses `constitution-moved`; a
 * signing failure refuses with git's text and leaves no commit, and no call overrides the signing; a commit with any other path never
 * lands; no `merge-refused` decision ever opens for the job. The crash rows are in `CrashMatrix.merges.spec.ts`. The folders are real; git
 * answers from the recorded answer sets of `src/services/overseer/testing/ConstitutionCommitAnswers.ts`.
 */
import { existsSync } from 'node:fs';

import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { LogRecord }                        from '../../lib/tracker-model/@types/LogRecord.ts';
import { useRecordedGit, type RecordedGitStage } from '../../testing/RecordedGit.ts';
import { AirlockAnswerSets, MOVED_AIRLOCK_IDS }  from './testing/AirlockAnswerSets.ts';
import {
  createRecordedAirlocksHarness,
  HARNESS_AT,
  RECORDED_AIRLOCK_IDS,
  type AirlocksHarness,
  type HarnessTicket
} from './testing/AirlocksHarness.ts';
import {
  commitWorktreeOf,
  CONSTITUTION_COMMIT_IDS,
  ConstitutionCommitAnswers,
  PLANTED_MERGE_GATE,
  requestConstitutionApply,
  UPDATE_SUBJECT,
  type ConstitutionCommitWalk
} from './testing/ConstitutionCommitAnswers.ts';

const recordedGit = useRecordedGit();

const { MAIN_TIP, TICKET_TIP } = RECORDED_AIRLOCK_IDS;
const { MOVED_MAIN_TIP } = MOVED_AIRLOCK_IDS;
const { COMMITTED_TIP, SECOND_COMMITTED_TIP, OTHER_BLOB } = CONSTITUTION_COMMIT_IDS;

let harness: AirlocksHarness | null = null;

afterEach(() => {
  harness?.remove();
  harness = null;
});

interface HarnessWithAnApply {
  current: AirlocksHarness;
  setupId: string;
}

function harnessWithAnApply(tickets: readonly HarnessTicket[] = [], resumesBoard = false): HarnessWithAnApply {
  const current = createRecordedAirlocksHarness(tickets);
  harness = current;
  return { current, setupId: requestConstitutionApply(current.board, resumesBoard) };
}

function walkOf(current: AirlocksHarness, changes: Partial<ConstitutionCommitWalk> = {}): RecordedGitStage {
  return ConstitutionCommitAnswers.constitutionCommitAnswersOf({
    repository: current.repository, jobId: 'J1', mainTip: MAIN_TIP, committedTip: COMMITTED_TIP, ...changes
  });
}

function recordsOf(current: AirlocksHarness, kind: LogRecord['kind']): LogRecord[] {
  return current.board.logRecordsSoFar().filter((record) => record.kind === kind);
}

function fieldsOf(current: AirlocksHarness, kind: LogRecord['kind']): unknown[] {
  return recordsOf(current, kind).map((record) => ('fields' in record ? record.fields : null));
}

function commitCallsAsked(): (readonly string[])[] {
  return recordedGit.flowCalls().filter((asked) => asked.includes('commit'));
}

function fastForwardsAsked(): string[] {
  return recordedGit.flowCalls().filter((asked) => asked[0] === 'merge' && asked[1] === '--ff-only').map((asked) => asked.at(-1) ?? '');
}

describe('an Apply whose text main lacks', () => {
  test('gets one constitution-commit job on the main line that commits only CONSTITUTION.md, lands it ungated and runs stage 2', async () => {
    const { current, setupId } = harnessWithAnApply();
    current.settings.gateOutcome = 'failed';
    recordedGit.answerFrom(walkOf(current));

    expect(await current.slots.sweep()).toEqual([]);

    expect(current.phases).toEqual(['committing', 'landing']);
    expect(current.gatedTrees).toEqual([]);
    expect(fieldsOf(current, 'job-launched')).toEqual([expect.objectContaining({
      kind: 'constitution-commit', role: null, ticketIds: [], target: 'main'
    })]);
    expect(recordsOf(current, 'merge-started')).toEqual([]);
    expect(commitCallsAsked()).toEqual([['commit', '--no-verify', '-q', '-m', UPDATE_SUBJECT]]);
    expect(fastForwardsAsked()).toEqual([COMMITTED_TIP]);
    expect(fieldsOf(current, 'merge-landed')).toEqual([{ target: 'main', commit: COMMITTED_TIP, kind: 'landed' }]);
    expect(fieldsOf(current, 'job-ended')).toEqual([expect.objectContaining({ outcome: 'committed', commit: COMMITTED_TIP })]);
    expect(recordsOf(current, 'pipeline-applied')).toEqual([expect.objectContaining({ setupId, fields: expect.objectContaining({ constitutionCommit: COMMITTED_TIP }) })]);
    const tail = current.board.logRecordsSoFar().map((record) => record.kind).slice(-3);
    expect(tail).toEqual(['merge-landed', 'job-ended', 'pipeline-applied']);
    expect(current.board.pipelineSetup()).toBeNull();
    expect(current.board.pipeline()?.constitution).toEqual({ path: 'CONSTITUTION.md' });
    expect(current.board.pipeline()?.phases.merge).toEqual([PLANTED_MERGE_GATE]);
    expect(current.board.jobs()).toEqual([]);
    expect(current.board.decisions()).toEqual([]);
    expect(existsSync(commitWorktreeOf(current.repository, 'J1'))).toBe(false);
  });

  test('is allocated while the board is paused, and its stage 2 resumes the board when Apply asked for it', async () => {
    const { current } = harnessWithAnApply([], true);
    current.settings.dispatchIsStopped = true;
    recordedGit.answerFrom(walkOf(current));

    await current.slots.sweep();

    expect(fieldsOf(current, 'merge-landed')).toHaveLength(1);
    expect(fieldsOf(current, 'overseer-set')).toEqual([expect.objectContaining({ state: 'running' })]);
  });

  test('waits while a ticket\'s merge job holds main, then goes before the queued ticket candidate', async () => {
    const { current, setupId } = harnessWithAnApply([{ id: '001' }]);
    const { board } = current;
    const holder = board.claimAirlock({
      ticketId: '001', target: 'main', targetTip: MAIN_TIP, branchTip: TICKET_TIP, predictedConflictFiles: []
    }, () => 'main', current.branchTreeOf, HARNESS_AT).job;
    board.setJobSlot(holder.id, {
      target: 'main', targetTip: MAIN_TIP, branchTip: TICKET_TIP, phase: 'gating'
    });
    board.openIncident({
      kind: 'gate-cannot-run', ticketIds: [], jobId: holder.id, facts: { tree: 'example', gate: 'tests' }, defaultMove: 'gate-retry'
    }, HARNESS_AT);
    recordedGit.answerFrom([]);

    await current.slots.sweep();

    expect(board.jobs().map((job) => job.kind)).toEqual(['merge']);
    expect(board.pipelineSetup()?.applyRequest).toMatchObject({ state: 'committing', commitJobId: null });

    board.endJob(holder.id, { outcome: 'stopped', cause: 'merge-aborted' }, HARNESS_AT);
    const ticketAnswers = AirlockAnswerSets.mainLineAnswersOf({
      ticketId: '001', repository: current.repository, worktree: current.worktreeOf('001'), mainTip: COMMITTED_TIP, holdsMainLine: false,
    });
    recordedGit.answerFrom(ConstitutionCommitAnswers.constitutionCommitAnswersOf({
      repository: current.repository, jobId: 'J2', mainTip: MAIN_TIP, committedTip: COMMITTED_TIP, afterLanding: ticketAnswers.beforeTheMergeIn,
    }));

    await current.slots.sweep();

    expect(fieldsOf(current, 'job-launched').map((fields) => (fields as { kind: string }).kind)).toEqual(['merge', 'constitution-commit', 'merge']);
    expect(recordsOf(current, 'pipeline-applied')).toEqual([expect.objectContaining({ setupId })]);
    expect(fastForwardsAsked()[0]).toBe(COMMITTED_TIP);
    expect(current.gatedPhases).toEqual(['merge']);
  });
});

describe('a main line that stops the commit', () => {
  test('a main checkout holding a change to CONSTITUTION.md holds the target and the request with its files, and never refuses it', async () => {
    const { current, setupId } = harnessWithAnApply();
    recordedGit.answerFrom(walkOf(current, { mainCheckout: 'constitution-modified' }));

    const held = await current.slots.sweep();

    expect(held).toEqual([{
      target: 'main', branch: 'main', blockingFiles: ['CONSTITUTION.md'], heldFiles: []
    }]);
    expect(fieldsOf(current, 'job-ended')).toEqual([{ outcome: 'stopped', cause: 'target-held', deniedPermissions: [] }]);
    expect(current.board.pipelineSetup()?.applyRequest).toMatchObject({ state: 'held', reason: 'dirty-checkout', commitJobId: null });
    expect(fieldsOf(current, 'pipeline-apply-held')).toEqual([{ reason: 'dirty-checkout', blockingFiles: ['CONSTITUTION.md'] }]);
    expect(recordsOf(current, 'pipeline-apply-refused')).toEqual([]);
    expect(current.board.jobs()).toEqual([]);
    expect(existsSync(commitWorktreeOf(current.repository, 'J1'))).toBe(false);

    recordedGit.answerFrom(walkOf(current, { jobId: 'J2' }));
    expect(await current.slots.sweep()).toEqual([]);

    expect(recordsOf(current, 'pipeline-applied')).toEqual([expect.objectContaining({ setupId })]);
  });

  test('a main line moved by hand ends the job, and a fresh one commits on the new tip', async () => {
    const { current, setupId } = harnessWithAnApply();
    current.board.claimConstitutionCommitSlot({ setupId, target: 'main', targetTip: MAIN_TIP }, HARNESS_AT);
    recordedGit.answerFrom([
      ...walkOf(current, { tipAtLanding: MOVED_MAIN_TIP }),
      ...walkOf(current, { jobId: 'J2', mainTip: MOVED_MAIN_TIP, committedTip: SECOND_COMMITTED_TIP }),
    ]);

    await current.slots.sweep();

    expect(fieldsOf(current, 'job-ended')).toEqual([
      { outcome: 'stopped', cause: 'target-moved', deniedPermissions: [] },
      expect.objectContaining({ outcome: 'committed', commit: SECOND_COMMITTED_TIP }),
    ]);
    expect(fastForwardsAsked()).toEqual([SECOND_COMMITTED_TIP]);
    expect(recordsOf(current, 'pipeline-applied')).toHaveLength(1);
  });

  test('a CONSTITUTION.md changed on main since the record opened refuses constitution-moved, and nothing is committed', async () => {
    const { current } = harnessWithAnApply();
    recordedGit.answerFrom(walkOf(current, { mainBlob: OTHER_BLOB }));

    await current.slots.sweep();

    expect(current.board.pipelineSetup()?.applyRequest).toMatchObject({ state: 'refused', reason: 'constitution-moved' });
    expect(fieldsOf(current, 'job-ended')).toEqual([{ outcome: 'failed', cause: 'constitution-moved', deniedPermissions: [] }]);
    expect(recordedGit.flowCalls().filter((asked) => asked[0] === 'worktree')).toEqual([]);
  });
});

describe('a commit that cannot land', () => {
  test('a signer that fails refuses constitution-commit-unsigned with git\'s text, leaves no commit and never overrides the signing', async () => {
    const { current } = harnessWithAnApply();
    current.settings.signsCommits = true;
    recordedGit.answerFrom(walkOf(current, { commit: 'unsigned' }));

    await current.slots.sweep();

    expect(current.board.pipelineSetup()?.applyRequest).toMatchObject({ state: 'refused', reason: 'constitution-commit-unsigned' });
    const [refused] = fieldsOf(current, 'pipeline-apply-refused') as { reason: string; gitFailure: string | null }[];
    expect(refused?.gitFailure).toContain('gpg failed to sign the data');
    expect(fastForwardsAsked()).toEqual([]);
    expect(recordsOf(current, 'merge-landed')).toEqual([]);
    expect(recordedGit.flowCalls().flat().filter((argument) => argument.includes('gpgsign') || argument === '--no-gpg-sign')).toEqual([]);
    expect(existsSync(commitWorktreeOf(current.repository, 'J1'))).toBe(false);
    expect(current.board.decisions()).toEqual([]);
  });

  test('the same failure where the repository signs nothing refuses git-failed', async () => {
    const { current } = harnessWithAnApply();
    recordedGit.answerFrom(walkOf(current, { commit: 'unsigned' }));

    await current.slots.sweep();

    expect(current.board.pipelineSetup()?.applyRequest).toMatchObject({ state: 'refused', reason: 'git-failed' });
  });

  test('a commit that changes any other path is refused constitution-commit-unexpected-paths before landing, and never lands', async () => {
    const { current } = harnessWithAnApply();
    recordedGit.answerFrom(walkOf(current, { paths: 'constitution-and-base' }));

    await current.slots.sweep();

    expect(current.board.pipelineSetup()?.applyRequest).toMatchObject({ state: 'refused', reason: 'constitution-commit-unexpected-paths' });
    expect(fastForwardsAsked()).toEqual([]);
    expect(current.board.decisions()).toEqual([]);
    expect(current.board.incidents()).toEqual([]);
  });
});

describe('a request that changes while its job runs', () => {
  test('a cancelled Apply ends its job before any commit', async () => {
    const { current, setupId } = harnessWithAnApply();
    current.board.claimConstitutionCommitSlot({ setupId, target: 'main', targetTip: MAIN_TIP }, HARNESS_AT);
    current.board.cancelApply(setupId, HARNESS_AT);
    recordedGit.answerFrom([]);

    await current.slots.sweep();

    expect(fieldsOf(current, 'job-ended')).toEqual([{ outcome: 'stopped', cause: 'apply-cancelled', deniedPermissions: [] }]);
    expect(current.board.jobs()).toEqual([]);
  });
});
