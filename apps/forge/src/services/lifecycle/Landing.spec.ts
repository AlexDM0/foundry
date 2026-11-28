/**
 * Landing on recorded git answers (`src/lib/git/RecordedGitAnswers.integration.spec.ts`): a moved target never lands; main lands by a
 * fast-forward and a group branch by `merge --ff-only`; a crash's half-landed commit reads as landed; every refusal maps to a typed outcome;
 * a tracker in a project folder journals each landing once. Each stage names every git call in order, so an unnamed call fails.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';

import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';


import { RepositoryLandings }                                 from '../../adapters/repository-landings/RepositoryLandings.ts';
import { HELD_CHECKOUT_RETRY_TRIES }                          from '../../lib/git/HeldCheckout.ts';
import { PRODUCT_NAMES }                                      from '../../shared/constants/ProductNames.ts';
import { ticketFixture }                                      from '../../testing/BoardFixtures.ts';
import { heldFileGit, type CountingCheckoutWritePrimitives }  from '../../testing/HeldFileGit.ts';
import { LIVE_HOLDERS_LOCK_TAKER, lockTakerJudgingHoldersBy } from '../../testing/LockTakers.ts';
import {
  GIT_CALL_SHAPES,
  RECORDED_PLACEHOLDERS,
  type RecordedGitStage,
  useRecordedGit
} from '../../testing/RecordedGit.ts';
import { createScratchDirectory, removeScratchDirectory }           from '../../testing/ScratchWorkspace.ts';
import { loadedRecordFixture }                                      from '../../testing/TicketDocumentRecordFixtures.ts';
import { describeWhenGitIsRecorded }                                from '../../testing/ToolGuard.ts';
import { LockGenerationSteps, type StaleLockRecordTakenOver }       from '../tracker/GenerationLock.ts';
import { Landing, LANDING_OUTCOME_OF_REFUSAL, type LandingRequest } from './Landing.ts';

const MAIN_TIP = '1'.repeat(40);
const MERGED_COMMIT = '3'.repeat(40);
const HELD_COMMIT = '5'.repeat(40);
const MOVED_TIP = '6'.repeat(40);

const { playStage } = useRecordedGit();

let repositoryDirectory = '';

function mainLanding(overrides: Partial<LandingRequest> = {}): LandingRequest {
  return {
    target:            { branch: 'main', directory: repositoryDirectory },
    mergedCommit:      MERGED_COMMIT,
    expectedTargetTip: MAIN_TIP,
    recordedLandings:  [],
    hookPolicy:        'hooks-off',
    ...overrides,
  };
}

beforeEach(() => {
  repositoryDirectory = createScratchDirectory('landing');
  writeFileSync(join(repositoryDirectory, 'base.ts'), 'export const base = true;\n');
});

afterEach(() => {
  removeScratchDirectory(`${repositoryDirectory}-worktrees`);
  removeScratchDirectory(repositoryDirectory);
});

function onBranch(branch: string, directory = repositoryDirectory): RecordedGitStage {
  return [
    {
      gitArguments: ['symbolic-ref', '--quiet', '--short', 'HEAD'], answeredAs: GIT_CALL_SHAPES.CURRENT_BRANCH, filledIn: { '<branch>': branch }, directory
    },
  ];
}

function resolved(revision: string, commit: string, directory = repositoryDirectory): RecordedGitStage[number] {
  return {
    gitArguments: ['rev-parse', '--verify', '--quiet', '--end-of-options', `${revision}^{commit}`],
    answeredAs:   GIT_CALL_SHAPES.BRANCH_COMMIT_RESOLVED,
    filledIn:     { '<commit>': commit },
    directory,
  };
}

function namesChangedUpTo(commit: string): RecordedGitStage[number] {
  return {
    gitArguments: ['diff', '--name-only', '--no-renames', '-z', 'HEAD', commit, '--'],
    answeredAs:   commit === HELD_COMMIT ? GIT_CALL_SHAPES.NAMES_THE_HELD_COMMIT_CHANGES : GIT_CALL_SHAPES.NAMES_THE_FEATURE_CHANGES,
  };
}

function fastForwardTo(commit: string, directory = repositoryDirectory): RecordedGitStage {
  return [
    { gitArguments: ['merge', '--ff-only', '--quiet', commit], answeredAs: GIT_CALL_SHAPES.FAST_FORWARD_TO_THE_FEATURE, directory },
    resolved('HEAD', commit, directory),
  ];
}

const CLEAN_STATUS: RecordedGitStage[number] = { gitArguments: ['status', '--porcelain=v1', '-z', '--untracked-files=all'], answeredAs: GIT_CALL_SHAPES.LANDING_CHECKOUT_CLEAN };

function landedIn(stage: RecordedGitStage, request: LandingRequest): Promise<ReturnType<typeof Landing.landOnTarget>> {
  return playStage(stage, () => Promise.resolve(Landing.landOnTarget(request)));
}

describeWhenGitIsRecorded('landing a gated commit', () => {
  test('main at the expected tip is fast-forwarded to exactly the merged commit, the previous tip recorded', async () => {
    expect(await landedIn([
      ...onBranch('main'),
      resolved('refs/heads/main', MAIN_TIP),
      CLEAN_STATUS,
      namesChangedUpTo(MERGED_COMMIT),
      ...fastForwardTo(MERGED_COMMIT),
    ], mainLanding())).toEqual({ verdict: 'landed', commit: MERGED_COMMIT, previousTip: MAIN_TIP });
  });

  test('a group branch lands by merge --ff-only in the worktree it is checked out in', async () => {
    const groupWorktree = join(`${repositoryDirectory}-worktrees`, 'group-example');
    mkdirSync(groupWorktree, { recursive: true });

    const landing = await landedIn([
      ...onBranch('group-example', groupWorktree),
      resolved('refs/heads/group-example', MAIN_TIP, groupWorktree),
      CLEAN_STATUS,
      namesChangedUpTo(MERGED_COMMIT),
      ...fastForwardTo(MERGED_COMMIT, groupWorktree),
    ], mainLanding({ target: { branch: 'group-example', directory: groupWorktree } }));

    expect(landing).toEqual({ verdict: 'landed', commit: MERGED_COMMIT, previousTip: MAIN_TIP });
  });

  test('a target moved by nobody Hephaestus recorded is refused target-moved, and nothing moves', async () => {
    expect(await landedIn([
      ...onBranch('main'),
      resolved('refs/heads/main', MOVED_TIP),
      { gitArguments: ['merge-base', '--is-ancestor', MERGED_COMMIT, MOVED_TIP], answeredAs: GIT_CALL_SHAPES.NOT_AN_ANCESTOR_OF_THE_TIP },
    ], mainLanding())).toEqual({ verdict: 'refused', reason: 'target-moved', facts: { targetTip: MOVED_TIP } });
  });

  test('a target moved by a recorded landing is refused so the slot requeues from the branch tip', async () => {
    const landing = await landedIn([
      ...onBranch('main'),
      resolved('refs/heads/main', MOVED_TIP),
      { gitArguments: ['merge-base', '--is-ancestor', MERGED_COMMIT, MOVED_TIP], answeredAs: GIT_CALL_SHAPES.NOT_AN_ANCESTOR_OF_THE_TIP },
    ], mainLanding({ recordedLandings: [MOVED_TIP] }));

    expect(landing).toMatchObject({ verdict: 'refused', reason: 'target-moved-by-a-recorded-landing' });
    expect(LANDING_OUTCOME_OF_REFUSAL['target-moved-by-a-recorded-landing']).toBe('requeue-from-branch-tip');
  });

  test('a merged commit the target already holds reads as already landed: the board side is what is left to finish', async () => {
    expect(await landedIn([
      ...onBranch('main'),
      resolved('refs/heads/main', MERGED_COMMIT),
      { gitArguments: ['merge-base', '--is-ancestor', MERGED_COMMIT, MERGED_COMMIT], answeredAs: GIT_CALL_SHAPES.ANCESTOR_OF_THE_TIP },
    ], mainLanding())).toEqual({ verdict: 'already-landed', commit: MERGED_COMMIT, targetTip: MERGED_COMMIT });
  });

  test('a checkout on another branch is refused not-on-target-branch, a target-level hold', async () => {
    expect(await landedIn(onBranch('elsewhere'), mainLanding())).toMatchObject({ verdict: 'refused', reason: 'not-on-target-branch' });
    expect(LANDING_OUTCOME_OF_REFUSAL['not-on-target-branch']).toBe('hold-target');
  });

  test('a dirty main checkout blocking the fast-forward is refused dirty-checkout, naming the files, and main stays', async () => {
    writeFileSync(join(repositoryDirectory, 'feature.ts'), 'export const localEdit = true;\n');

    const landing = await landedIn([
      ...onBranch('main'),
      resolved('refs/heads/main', MAIN_TIP),
      { gitArguments: ['status', '--porcelain=v1', '-z', '--untracked-files=all'], answeredAs: GIT_CALL_SHAPES.LANDING_CHECKOUT_WITH_FEATURE_FILE },
      namesChangedUpTo(MERGED_COMMIT),
      { gitArguments: ['merge', '--ff-only', '--quiet', MERGED_COMMIT], answeredAs: GIT_CALL_SHAPES.FAST_FORWARD_BLOCKED_BY_FEATURE },
    ], mainLanding());

    expect(landing).toMatchObject({ verdict: 'refused', reason: 'dirty-checkout', facts: { blockingFiles: ['feature.ts'] } });
    expect(LANDING_OUTCOME_OF_REFUSAL['dirty-checkout']).toBe('hold-target');
    expect(readFileSync(join(repositoryDirectory, 'feature.ts'), 'utf8')).toBe('export const localEdit = true;\n');
  });

  /** A held run writes the feature's `feature.ts` and fails on `base.ts`; after it the checkout is read back to put that write back. */
  function heldLanding(heldRuns: number): CountingCheckoutWritePrimitives {
    return heldFileGit('base.ts', heldRuns, () => {
      writeFileSync(join(repositoryDirectory, 'feature.ts'), 'export const feature = true;\n');
    });
  }

  const READS_AFTER_A_HELD_RUN: RecordedGitStage = [
    namesChangedUpTo(HELD_COMMIT),
    { gitArguments: ['ls-tree', '-r', '-z', '--full-tree', HELD_COMMIT], answeredAs: GIT_CALL_SHAPES.TREE_OF_THE_HELD_COMMIT },
    { gitArguments: ['hash-object', '--stdin-paths'], answeredAs: GIT_CALL_SHAPES.HASHES_OF_BASE_AND_FEATURE },
    { gitArguments: ['ls-tree', '-r', '-z', '--full-tree', 'HEAD'], answeredAs: GIT_CALL_SHAPES.TREE_OF_THE_LANDING_BASE },
  ];

  function callsBeforeTheHeldRuns(): RecordedGitStage {
    return [...onBranch('main'), resolved('refs/heads/main', MAIN_TIP), CLEAN_STATUS, namesChangedUpTo(HELD_COMMIT)];
  }

  test('a file held open on every try is refused target-file-held naming it, never dirty-checkout, and what git wrote is put back', async () => {
    const git = heldLanding(HELD_CHECKOUT_RETRY_TRIES);
    const landing = await landedIn([
      ...callsBeforeTheHeldRuns(),
      ...Array.from({ length: HELD_CHECKOUT_RETRY_TRIES }, () => READS_AFTER_A_HELD_RUN).flat(),
    ], mainLanding({ mergedCommit: HELD_COMMIT, checkoutWritePrimitives: git }));

    expect(landing).toMatchObject({ verdict: 'refused', reason: 'target-file-held', facts: { heldFiles: ['base.ts'] } });
    expect(landing).not.toHaveProperty('facts.blockingFiles');
    expect(LANDING_OUTCOME_OF_REFUSAL['target-file-held']).toBe('hold-target');
    expect(existsSync(join(repositoryDirectory, 'feature.ts'))).toBe(false);
    expect(readFileSync(join(repositoryDirectory, 'base.ts'), 'utf8')).toBe('export const base = true;\n');
  });

  test('a file held open on the first try only lands on the retry', async () => {
    const git = heldLanding(1);

    const stage = [...callsBeforeTheHeldRuns(), ...READS_AFTER_A_HELD_RUN, ...fastForwardTo(HELD_COMMIT)];
    expect(await landedIn(stage, mainLanding({ mergedCommit: HELD_COMMIT, checkoutWritePrimitives: git })))
      .toEqual({ verdict: 'landed', commit: HELD_COMMIT, previousTip: MAIN_TIP });
  });

  test('the ticket-level refusals hold the ticket: an Acceptance not accounted for', () => {
    const unnumbered = ticketFixture({ id: '001' });
    const accounted  = { ...ticketFixture({ id: '002' }), body: '## Acceptance\nA1. Example.\n\n## Review\nA1 holds — probe.\n' };

    expect(Landing.ticketRefusalOf([accounted])).toBeNull();
    expect(Landing.ticketRefusalOf([accounted, unnumbered])).toEqual({ verdict: 'refused', reason: 'acceptance-unnumbered', facts: { ticketId: '001' } });
    for (const reason of ['acceptance-unnumbered', 'acceptance-unaccounted', 'acceptance-waived'] as const) {
      expect(LANDING_OUTCOME_OF_REFUSAL[reason]).toBe('hold-ticket');
    }
  });

  test('a ticket with documents takes its Acceptance items from its approved spec and its review\'s lines from its body', () => {
    const spec    = { texts: ['## Acceptance\n\nA1. The basket shows.\nA2. The total shows.\n'], approvals: [{ number: 1, by: 'person' as const }] };
    const records = { ticketDocumentRecordOf: () => loadedRecordFixture('003', { spec }) };
    const reviewedA1 = { ...ticketFixture({ id: '003' }), body: '## Report\nEmpty basket.\n\n## Review\nA1 holds — probe.\n' };
    const reviewedBoth = { ...reviewedA1, body: `${reviewedA1.body}A2 holds — probe.\n` };

    expect(Landing.ticketRefusalOf([reviewedA1], records)).toEqual({ verdict: 'refused', reason: 'acceptance-unaccounted', facts: { ticketId: '003' } });
    expect(Landing.ticketRefusalOf([reviewedBoth], records)).toBeNull();
    expect(Landing.ticketRefusalOf([reviewedBoth])).toEqual({ verdict: 'refused', reason: 'acceptance-unnumbered', facts: { ticketId: '003' } });
  });
});

describeWhenGitIsRecorded('the landing a tracker shares with its siblings', () => {
  const now = (): Date => new Date('2026-10-28T10:00:00+01:00');

  function sharedLandingAt(projectPrefix: string): ReturnType<typeof Landing.sharedRepositoryLandingOf> {
    const projectDirectory = projectPrefix === '' ? repositoryDirectory : join(repositoryDirectory, projectPrefix);
    return Landing.sharedRepositoryLandingOf({ repositoryRoot: repositoryDirectory, projectDirectory, projectPrefix }, 'tracker-example', now, LIVE_HOLDERS_LOCK_TAKER);
  }

  test('is none for a tracker at its repository\'s root, which asks git nothing for it', async () => {
    expect(await playStage([], () => Promise.resolve(sharedLandingAt('')))).toBeNull();
  });

  test('lies in the product\'s folder of the git common directory for a tracker in a project folder', async () => {
    const shared = await playStage([{
      gitArguments: ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      answeredAs:   GIT_CALL_SHAPES.ABSOLUTE_COMMON_FOLDER_AT_THE_ROOT,
      filledIn:     { [RECORDED_PLACEHOLDERS.REPOSITORY]: repositoryDirectory },
    }], () => Promise.resolve(sharedLandingAt('apps/forge')));

    expect(shared?.trackerId).toBe('tracker-example');
    expect(shared?.files).toEqual(RepositoryLandings.landingFilesOf(join(repositoryDirectory, '.git'), PRODUCT_NAMES.PROGRAM));
  });

  test('a landing refused because a sibling holds the lock waits in its slot', () => {
    expect(LANDING_OUTCOME_OF_REFUSAL['landing-lock-held']).toBe('wait-for-the-landing-lock');
  });

  test('an unreadable landing lock record is taken over and logged, with no refusal, and the landing goes on', async () => {
    const files = RepositoryLandings.landingFilesOf(join(repositoryDirectory, '.git'), PRODUCT_NAMES.PROGRAM);
    mkdirSync(files.lockDirectoryPath, { recursive: true });
    const recordPath = LockGenerationSteps.generationPathFor(files.lockDirectoryPath, 1);
    writeFileSync(recordPath, '{"state": "held", "hol');
    const takenOver: StaleLockRecordTakenOver[] = [];
    const sharedRepository = {
      trackerId: 'tracker-example', files, now, lockTaker: lockTakerJudgingHoldersBy(() => false, (staleTakenOver) => takenOver.push(staleTakenOver))
    };
    const alreadyLandedRerun: RecordedGitStage = [
      ...onBranch('main'),
      resolved('refs/heads/main', MERGED_COMMIT),
      { gitArguments: ['merge-base', '--is-ancestor', MERGED_COMMIT, MERGED_COMMIT], answeredAs: GIT_CALL_SHAPES.ANCESTOR_OF_THE_TIP },
    ];

    expect(await landedIn(alreadyLandedRerun, mainLanding({ sharedRepository }))).toMatchObject({ verdict: 'already-landed' });
    expect(takenOver).toEqual([{ recordPath, reason: { kind: 'unreadable', problem: expect.any(Object) as unknown as { code: 'not-a-json-object' } } }]);
  });

  test('an already-landed rerun appends the journal line a stop cut off once, with the slot\'s tip as the previous tip, and a second rerun none', async () => {
    mkdirSync(join(repositoryDirectory, '.git'));
    const files = RepositoryLandings.landingFilesOf(join(repositoryDirectory, '.git'), PRODUCT_NAMES.PROGRAM);
    const sharedRepository = {
      trackerId: 'tracker-example', files, now, lockTaker: LIVE_HOLDERS_LOCK_TAKER
    };
    const alreadyLandedRerun: RecordedGitStage = [
      ...onBranch('main'),
      resolved('refs/heads/main', MERGED_COMMIT),
      { gitArguments: ['merge-base', '--is-ancestor', MERGED_COMMIT, MERGED_COMMIT], answeredAs: GIT_CALL_SHAPES.ANCESTOR_OF_THE_TIP },
    ];
    const journaledLandings = (): unknown => {
      const reading = RepositoryLandings.readLandingJournal(files);
      return reading.verdict === 'readable' ? reading.landings : reading;
    };
    const oneLanding = [{
      trackerId: 'tracker-example', target: 'main', previousTip: MAIN_TIP, commit: MERGED_COMMIT
    }];

    expect(await landedIn(alreadyLandedRerun, mainLanding({ sharedRepository }))).toMatchObject({ verdict: 'already-landed' });
    expect(journaledLandings()).toEqual(oneLanding);

    expect(await landedIn(alreadyLandedRerun, mainLanding({ sharedRepository }))).toMatchObject({ verdict: 'already-landed' });
    expect(journaledLandings()).toEqual(oneLanding);
  });
});
