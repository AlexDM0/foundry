/**
 * The main line's Airlock of a tracker in a project folder, whose siblings land on the same main line. What matters: a sibling's journaled
 * landing requeues the slot silently and never counts toward parking, while a move nobody journaled parks as it does today; each landing is
 * journaled and holds the repository's landing lock only around its tip check and fast-forward, so a lock a sibling holds makes the landing
 * wait and a gate never runs under it; and a held main line clears once the paths its fast-forward changes are clean, where a tracker at
 * the root still waits for the whole checkout. git answers from the recorded answer sets of `testing/AirlockAnswerSets.ts` and
 * `testing/ConstitutionCommitAnswers.ts`.
 */
import { existsSync } from 'node:fs';

import {
  afterEach,
  describe,
  expect,
  test
} from 'bun:test';

import { RepositoryLandings, type RepositoryLanding } from '../../adapters/repository-landings/RepositoryLandings.ts';
import { LocalTimeUtil }                              from '../../lib/local-time/LocalTimeUtil.ts';
import { useRecordedGit }                             from '../../testing/RecordedGit.ts';
import type { SharedRepositoryLanding }               from '../lifecycle/Landing.ts';
import { LockGenerationSteps }                        from '../tracker/GenerationLock.ts';
import {
  AirlockAnswerSets,
  MOVED_AIRLOCK_IDS,
  type MainLineAnswers,
  type MainLineLanding
} from './testing/AirlockAnswerSets.ts';
import {
  createRecordedAirlocksHarness,
  HARNESS_AT,
  HARNESS_TRACKER_ID,
  RECORDED_AIRLOCK_IDS,
  type AirlocksHarness
} from './testing/AirlocksHarness.ts';
import { CONSTITUTION_COMMIT_IDS, ConstitutionCommitAnswers, requestConstitutionApply } from './testing/ConstitutionCommitAnswers.ts';

const recordedGit = useRecordedGit();

const { MAIN_TIP, TICKET_TIP, MERGED_TIP } = RECORDED_AIRLOCK_IDS;
const { MOVED_MAIN_TIP, SECOND_MOVED_MAIN_TIP } = MOVED_AIRLOCK_IDS;

const SIBLING_TRACKER_ID = 'tracker-example-gaia';
const SIBLING_PROCESS_ID = 4242;
const PROJECT_FILE = 'apps/forge/cart.ts';

let harness: AirlocksHarness | null = null;

afterEach(() => {
  harness?.remove();
  harness = null;
});

function answersOf(current: AirlocksHarness, landing: Partial<MainLineLanding> = {}): MainLineAnswers {
  return AirlockAnswerSets.mainLineAnswersOf({
    ticketId: '001', repository: current.repository, worktree: current.worktreeOf('001'), ...landing
  });
}

/** Ticket #001's harness, a tracker beside its siblings unless `besideSiblings` is false, answering from the sets of `landing`. */
function harnessAnswering(landing: Partial<MainLineLanding> = {}, besideSiblings = true): AirlocksHarness {
  const current = createRecordedAirlocksHarness([{ id: '001' }], {}, true, null, besideSiblings);
  recordedGit.answerFrom(answersOf(current, landing).beforeTheMergeIn);
  return current;
}

function sharedRepositoryOf(current: AirlocksHarness): SharedRepositoryLanding {
  if (current.sharedRepository === null) throw new Error('The harness lands alone.');
  return current.sharedRepository;
}

function journaledLandings(current: AirlocksHarness): RepositoryLanding[] {
  const reading = RepositoryLandings.readLandingJournal(sharedRepositoryOf(current).files);
  return reading.verdict === 'readable' ? reading.landings : [];
}

function siblingLands(current: AirlocksHarness, previousTip: string, commit: string): void {
  RepositoryLandings.appendLanding(sharedRepositoryOf(current).files, {
    trackerId: SIBLING_TRACKER_ID, target: 'main', previousTip, commit
  });
}

const siblingLockPayload = {
  holder:     { processId: SIBLING_PROCESS_ID, startStamp: null, bootIdentity: null },
  acquiredAt: LocalTimeUtil.formatLocalIso(new Date(HARNESS_AT)),
};

/** The sibling takes the landing lock as a live process would, and the returned call frees it. */
function siblingTakesTheLock(current: AirlocksHarness): () => void {
  const { lockDirectoryPath } = sharedRepositoryOf(current).files;
  const taken = LockGenerationSteps.attemptedAcquire(lockDirectoryPath, siblingLockPayload, () => false);
  if (taken.verdict !== 'acquired') throw new Error(`The sibling could not take the lock: ${taken.verdict}.`);
  return () => LockGenerationSteps.release(lockDirectoryPath, taken.generation, siblingLockPayload);
}

/** Nobody holds the lock: its folder is absent, or its newest generation is a released one. */
function landingLockIsFree(current: AirlocksHarness): boolean {
  const { lockDirectoryPath } = sharedRepositoryOf(current).files;
  if (!existsSync(lockDirectoryPath)) return true;
  const takenNow = LockGenerationSteps.attemptedAcquire(lockDirectoryPath, siblingLockPayload, () => false);
  if (takenNow.verdict !== 'acquired') return false;
  LockGenerationSteps.release(lockDirectoryPath, takenNow.generation, siblingLockPayload);
  return true;
}

function endingsOf(current: AirlocksHarness): (string | undefined)[] {
  return current.board.logRecordsSoFar().filter((record) => record.kind === 'job-ended').map((record) => (record.fields as { cause?: string }).cause);
}

function fastForwardsAsked(): string[] {
  return recordedGit.flowCalls().filter((asked) => asked[0] === 'merge' && asked[1] === '--ff-only').map((asked) => asked.at(-1) ?? '');
}

describe('a main line a sibling moved', () => {
  test('requeues silently on each journaled landing, never parks for them, and lands on top of the sibling\'s', async () => {
    harness = harnessAnswering();
    const current = harness;
    let moves = 0;
    current.settings.beforeGate = () => {
      moves += 1;
      if (moves === 1) {
        siblingLands(current, MAIN_TIP, MOVED_MAIN_TIP);
        recordedGit.answerFrom(answersOf(current, { mainTip: MOVED_MAIN_TIP, holdsMainLine: false }).beforeTheMergeIn);
      }
      if (moves === 2) {
        siblingLands(current, MOVED_MAIN_TIP, SECOND_MOVED_MAIN_TIP);
        recordedGit.answerFrom(answersOf(current, { mainTip: SECOND_MOVED_MAIN_TIP, holdsMainLine: false }).mergedIn);
      }
    };

    await current.slots.sweep();
    // Three merge-ins outlast one sweep's rounds: the next sweep takes the slot from its gate.
    await current.slots.sweep();

    expect(endingsOf(current)).toEqual(['target-moved-by-a-recorded-landing', 'target-moved-by-a-recorded-landing', undefined]);
    expect(current.board.tickets()[0]?.frontmatter.status).toBe('delivered');
    expect(current.board.tickets()[0]?.frontmatter.hold).toBeUndefined();
    expect(current.board.decisions()).toEqual([]);
    expect(fastForwardsAsked()).toEqual([MERGED_TIP]);
    expect(journaledLandings(current).at(-1)).toEqual({
      trackerId: HARNESS_TRACKER_ID, target: 'main', previousTip: SECOND_MOVED_MAIN_TIP, commit: MERGED_TIP
    });
  });

  test('a move nobody journaled still parks after TARGET_MOVED_MERGES_BEFORE_PARKING moves in a row', async () => {
    harness = harnessAnswering();
    const current = harness;
    let moves = 0;
    current.settings.beforeGate = () => {
      moves += 1;
      if (moves === 1) recordedGit.answerFrom(answersOf(current, { mainTip: MOVED_MAIN_TIP, holdsMainLine: false }).beforeTheMergeIn);
      else recordedGit.answerFrom(answersOf(current, { mainTip: SECOND_MOVED_MAIN_TIP, holdsMainLine: false }).mergedIn);
    };

    await current.slots.sweep();

    expect(endingsOf(current)).toEqual(['target-moved', 'target-moved']);
    expect(current.board.tickets()[0]?.frontmatter.hold).toBe('parked:target-moved');
    expect(journaledLandings(current)).toEqual([]);
  });
});

describe('the repository\'s landing lock', () => {
  test('is free while the merged tree is gated, and a landing journals itself before freeing it', async () => {
    harness = harnessAnswering();
    const current = harness;
    const lockFreeAtEachGate: boolean[] = [];
    current.settings.beforeGate = () => lockFreeAtEachGate.push(landingLockIsFree(current));

    await current.slots.sweep();

    expect(lockFreeAtEachGate).toEqual([true]);
    expect(current.board.tickets()[0]?.frontmatter.status).toBe('delivered');
    expect(journaledLandings(current)).toEqual([{
      trackerId: HARNESS_TRACKER_ID, target: 'main', previousTip: MAIN_TIP, commit: TICKET_TIP
    }]);
    expect(landingLockIsFree(current)).toBe(true);
  });

  test('held by a sibling, the landing waits in its slot asking git nothing, and lands on the sibling\'s journaled landing once freed', async () => {
    harness = harnessAnswering();
    const current = harness;
    const freeTheLock = siblingTakesTheLock(current);

    expect(await current.slots.sweep()).toEqual([]);
    expect(current.mergeJob()?.airlock?.phase).toBe('landing');
    expect(endingsOf(current)).toEqual([]);
    expect(recordedGit.flowCalls().some((asked) => asked[0] === 'symbolic-ref')).toBe(false);

    siblingLands(current, MAIN_TIP, MOVED_MAIN_TIP);
    recordedGit.answerFrom(answersOf(current, { mainTip: MOVED_MAIN_TIP, holdsMainLine: false }).beforeTheMergeIn);
    freeTheLock();
    await current.slots.sweep();

    expect(endingsOf(current)).toEqual(['target-moved-by-a-recorded-landing', undefined]);
    expect(current.board.tickets()[0]?.frontmatter.status).toBe('delivered');
    expect(journaledLandings(current).map((landing) => [landing.trackerId, landing.previousTip, landing.commit])).toEqual([
      [SIBLING_TRACKER_ID, MAIN_TIP, MOVED_MAIN_TIP],
      [HARNESS_TRACKER_ID, MOVED_MAIN_TIP, MERGED_TIP],
    ]);
  });
});

describe('a constitution commit', () => {
  test('waits in its landing while a sibling holds the lock, keeping its commit, and lands and journals itself once freed', async () => {
    const { COMMITTED_TIP } = CONSTITUTION_COMMIT_IDS;
    harness = createRecordedAirlocksHarness([], {}, true, null, true);
    const current = harness;
    requestConstitutionApply(current.board, false);
    recordedGit.answerFrom(ConstitutionCommitAnswers.constitutionCommitAnswersOf({
      repository: current.repository, jobId: 'J1', mainTip: MAIN_TIP, committedTip: COMMITTED_TIP
    }));
    const freeTheLock = siblingTakesTheLock(current);

    await current.slots.sweep();
    expect(current.mergeJob()?.airlock?.phase).toBe('landing');
    expect(fastForwardsAsked()).toEqual([]);

    freeTheLock();
    await current.slots.sweep();
    expect(fastForwardsAsked()).toEqual([COMMITTED_TIP]);
    expect(current.board.pipelineSetup()).toBeNull();
    expect(journaledLandings(current)).toEqual([{
      trackerId: HARNESS_TRACKER_ID, target: 'main', previousTip: MAIN_TIP, commit: COMMITTED_TIP
    }]);
  });
});

describe('a held main line', () => {
  const OFF_THE_MAIN_LINE: Partial<MainLineLanding> = { checkedOut: 'example-elsewhere', checkout: 'modified', changedPath: PROJECT_FILE };
  const BACK_ON_THE_MAIN_LINE: Partial<MainLineLanding> = { checkout: 'modified', changedPath: PROJECT_FILE };

  test('clears once the paths its fast-forward changes are clean, a file outside them still modified, and lands', async () => {
    harness = harnessAnswering(OFF_THE_MAIN_LINE);

    expect(await harness.slots.sweep()).toEqual([{
      target: 'main', branch: 'example-elsewhere', blockingFiles: [], heldFiles: []
    }]);

    recordedGit.answerFrom(answersOf(harness, BACK_ON_THE_MAIN_LINE).beforeTheMergeIn);
    expect(await harness.slots.sweep()).toEqual([]);
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('delivered');
    expect(fastForwardsAsked()).toEqual([TICKET_TIP]);
  });

  test('of a tracker at the repository\'s root still waits for the whole checkout to be clean', async () => {
    harness = harnessAnswering(OFF_THE_MAIN_LINE, false);
    await harness.slots.sweep();

    recordedGit.answerFrom(answersOf(harness, BACK_ON_THE_MAIN_LINE).beforeTheMergeIn);
    expect(await harness.slots.sweep()).toHaveLength(1);
    expect(harness.board.tickets()[0]?.frontmatter.status).toBe('in-review');
    expect(fastForwardsAsked()).toEqual([]);
  });
});
