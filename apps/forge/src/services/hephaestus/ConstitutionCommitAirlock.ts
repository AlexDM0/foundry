/**
 * The constitution commit job in the main line's Airlock: Apply's request waiting for its commit is allocated before any ticket, its
 * constitutions are committed once, and the commit lands by the same compare-and-swap with Apply's stage 2 in the same hold.
 */
import { existsSync } from 'node:fs';

import type { Job, JobEnding }                                         from '../../domain/tracker-model/@types/Job.ts';
import type { EntityKey }                                              from '../../domain/tracker-model/@types/Pipeline.ts';
import type { ApplyMainReading, ApplyRequestReason, MainConstitution } from '../../domain/tracker-model/@types/PipelineSetup.ts';
import type { Board }                                                  from '../../domain/tracker-model/Board.ts';
import { INTERRUPTED_APPLY_REASON, PENDING_APPLY_REQUEST_STATES }      from '../../domain/tracker-model/constants/PipelineSetupVocabulary.ts';
import { GitProcess }                                                  from '../../lib/git/GitProcess.ts';
import { EntityFoldersUtil }                                           from '../../shared/utils/EntityFoldersUtil.ts';
import { entityAssignmentRequestOf }                                   from '../control/EntityAssignmentRequest.ts';
import { LANDING_OUTCOME_OF_REFUSAL, Landing }                         from '../lifecycle/Landing.ts';
import { MergeRun }                                                    from '../lifecycle/MergeRun.ts';
import type { AirlockSlots, ConstitutionCommitAirlock }                from './@types/AirlockParts.ts';
import type { AirlockHold, AirlocksContext }                           from './@types/Airlocks.ts';
import { AirlockReadings }                                             from './AirlockReadings.ts';
import { ConstitutionCommits, type ConstitutionFileCommit }            from './ConstitutionCommits.ts';
import { CONSTITUTION_FILE_PATH, InstructionFiles }                    from './InstructionFiles.ts';
import { REQUEUE_CAUSES }                                              from './constants/AirlockCauses.ts';

/** The landing refusals that hold the main line: the constitution commit waits for them, and is never refused for them. */
const HELD_APPLY_REASONS = ['not-on-target-branch', 'dirty-checkout', 'target-file-held', 'git-failed'] as const satisfies readonly ApplyRequestReason[];

/** A constitution commit job whose Apply request no longer names it: User cancelled the Apply. */
const APPLY_CANCELLED_CAUSE = 'apply-cancelled';

/**
 * What a constitution commit job commits and lands: the open record's Apply request that names it, with each constitution's draft. A
 * forge without entities lists the record's own `CONSTITUTION.md` alone; a draft over entities lists each entity's drafted constitution,
 * in the draft's order, and names every entity's constitution path, whose file main may hold to be adopted as it is.
 */
interface ConstitutionCommitRequest {
  setupId:                  string;
  draftRevision:            number;
  resumesBoard:             boolean;
  constitutions:            readonly ConstitutionFileCommit[];
  /** Absent without entities: each entity's constitution path, by key. */
  entityConstitutionPaths?: Readonly<Record<EntityKey, string>>;
}

/** The open record's Apply request while it waits for its commit; with `commitJobId`, only while it names that job. */
function pendingApplyOf(board: Board, commitJobId?: string): ConstitutionCommitRequest | null {
  const setup   = board.pipelineSetup();
  const request = setup?.applyRequest ?? null;
  const pendingStates: readonly string[] = PENDING_APPLY_REQUEST_STATES;
  if (setup === null || request === null || !pendingStates.includes(request.state)) return null;
  if (commitJobId !== undefined && request.commitJobId !== commitJobId) return null;
  const pending = { setupId: setup.setupId, draftRevision: request.draftRevision, resumesBoard: request.resumesBoard };
  const entities = setup.draft?.entities;
  if (entities === undefined) {
    return {
      ...pending,
      constitutions: [{ path: CONSTITUTION_FILE_PATH, markdown: setup.constitution?.markdown ?? '', baseBlob: setup.constitution?.baseBlob ?? null }],
    };
  }
  const entityConstitutionPaths = Object.fromEntries(Object.entries(entities).map(([entityKey, entity]) => [entityKey, EntityFoldersUtil.constitutionPathOf(entity)]));
  const parts = setup.entities ?? {};
  const constitutions = Object.entries(entityConstitutionPaths).flatMap(([entityKey, path]): ConstitutionFileCommit[] => {
    const draft = Object.hasOwn(parts, entityKey) ? parts[entityKey]?.constitution ?? null : null;
    return draft === null || draft.markdown === '' ? [] : [{ path, markdown: draft.markdown, baseBlob: draft.baseBlob }];
  });
  return { ...pending, constitutions, entityConstitutionPaths };
}

/**
 * What main holds for the request as the Board reads it: the forge's `CONSTITUTION.md`, or on a draft over entities each entity's file,
 * by its path in `readingOfPath`.
 */
function applyMainReadingOf(request: Readonly<ConstitutionCommitRequest>, readingOfPath: (path: string) => MainConstitution | null): ApplyMainReading {
  const paths = request.entityConstitutionPaths;
  if (paths === undefined) return { mainConstitution: readingOfPath(CONSTITUTION_FILE_PATH), entityAssignmentRequestOf };
  const entityConstitutions = Object.fromEntries(Object.entries(paths).map(([entityKey, path]) => [entityKey, readingOfPath(path)]));
  return { mainConstitution: null, entityConstitutions, entityAssignmentRequestOf };
}

/** The paths whose text on main the request reads: the listed constitutions, and on a draft over entities every entity's path. */
function pathsReadOf(request: Readonly<ConstitutionCommitRequest>): string[] {
  const paths = request.entityConstitutionPaths === undefined ? request.constitutions.map((constitution) => constitution.path) : Object.values(request.entityConstitutionPaths);
  return [...new Set(paths)];
}

/** Main holds the draft's text when it holds the constitution with exactly that text; an empty draft only matches no file at all. */
function mainHoldsTheText(mainConstitution: MainConstitution | null, markdown: string): boolean {
  return (mainConstitution?.markdown ?? null) === (markdown === '' ? null : markdown);
}

/**
 * The blob of each listed constitution in the commit, in the request's order; `null` when the commit holds one of them not, or git cannot
 * tell, so the commit is not the one the job made.
 */
function committedBlobsOf(commit: string, request: Readonly<ConstitutionCommitRequest>, projectDirectory: string): string[] | null {
  const blobs: string[] = [];
  for (const constitution of request.constitutions) {
    const reading = ConstitutionCommits.constitutionBlobOf(projectDirectory, commit, constitution.path);
    if (reading.verdict !== 'read' || reading.blob === null) return null;
    blobs.push(reading.blob);
  }
  return blobs;
}

export function createConstitutionCommitAirlock(context: AirlocksContext, slots: AirlockSlots): ConstitutionCommitAirlock {
  const { mainLine } = context;
  const {
    heldTargets, holdTarget, setPhase, sharedLanding
  } = slots;

  /** A worktree git declines to remove stays as a leftover, which Hephaestus's next start names to User. */
  function removeConstitutionCommitWorktree(job: Readonly<Job>): void {
    if (existsSync(ConstitutionCommits.commitWorktreeOf(context.worktreesRoot, job.id))) {
      ConstitutionCommits.removeCommitWorktree(context.repositoryRoot, context.worktreesRoot, job.id);
    }
  }

  /**
   * Ends a constitution commit job with its worktree removed. `requestMove` runs in the same hold, after the end, and only when the request
   * still named the job: a request that User cancelled and asked again is not this job's to hold or refuse.
   */
  async function endConstitutionCommit(
    job: Readonly<Job>,
    ending: JobEnding,
    requestMove: (hold: AirlockHold, setupId: string) => void = () => undefined
  ): Promise<boolean> {
    removeConstitutionCommitWorktree(job);
    await context.hold((hold) => {
      const namingRequest = pendingApplyOf(hold.board, job.id);
      hold.board.endConstitutionCommitJob(job.id, ending, hold.at);
      if (namingRequest !== null) requestMove(hold, namingRequest.setupId);
    });
    return true;
  }

  /**
   * The `committing` phase: a worktree already there is one a run cut short left, so the job is an orphan and the next allocation replaces
   * it; a request that no longer names the job was cancelled. Otherwise the commit is made, and a refused one refuses the request.
   */
  async function runConstitutionCommit(job: Readonly<Job>): Promise<boolean> {
    if (existsSync(ConstitutionCommits.commitWorktreeOf(context.worktreesRoot, job.id))) {
      return endConstitutionCommit(job, { outcome: 'stopped', cause: REQUEUE_CAUSES.orphaned });
    }
    const request = await context.hold((hold) => pendingApplyOf(hold.board, job.id));
    if (request === null) return endConstitutionCommit(job, { outcome: 'stopped', cause: APPLY_CANCELLED_CAUSE });
    const verdict = ConstitutionCommits.commitConstitution({
      repositoryRoot: context.repositoryRoot,
      worktreesRoot:  context.worktreesRoot,
      jobId:          job.id,
      targetTip:      AirlockReadings.slotOf(job).targetTip,
      constitutions:  request.constitutions,
      signsCommits:   context.repositorySignsCommits(),
    });
    if (verdict.verdict === 'refused') {
      return endConstitutionCommit(job, { outcome: 'failed', cause: verdict.reason }, (hold, setupId) => {
        const gitFailure = verdict.problem === null ? null : context.applyRefusalSentenceOf(verdict.problem);
        hold.board.refuseApply(setupId, { reason: verdict.reason, gitFailure }, hold.at);
      });
    }
    const stillNamed = await context.hold((hold) => {
      if (pendingApplyOf(hold.board, job.id) === null) return false;
      setPhase(hold, job, 'landing');
      return true;
    });
    return stillNamed || endConstitutionCommit(job, { outcome: 'stopped', cause: APPLY_CANCELLED_CAUSE });
  }

  /**
   * The `landing` phase, with no gate: the commit lands by the same compare-and-swap fast-forward a ticket's landing uses, and the hold that
   * records the landing runs Apply's stage 2. A moved main line ends the job for a fresh one on the new tip; a main checkout that stops the
   * fast-forward holds the target and the request, which is never refused for it.
   */
  async function runConstitutionLanding(job: Readonly<Job>): Promise<boolean> {
    const slot     = AirlockReadings.slotOf(job);
    const worktree = ConstitutionCommits.commitWorktreeOf(context.worktreesRoot, job.id);
    const commit   = existsSync(worktree) ? MergeRun.headOf(worktree) : null;
    if (commit === null || commit === slot.targetTip) {
      return endConstitutionCommit(job, { outcome: 'stopped', cause: REQUEUE_CAUSES.orphaned });
    }
    const landed = await context.hold((hold) => {
      const request = pendingApplyOf(hold.board, job.id);
      if (request === null) return { verdict: 'cancelled' } as const;
      const committedBlobs = committedBlobsOf(commit, request, context.repositoryRoot);
      if (committedBlobs === null) return { verdict: 'orphaned' } as const;
      const mainReading = committedReadingOf(commit, request, committedBlobs);
      if (mainReading === null) return { verdict: 'orphaned' } as const;
      const stageTwoRefusal = stageTwoRefusalOf(hold, request.setupId, mainReading);
      if (stageTwoRefusal !== null) {
        hold.board.endConstitutionCommitJob(job.id, { outcome: 'failed', cause: stageTwoRefusal }, hold.at);
        hold.board.refuseApply(request.setupId, { reason: stageTwoRefusal, gitFailure: null }, hold.at);
        return { verdict: 'stage-two-refused' } as const;
      }
      const verdict = Landing.landOnTarget({
        target:            { branch: mainLine, directory: context.repositoryRoot },
        mergedCommit:      commit,
        expectedTargetTip: slot.targetTip,
        recordedLandings:  hold.board.recordedLandingsOn(mainLine),
        hookPolicy:        'hooks-off',
        ...sharedLanding,
      });
      if (verdict.verdict === 'refused') return { verdict: 'refused', refusal: verdict } as const;
      hold.board.recordMergeLanded(job.id, { target: mainLine, commit: verdict.commit, kind: 'landed' }, hold.at);
      hold.board.endConstitutionCommitJob(job.id, { outcome: 'committed', commit: verdict.commit }, hold.at);
      hold.board.finishApply(request.setupId, {
        ...mainReading, draftRevision: request.draftRevision, resumesBoard: request.resumesBoard, constitutionCommit: verdict.commit
      }, hold.at);
      return { verdict: 'landed' } as const;
    });
    if (landed.verdict === 'cancelled') return endConstitutionCommit(job, { outcome: 'stopped', cause: APPLY_CANCELLED_CAUSE });
    if (landed.verdict === 'orphaned') return endConstitutionCommit(job, { outcome: 'stopped', cause: REQUEUE_CAUSES.orphaned });
    if (landed.verdict !== 'refused') {
      removeConstitutionCommitWorktree(job);
      return true;
    }
    const { refusal } = landed;
    // The commit and its worktree stay for a later sweep, which finds the lock its sibling held free again.
    if (LANDING_OUTCOME_OF_REFUSAL[refusal.reason] === 'wait-for-the-landing-lock') return false;
    const heldReason = HELD_APPLY_REASONS.find((reason) => reason === refusal.reason);
    // A main line moved by anyone: only the listed constitutions change, so a fresh job commits again on the new tip.
    if (heldReason === undefined) return endConstitutionCommit(job, { outcome: 'stopped', cause: refusal.reason });
    const blockingFiles = refusal.facts.blockingFiles ?? [];
    const heldFiles     = refusal.facts.heldFiles ?? [];
    holdTarget({
      target: mainLine, branch: AirlockReadings.currentBranchIn(context.repositoryRoot), blockingFiles, heldFiles
    }, commit);
    return endConstitutionCommit(job, { outcome: 'stopped', cause: REQUEUE_CAUSES.targetHeld }, (hold, setupId) => {
      hold.board.holdApply(setupId, { reason: heldReason, blockingFiles: [...blockingFiles, ...heldFiles] }, hold.at);
    });
  }

  /**
   * What the constitution commit holds once it lands: each listed constitution with its recorded text and the blob the commit holds, and
   * on a draft over entities every other entity's file as the commit holds it; `null` when git cannot tell.
   */
  function committedReadingOf(commit: string, request: Readonly<ConstitutionCommitRequest>, committedBlobs: readonly string[]): ApplyMainReading | null {
    const committedOf = ({ path, markdown }: Readonly<ConstitutionFileCommit>, index: number): MainConstitution => ({ path, markdown, blob: committedBlobs[index] ?? '' });
    const committed = new Map(request.constitutions.map((constitution, index) => [constitution.path, committedOf(constitution, index)]));
    const readings = new Map<string, MainConstitution | null>();
    for (const path of pathsReadOf(request)) {
      const listed = committed.get(path);
      if (listed !== undefined) {
        readings.set(path, listed);
        continue;
      }
      const reading = InstructionFiles.mainConstitutionAt(context.repositoryRoot, commit, path);
      if (reading.verdict === 'unreadable') return null;
      readings.set(path, reading.verdict === 'read' ? reading.constitution : null);
    }
    return applyMainReadingOf(request, (path) => readings.get(path) ?? null);
  }

  /**
   * What stage 2 would refuse, checked before the commit lands so that a refused Apply leaves main as it was: the stored pipeline moved,
   * or a ticket started or took an entity the draft removes while the request waited.
   */
  function stageTwoRefusalOf(hold: AirlockHold, setupId: string, mainReading: ApplyMainReading): ApplyRequestReason | null {
    if (hold.board.storedPipelineMovedSince(setupId, mainReading)) return 'pipeline-moved';
    return hold.board.entityChangeRefusalOf(setupId);
  }

  /** Stage 2 at once, with no commit, when main already holds every draft's text: the commit landed, or User committed it by hand. */
  function finishWithoutACommit(hold: AirlockHold, request: ConstitutionCommitRequest, mainReading: ApplyMainReading): void {
    const stageTwoRefusal = stageTwoRefusalOf(hold, request.setupId, mainReading);
    if (stageTwoRefusal !== null) {
      hold.board.refuseApply(request.setupId, { reason: stageTwoRefusal, gitFailure: null }, hold.at);
      return;
    }
    hold.board.finishApply(request.setupId, {
      ...mainReading, draftRevision: request.draftRevision, resumesBoard: request.resumesBoard, constitutionCommit: null
    }, hold.at);
  }

  /**
   * An Apply waiting for its commit goes before any ticket candidate of the main line, also while the board is paused, since a first Apply
   * resumes the board only in stage 2. `none`: no request waits, so the tickets go; `waits`: the request waits, and so does every ticket,
   * also while a start holds it `interrupted` until User's `resume --all`.
   */
  async function allocateConstitutionCommit(): Promise<'none' | 'waits' | 'allocated'> {
    const waiting = await context.hold((hold) => {
      const request = pendingApplyOf(hold.board);
      if (request === null) return null;
      const waitsForResume = hold.board.pipelineSetup()?.applyRequest?.reason === INTERRUPTED_APPLY_REASON;
      return { request, mustWait: waitsForResume || hold.board.airlockHolderOf(mainLine) !== undefined };
    });
    if (waiting === null) return 'none';
    if (waiting.mustWait) return 'waits';
    const { request } = waiting;
    const readings = new Map<string, MainConstitution | null>();
    for (const path of pathsReadOf(request)) {
      const reading = context.mainConstitutionOf(path);
      if (reading.verdict === 'unreadable') return 'waits';
      readings.set(path, reading.verdict === 'read' ? reading.constitution : null);
    }
    const mainHoldsEveryText = request.constitutions.every((constitution) => mainHoldsTheText(readings.get(constitution.path) ?? null, constitution.markdown));
    if (mainHoldsEveryText) {
      const mainReading = applyMainReadingOf(request, (path) => readings.get(path) ?? null);
      await context.hold((hold) => {
        if (pendingApplyOf(hold.board)?.setupId === request.setupId) finishWithoutACommit(hold, request, mainReading);
      });
      return 'allocated';
    }
    if (heldTargets.has(mainLine)) return 'waits';
    const targetTip = GitProcess.resolvedCommitOf(context.repositoryRoot, `refs/heads/${mainLine}`);
    if (targetTip === null) return 'waits';
    const claimedNow = await context.hold((hold) => {
      if (GitProcess.resolvedCommitOf(context.repositoryRoot, `refs/heads/${mainLine}`) !== targetTip) return true;
      return AirlockReadings.claimed(() => hold.board.claimConstitutionCommitSlot({ setupId: request.setupId, target: mainLine, targetTip }, hold.at));
    });
    return claimedNow ? 'allocated' : 'waits';
  }

  return {
    runConstitutionCommit, runConstitutionLanding, endConstitutionCommit, allocateConstitutionCommit
  };
}
