/**
 * The first sweep after a start that leaves interrupted work waiting: a slot with no live holder is freed, its job ended `orphaned` and its ticket
 * held `interrupted:merge` instead of requeued, so no merge starts again by itself until User's resume lifts the hold; a constitution commit's Apply
 * waits for `resume --all` the same way.
 */
import { afterEach, expect, test } from 'bun:test';

import { INTERRUPTED_MERGE_HOLD } from '../../lib/tracker-model/constants/DecisionAndIncidentVocabulary.ts';
import {
  ancestryAsked,
  commitResolved,
  currentBranchRead,
  hardResetTo,
  mergeInAborted,
  revisionMissing,
  stepIn
} from '../../testing/RecordedAirlockGit.ts';
import { useRecordedGit }    from '../../testing/RecordedGit.ts';
import { AirlockAnswerSets } from './testing/AirlockAnswerSets.ts';
import {
  createRecordedAirlocksHarness,
  HARNESS_AT,
  RECORDED_AIRLOCK_IDS,
  type AirlocksHarness
} from './testing/AirlocksHarness.ts';
import { CONSTITUTION_COMMIT_IDS, ConstitutionCommitAnswers, requestConstitutionApply } from './testing/ConstitutionCommitAnswers.ts';

const recordedGit = useRecordedGit();

const { MAIN_TIP, TICKET_TIP, MERGED_TIP } = RECORDED_AIRLOCK_IDS;
const { COMMITTED_TIP } = CONSTITUTION_COMMIT_IDS;

let harness: AirlocksHarness | null = null;

afterEach(() => {
  harness?.remove();
  harness = null;
});

/** Ticket `001`'s merge job holds the main line's slot in `phase`, as a run cut short left it. */
function slotLeftIn(phase: 'merge-in' | 'landing'): AirlocksHarness {
  const current = createRecordedAirlocksHarness([{ id: '001' }]);
  current.board.claimAirlock({
    ticketId: '001', target: 'main', targetTip: MAIN_TIP, branchTip: TICKET_TIP, predictedConflictFiles: ['shared.txt']
  }, () => 'main', current.branchTreeOf, HARNESS_AT);
  const job = current.mergeJob();
  if (job?.airlock === undefined) throw new Error('no slot was claimed');
  current.board.setJobSlot(job.id, { ...job.airlock, phase });
  return current;
}

function endedCauseOf(current: AirlocksHarness, jobId: string | undefined): unknown {
  const ended = current.board.logRecordsSoFar().find((record) => record.kind === 'job-ended' && record.jobId === jobId);
  return (ended?.fields as { cause?: string } | undefined)?.cause;
}

function holdOf(current: AirlocksHarness): string | undefined {
  return current.board.ticketByReference('001')?.frontmatter.hold;
}

test('after a start that waits, a merge-in left mid-merge is aborted, reset to the branch tip and held interrupted:merge, never requeued', async () => {
  harness = slotLeftIn('merge-in');
  const current = harness;
  const orphanedJobId = current.mergeJob()?.id;
  current.settings.startHoldsOrphans = true;

  await recordedGit.playStage(mergeInAborted(MAIN_TIP, TICKET_TIP), () => current.slots.sweep());

  expect(endedCauseOf(current, orphanedJobId)).toBe('orphaned');
  expect(holdOf(current)).toBe(INTERRUPTED_MERGE_HOLD);
  expect(current.mergeJob()).toBeUndefined();
});

test('a slot a stop left restored before its job ended is held the same way, with nothing to abort', async () => {
  harness = slotLeftIn('merge-in');
  const current = harness;
  const orphanedJobId = current.mergeJob()?.id;
  current.settings.startHoldsOrphans = true;

  await recordedGit.playStage([revisionMissing('MERGE_HEAD'), ...hardResetTo(TICKET_TIP)], () => current.slots.sweep());

  expect(endedCauseOf(current, orphanedJobId)).toBe('orphaned');
  expect(holdOf(current)).toBe(INTERRUPTED_MERGE_HOLD);
  expect(current.mergeJob()).toBeUndefined();
});

test('User\'s resume lifts the hold with no fresh attempt, and the next sweep takes the Airlock again for the ticket', async () => {
  harness = slotLeftIn('merge-in');
  const current = harness;
  const orphanedJobId = current.mergeJob()?.id;
  current.settings.startHoldsOrphans = true;
  await recordedGit.playStage(mergeInAborted(MAIN_TIP, TICKET_TIP), () => current.slots.sweep());

  current.board.liftInterruptedHold('001', HARNESS_AT);
  recordedGit.answerFrom(AirlockAnswerSets.conflictingMergeIn('001'));
  await current.slots.sweep();

  expect(current.board.logRecordsSoFar().filter((record) => record.kind === 'ticket-unheld')).toEqual([]);
  expect(current.mergeJob()?.id).not.toBe(orphanedJobId);
  expect(current.mergeJob()?.ticketIds).toEqual(['001']);
});

test('an Airlock agent the start found interrupted leaves its slot: the merge aborts, the agent ends and the ticket is held', async () => {
  harness = createRecordedAirlocksHarness([{ id: '001' }]);
  const current = harness;
  recordedGit.answerFrom(AirlockAnswerSets.conflictingMergeIn('001'));
  await current.slots.sweep();
  const mergeJobId = current.mergeJob()?.id;
  const agentId = current.mergeAgent()?.id ?? '';
  current.board.moveJob(agentId, 'running', HARNESS_AT);
  current.board.interruptJob(agentId, 'forge-crashed', HARNESS_AT);
  current.settings.startHoldsOrphans = true;

  await recordedGit.playStage(mergeInAborted(MAIN_TIP, TICKET_TIP), () => current.slots.sweep());

  expect(endedCauseOf(current, mergeJobId)).toBe('orphaned');
  expect(endedCauseOf(current, agentId)).toBe('orphaned');
  expect(holdOf(current)).toBe(INTERRUPTED_MERGE_HOLD);
});

test('an Airlock agent that still runs keeps its slot after a start that waits, and no git is asked', async () => {
  harness = createRecordedAirlocksHarness([{ id: '001' }]);
  const current = harness;
  recordedGit.answerFrom(AirlockAnswerSets.conflictingMergeIn('001'));
  await current.slots.sweep();
  const agentId = current.mergeAgent()?.id ?? '';
  current.board.moveJob(agentId, 'running', HARNESS_AT);
  current.settings.childIsLive = true;
  current.settings.startHoldsOrphans = true;

  await recordedGit.playStage([], () => current.slots.sweep());

  expect(current.mergeJob()?.airlock?.phase).toBe('resolving');
  expect(holdOf(current)).toBeUndefined();
});

test('a landing git made before the start is recorded on the board, never held', async () => {
  harness = slotLeftIn('landing');
  const current = harness;
  current.settings.startHoldsOrphans = true;
  recordedGit.answerFrom([
    stepIn(current.worktreeOf('001'), commitResolved('HEAD', MERGED_TIP)),
    stepIn(current.repository, currentBranchRead('main')),
    commitResolved('refs/heads/main', MERGED_TIP),
    ancestryAsked(MERGED_TIP, MERGED_TIP, true),
  ]);

  await current.slots.sweep();

  expect(current.board.tickets()[0]?.frontmatter.status).toBe('delivered');
  expect(holdOf(current)).toBeUndefined();
});

test('a ticket held interrupted:merge while its job holds the slot waits: the slot is neither aborted nor advanced', async () => {
  harness = slotLeftIn('merge-in');
  const current = harness;
  current.board.holdTicket('001', INTERRUPTED_MERGE_HOLD, HARNESS_AT);

  await recordedGit.playStage([], () => current.slots.sweep());

  expect(current.mergeJob()?.airlock?.phase).toBe('merge-in');
});

test('a constitution commit the start found cut short ends orphaned and its Apply waits, unclaimed, until User\'s resume --all', async () => {
  harness = createRecordedAirlocksHarness([]);
  const current = harness;
  const setupId = requestConstitutionApply(current.board);
  current.board.claimConstitutionCommitSlot({ setupId, target: 'main', targetTip: MAIN_TIP }, HARNESS_AT);
  current.settings.startHoldsOrphans = true;

  await recordedGit.playStage([], () => current.slots.sweep());
  await recordedGit.playStage([], () => current.slots.sweep());

  expect(endedCauseOf(current, 'J1')).toBe('orphaned');
  expect(current.board.jobs()).toEqual([]);
  expect(current.board.pipelineSetup()?.applyRequest).toMatchObject({ state: 'held', reason: 'interrupted', commitJobId: null });

  current.board.liftInterruptedApply(HARNESS_AT);
  recordedGit.answerFrom(ConstitutionCommitAnswers.constitutionCommitAnswersOf({
    repository: current.repository, jobId: 'J2', mainTip: MAIN_TIP, committedTip: COMMITTED_TIP
  }));
  await current.slots.sweep();

  const applied = current.board.logRecordsSoFar().filter((record) => record.kind === 'pipeline-applied');
  expect(applied.map((record) => ('setupId' in record ? record.setupId : null))).toEqual([setupId]);
});

test('without a start that waits, an orphaned merge-in is requeued as before', async () => {
  harness = slotLeftIn('merge-in');
  const current = harness;
  const orphanedJobId = current.mergeJob()?.id;

  await recordedGit.playStage(AirlockAnswerSets.abortedAndMergedInAgain('001', true), () => current.slots.sweep());

  expect(endedCauseOf(current, orphanedJobId)).toBe('orphaned');
  expect(holdOf(current)).toBeUndefined();
  expect(current.mergeJob()?.id).not.toBe(orphanedJobId);
});
