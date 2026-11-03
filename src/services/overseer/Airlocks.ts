/**
 * The Airlocks, one per target, run by the Overseer after each pass (design section 6): allocation, the one merge-in against the recorded
 * tip, the ticket's most recent agent resumed for a conflict or a red merged tree, the gate on the merged tree and the compare-and-swap
 * landing. The main line lands in the
 * main checkout; a group's tickets and its refreshes land in the group's own worktree, and its release ticket lands the bundle on the main
 * line. Every phase is written on the merge job's slot in its own hold, and every outcome ends the job or opens what User or the Assistant
 * answers, so nothing loops.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';

import { readCurrentBranch }           from '../../lib/git/BranchIntegration.ts';
import { GitProcess }                  from '../../lib/git/GitProcess.ts';
import { GitWorktrees }                from '../../lib/git/GitWorktrees.ts';
import { predictMerge, predictMerges } from '../../lib/git/MergeTree.ts';
import type { DecisionKind }           from '../../lib/tracker-model/@types/Decision.ts';
import type {
  GateOutcome,
  Job,
  JobEnding,
  Airlock,
  AirlockPhase
}                                          from '../../lib/tracker-model/@types/Job.ts';
import type { DecisionDraft, DecisionWording }              from '../../lib/tracker-model/@types/PlaybookStep.ts';
import type { BranchTreeOf, MergeCandidate, MergeTargetOf } from '../../lib/tracker-model/AirlockClaims.ts';
import { MERGE_PRIORITY_RANK }                              from '../../lib/tracker-model/AirlockClaims.ts';
import type { Board }                                       from '../../lib/tracker-model/Board.ts';
import { BoardRefusal }                                     from '../../lib/tracker-model/BoardRefusal.ts';
import { PARKED_HOLD_PREFIX }                               from '../../lib/tracker-model/constants/DecisionAndIncidentVocabulary.ts';
import { HANDOFF_RED_INTERRUPTION }                         from '../../lib/tracker-model/constants/JobStates.ts';
import { MergeQueueUtil, type MergeForecast }               from '../../lib/tracker-model/utils/MergeQueueUtil.ts';
import type { AirlockLimits }                               from '../../shared/constants/AirlockLimits.ts';
import { RED_HANDOFF_RESUME_CALL_BUDGET }                   from '../../shared/constants/OverseerLimits.ts';
import { LANDING_OUTCOME_OF_REFUSAL, Landing }              from '../lifecycle/Landing.ts';
import { MergeRun }                                         from '../lifecycle/MergeRun.ts';
import { GroupWorktrees }                                   from './GroupWorktrees.ts';
import { RED_HANDOFF_FILES, RedHandoff }                    from './RedHandoff.ts';

export interface AirlockHold {
  board: Board;
  at:    string;
}

/** One fenced `writeTracker` hold: the caller checks its Baton after it. */
export type AirlockHoldRunner = <Result>(mutate: (hold: AirlockHold) => Result) => Promise<Result>;

/** What the merge agent's session reported and how many top-level calls it made, read from its event log. */
export interface MergeAgentReading {
  calls:  number;
  report: unknown;
}

export interface AirlocksContext {
  /** The main checkout, where the main line is fast-forwarded. */
  repositoryRoot:        string;
  mainLine:              string;
  groupTargetPrefix:     string;
  /** Where the group worktrees and the refresh worktrees live, beside the ticket worktrees. */
  worktreesRoot:         string;
  worktreeOf:            (ticketId: string) => string;
  limits:                AirlockLimits;
  /** With the per-job ref denies holding, a target moved by someone else requeues silently; an unconfined job may have moved it itself. */
  refDeniesHold:         boolean;
  hold:                  AirlockHoldRunner;
  gateMergedTree:        (worktreePath: string, treeId: string) => Promise<MergedTreeGate>;
  mergeAgentReadingOf:   (job: Readonly<Job>) => MergeAgentReading;
  /** The job's own Watcher, an agent's or a process Watcher's, is alive. */
  watcherIsLive:         (job: Readonly<Job>) => boolean;
  stopMergeAgent:        (job: Readonly<Job>) => Promise<void>;
  decisionWordingOf:     (draft: DecisionDraft) => DecisionWording;
  /** Keeps an Airlock incident's facts beside the merge job, for the agent its move or default launches once the incident is closed. */
  keepAirlockFacts:      (mergeJob: Readonly<Job>, facts: Readonly<Record<string, string>>) => void;
  /** The job's own folder, where a merge-gate fixer's red handoff is written for its resumed session. */
  jobFolderOf:           (job: Readonly<Job>) => string;
  /** An ended job's folder, where a stale green turned red is written for the next session of its kind. */
  jobFolderOfId:         (jobId: string) => string;
  /** How often a fixer whose fix left the merged tree red is resumed before the merge parks. */
  redHandoffResumes:     number;
  /** `oversee pause` opens no new slot; a slot already open finishes. */
  dispatchIsStopped:     () => boolean;
  /** A removal git declined after a refresh or a release: the Overseer logs it and shows it as a notice while the leftover stands. */
  reportDeclinedCleanup: (declined: DeclinedCleanup) => void;
}

/** The merged tree's gate: its outcome and what the checks line printed, whose tail a merge-gate fixer is given. */
export interface MergedTreeGate {
  /** `setup-failed` when a prepare step did not exit 0, `sandbox-unavailable` when a line was refused: no gate judged the tree. */
  outcome: GateOutcome | 'setup-failed' | 'sandbox-unavailable';
  /** The red gate or the failed or refused step; `null` on a pass. */
  step:    string | null;
  output:  string;
}

/** A red gate goes back to the ticket's agent; a gate that could not run and a failed prepare step are the incidents a build job opens too. */
const MERGE_GATE_INCIDENT_KINDS = { 'cannot-run': 'gate-cannot-run', 'setup-failed': 'setup-failed', 'sandbox-unavailable': 'sandbox-unavailable' } as const;

function treeOfCommit(worktree: string, commit: string): string | null {
  const run = GitProcess.run(worktree, ['rev-parse', '--verify', '--quiet', `${commit}^{tree}`], 'hooks-off', undefined, GitWorktrees.ceilingOf(worktree));
  return GitProcess.succeeded(run) ? run.standardOutput.trim() : null;
}

/**
 * The merged tree is the branch's own tree, the newest gate run on it passed, and the ticket's row holds it as its green under the current
 * pipeline hash: the merge changed nothing the gates judged, and the gates are the ones that passed it. A refresh has no row, so its merged
 * tree is always gated.
 */
function mergedTreeWasLastPassed(board: Board, worktree: string, job: Readonly<Job>, treeId: string): boolean {
  const branchTip  = job.airlock?.branchTip;
  const [ticketId] = job.ticketIds;
  if (branchTip === undefined || ticketId === undefined || treeOfCommit(worktree, branchTip) !== treeId) return false;
  const newestRunOnTheTree = board.logRecordsSoFar().findLast((record) => record.kind === 'gate-ran' && record.fields.tree === treeId);
  return newestRunOnTheTree?.kind === 'gate-ran' && newestRunOnTheTree.fields.outcome === 'passed' && board.greenIsCurrent(ticketId, treeId);
}

/** The ticket's most recent agent, whom a conflict or a red merged tree goes back to. */
type AirlockAgentRole = 'builder' | 'reviewer';

/** The parked hold a merged tree leaves when it is still red after the agent's resumes. */
const MERGE_GATE_RED_PARK_CAUSE = 'merge-gate-red';

/** The Airlock agents launched under one merge job, in launch order, and the newest one's ending. */
interface AirlockAgentHistory {
  /** The conflict or red handoff launches and the red resumes; a fresh agent in place of one that could not resume adds none. */
  resumes:       number;
  freshAgentIds: ReadonlySet<string>;
  newestEnding:  { jobId: string; outcome: string; attempt: number } | null;
}

export interface DeclinedCleanup {
  cleanup:     'refresh' | 'release';
  groupBranch: string;
  /** Git's own reason, as `GroupWorktrees` hands it back. */
  reason:      string;
}

/**
 * The `dirty-main-checkout` notice: the target checkout's branch, or the files blocking the fast-forward. With `heldFiles`, the
 * `target-file-held` notice instead: files another process holds open, which are never the owner's changes.
 */
export interface HeldTarget {
  target:        string;
  branch:        string | null;
  blockingFiles: readonly string[];
  heldFiles:     readonly string[];
}

export interface Airlocks {
  /** Advances every slot as far as it goes without waiting, then allocates; resolves with the targets whose landings wait. */
  sweep: () => Promise<readonly HeldTarget[]>;
}

/** A sweep stops after this many rounds of advancing and allocating, so a slot that keeps moving waits for the next pass. */
const ROUNDS_PER_SWEEP = 8;

const MERGE_REFUSED_CAUSES = {
  outOfCalls:         'out-of-calls',
  cannotResolve:      'cannot-resolve',
  unresolved:         'merge-unresolved',
  noReport:           'no-report',
  gitFailed:          'git-failed',
  refreshConflicted:  'refresh-conflicted',
  releaseBehindGroup: 'release-behind-group',
} as const;

/** The causes a merge job ends with when it frees its slot and its ticket waits in the queue again. */
const REQUEUE_CAUSES = { orphaned: 'orphaned', targetMoved: 'target-moved', targetHeld: 'target-held' } as const;

const MERGE_ABORTED_CAUSE = 'merge-aborted';

const RED_RESUMES_SPENT_CAUSE = 'red-resumes-spent';

const STALE_GREEN_LOG_FILE = 'gate.log';

const LANDING_REFUSED_DECISION: DecisionKind = 'landing-refused';

/** A refused refresh names no ticket: its `merge-refused` context starts with the group's target, which keeps the next refresh waiting. */
const REFRESH_REFUSAL_SEPARATOR = ': ';

function reportFieldOf(report: unknown, field: string): unknown {
  return typeof report === 'object' && report !== null && Object.hasOwn(report, field) ? (report as Record<string, unknown>)[field] : undefined;
}

function slotOf(job: Readonly<Job>): Readonly<Airlock> {
  if (job.airlock === undefined) throw new Error(`Merge job ${job.id} holds no slot.`);
  return job.airlock;
}

function ticketIdOf(job: Readonly<Job>): string {
  return job.ticketIds[0] ?? '';
}

function isRefresh(job: Readonly<Job>): boolean {
  return job.kind === 'refresh';
}

function mergeAgentOf(board: Board, job: Readonly<Job>): Readonly<Job> | undefined {
  return board.jobs().find((candidate) => candidate.kind === 'merge-agent' && candidate.parentJobId === job.id);
}

/** The ticket's trailing run of merge jobs ended by an unrecorded target move: what parks it after TARGET_MOVED_MERGES_BEFORE_PARKING. */
function targetMovesInARowOf(board: Board, ticketId: string): number {
  const mergeJobIds = new Set<string>();
  let movesInARow = 0;
  for (const record of board.logRecordsSoFar()) {
    if (record.kind === 'job-launched' && record.fields.kind === 'merge' && record.fields.ticketIds.includes(ticketId)) mergeJobIds.add(record.jobId);
    if (record.kind !== 'job-ended' || !mergeJobIds.has(record.jobId)) continue;
    movesInARow = record.fields.cause === REQUEUE_CAUSES.targetMoved ? movesInARow + 1 : 0;
  }
  return movesInARow;
}

function uncommittedPathsOf(directory: string): string[] | null {
  const status = GitProcess.run(directory, ['status', '--porcelain=v1', '--untracked-files=no'], 'hooks-off', undefined, GitWorktrees.ceilingOf(directory));
  if (!GitProcess.succeeded(status)) return null;
  return status.standardOutput.split('\n').filter((line) => line !== '').map((line) => line.slice('XY '.length));
}

/** The ticket's reviewer, or its builder with no review phase. */
function airlockAgentRoleOf(board: Board): AirlockAgentRole {
  return board.pipeline()?.review === undefined ? 'builder' : 'reviewer';
}

function airlockAgentHistoryOf(board: Board, job: Readonly<Job>): AirlockAgentHistory {
  const attemptByJobId = new Map<string, number>();
  const freshAgentIds  = new Set<string>();
  let resumes = 0;
  let newestEnding: AirlockAgentHistory['newestEnding'] = null;
  for (const record of board.logRecordsSoFar()) {
    if (record.kind === 'job-launched' && record.fields.parentJobId === job.id) {
      attemptByJobId.set(record.jobId, record.fields.attempt);
      if (newestEnding?.outcome === 'replaced') freshAgentIds.add(record.jobId);
      else resumes += 1;
    }
    if (record.kind === 'job-resumed' && attemptByJobId.has(record.jobId) && record.fields.cause === HANDOFF_RED_INTERRUPTION) resumes += 1;
    if (record.kind === 'job-ended' && attemptByJobId.has(record.jobId)) {
      newestEnding = { jobId: record.jobId, outcome: record.fields.outcome, attempt: attemptByJobId.get(record.jobId) ?? 1 };
    }
  }
  return { resumes, freshAgentIds, newestEnding };
}

/** How often the agent's session was resumed after a red handoff. */
function redResumesOf(board: Board, agent: Readonly<Job>): number {
  return board.logRecordsSoFar().filter((record) => record.kind === 'job-resumed' && record.jobId === agent.id && record.fields.cause === HANDOFF_RED_INTERRUPTION).length;
}

function tailOf(output: string, lineCount: number): string {
  return output.trimEnd().split('\n').slice(-lineCount).join('\n');
}

function forecastOf(prediction: ReturnType<typeof predictMerge>): MergeForecast {
  return prediction.verdict;
}

export function createAirlocks(context: AirlocksContext): Airlocks {
  const { mainLine, groupTargetPrefix } = context;
  const targetOf: MergeTargetOf = (ticket) => (
    ticket.group === undefined || ticket.releasesGroup === true ? mainLine : `${groupTargetPrefix}${ticket.group}`
  );
  const groupOf = (target: string): string => target.slice(groupTargetPrefix.length);
  const branchTreeOf: BranchTreeOf = (ticketId) => treeOfCommit(context.repositoryRoot, `refs/heads/ticket-${ticketId}`);
  const heldTargets = new Map<string, HeldTarget>();

  /** The newest ended job of the agent the ticket's green came from: its reviewer, or its builder with no review phase. */
  function newestAgentJobIdOf(board: Board, ticketId: string): string | null {
    const kind = board.pipeline()?.review === undefined ? 'build' : 'review';
    const agentJobIds = new Set<string>();
    let newest: string | null = null;
    for (const record of board.logRecordsSoFar()) {
      if (record.kind === 'job-launched' && record.fields.kind === kind && record.fields.ticketIds.includes(ticketId)) agentJobIds.add(record.jobId);
      if (record.kind === 'job-ended' && agentJobIds.has(record.jobId)) newest = record.jobId;
    }
    return newest;
  }

  /** The red handoff the next session of that agent's kind takes over, kept in the ended job's folder. */
  function writeStaleGreenHandoff(board: Board, ticketId: string, red: { treeId: string; step: string; output: string; commit: string }): void {
    const jobId = newestAgentJobIdOf(board, ticketId);
    if (jobId === null) return;
    const folder = join(context.jobFolderOfId(jobId), RED_HANDOFF_FILES.staleGreenFolder);
    const pipelineGate = board.pipeline()?.gates.find((gate) => gate.name === red.step);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, STALE_GREEN_LOG_FILE), `${red.step}\n${red.output}`);
    RedHandoff.writeRedHandoff(folder, {
      kind:                'gate',
      name:                red.step,
      command:             pipelineGate?.run ?? null,
      fixCommand:          pipelineGate?.fix ?? null,
      commit:              red.commit,
      exitCode:            null,
      batonPassPath:       RedHandoff.batonPassPathOf(folder),
      fullLogPath:         join(folder, STALE_GREEN_LOG_FILE),
      resume:              0,
      resumesAllowed:      context.redHandoffResumes,
      callBudget:          RED_HANDOFF_RESUME_CALL_BUDGET,
      interruptedInstance: 0,
    }, red.output);
  }

  /** In the hold after a gate run outside the Airlock: green queues the ticket again, red returns it to its agent, else an incident holds it. */
  function settleRegate(hold: AirlockHold, ticketId: string, target: string, treeId: string, gate: MergedTreeGate): void {
    const ticket = hold.board.tickets().find((candidate) => candidate.frontmatter.id === ticketId);
    const stillWaits = ticket?.frontmatter.status === 'in-review' && ticket.frontmatter.hold === undefined
      && !hold.board.jobs().some((job) => job.ticketIds.includes(ticketId)) && branchTreeOf(ticketId) === treeId;
    if (!stillWaits) return;
    if (gate.outcome !== 'setup-failed' && gate.outcome !== 'sandbox-unavailable') hold.board.recordGateRan({ tree: treeId, outcome: gate.outcome, cached: false }, hold.at);
    hold.board.recordPipelineJudgedBy(ticketId, gate.outcome === 'passed' ? treeId : null, hold.at);
    if (gate.outcome === 'passed') {
      hold.board.queueTicketForMerge(ticketId, target, treeId, hold.at);
      return;
    }
    if (gate.outcome === 'failed') {
      writeStaleGreenHandoff(hold.board, ticketId, {
        treeId, step: gate.step ?? '', output: gate.output, commit: GitProcess.resolvedCommitOf(context.repositoryRoot, `refs/heads/ticket-${ticketId}`) ?? ''
      });
      // With a review phase the ticket waits in review, unqueued, for its next reviewer; without one its builder takes the red handoff.
      if (hold.board.pipeline()?.review === undefined) hold.board.moveTicket(ticketId, 'in-progress', { checksLegality: true }, hold.at);
      return;
    }
    hold.board.openIncident({
      kind:        MERGE_GATE_INCIDENT_KINDS[gate.outcome],
      ticketIds:   [ticketId],
      jobId:       null,
      facts:       { tree: treeId, gate: gate.step ?? '' },
      defaultMove: gate.outcome === 'setup-failed' ? 'worktree-repair' : 'gate-retry',
    }, hold.at);
  }

  /**
   * Outside any slot: a queued ticket whose green went stale loses its mark and its worktree is gated again; a ticket whose green is current
   * but which is not queued (no review phase) is queued.
   */
  async function settleTicketsAwaitingGreen(target: string): Promise<boolean> {
    if (context.dispatchIsStopped()) return false;
    const awaiting = await context.hold((hold) => hold.board.ticketsAwaitingGreenOf(target, targetOf, branchTreeOf));
    let moved = false;
    for (const { ticketId } of awaiting) {
      const settled = await context.hold((hold) => {
        const branchTree = branchTreeOf(ticketId);
        if (!hold.board.greenIsCurrent(ticketId, branchTree)) {
          const wasQueued = hold.board.ticketIsMergeQueued(ticketId);
          if (wasQueued) hold.board.setTicketMergeQueued(ticketId, false, hold.at);
          return { greenIsCurrent: false, changed: wasQueued };
        }
        if (hold.board.ticketIsMergeQueued(ticketId)) return { greenIsCurrent: true, changed: false };
        hold.board.queueTicketForMerge(ticketId, target, branchTree, hold.at);
        return { greenIsCurrent: true, changed: true };
      });
      moved = moved || settled.changed;
      if (settled.greenIsCurrent) continue;
      // The mark is gone whatever the worktree holds; only a worktree whose HEAD is the branch's tree is gated.
      const worktree = context.worktreeOf(ticketId);
      const treeId   = MergeRun.treeOf(worktree);
      if (treeId === null || treeId !== branchTreeOf(ticketId)) continue;
      moved = true;
      const gate = await context.gateMergedTree(worktree, treeId);
      await context.hold((hold) => settleRegate(hold, ticketId, target, treeId, gate));
    }
    return moved;
  }

  /** Main lands in the main checkout; a group branch in its own worktree, created from the main line's tip when the group has none yet. */
  function targetDirectoryOf(target: string): string | null {
    if (target === mainLine) return context.repositoryRoot;
    const prepared = GroupWorktrees.prepareGroupWorktree(context.repositoryRoot, context.worktreesRoot, target, mainLine);
    return prepared.verdict === 'ready' ? prepared.path : null;
  }

  function slotWorktreeOf(job: Readonly<Job>): string {
    return isRefresh(job) ? GroupWorktrees.refreshWorktreeOf(context.worktreesRoot, job.target ?? '') : context.worktreeOf(ticketIdOf(job));
  }

  function openDecision(hold: AirlockHold, kind: DecisionKind, ticketIds: readonly string[], decisionContext: string): void {
    const draft: DecisionDraft = { kind, ticketIds, jobId: null };
    hold.board.openDecision({
      ...draft, askedBy: 'overseer', requestId: null, questions: context.decisionWordingOf(draft).questions, context: decisionContext
    }, hold.at);
  }

  function setPhase(hold: AirlockHold, job: Readonly<Job>, phase: AirlockPhase): void {
    hold.board.setJobSlot(job.id, { ...slotOf(job), phase });
  }

  function removeRefreshWorktree(job: Readonly<Job>): void {
    const reason = GroupWorktrees.removeWorktree(context.repositoryRoot, slotWorktreeOf(job));
    if (reason !== null) context.reportDeclinedCleanup({ cleanup: 'refresh', groupBranch: job.target ?? '', reason });
  }

  /** Frees the slot with the worktree back at its recorded start, a refresh's removed; the ticket stays queued unless the caller took it out. */
  async function freeSlot(job: Readonly<Job>, ending: JobEnding, inHold: (hold: AirlockHold) => void = () => undefined): Promise<void> {
    const worktree = slotWorktreeOf(job);
    MergeRun.restoreBranchTip(worktree, MergeRun.sidesOf(job, slotOf(job)).startTip);
    if (isRefresh(job)) removeRefreshWorktree(job);
    await context.hold((hold) => {
      const agent = mergeAgentOf(hold.board, job);
      if (agent !== undefined) hold.board.endJob(agent.id, { outcome: 'stopped', cause: ending.cause ?? 'merge-ended' }, hold.at);
      hold.board.endJob(job.id, ending, hold.at);
      inHold(hold);
    });
  }

  /** The merge aborts, the slot frees and User is asked; a `reportKind` also opens the Assistant's incident, with no job waiting. */
  async function refuseMerge(job: Readonly<Job>, cause: string, notes: string, reportKind: unknown = null): Promise<void> {
    const ticketIds = isRefresh(job) ? [] : [ticketIdOf(job)];
    await freeSlot(job, { outcome: 'failed', cause }, (hold) => {
      ticketIds.forEach((ticketId) => hold.board.setTicketMergeQueued(ticketId, false, hold.at));
      openDecision(hold, 'merge-refused', ticketIds, isRefresh(job) ? `${job.target ?? ''}${REFRESH_REFUSAL_SEPARATOR}${notes}` : notes);
      if (reportKind !== 'malformed-ticket' && reportKind !== 'system-blocker') return;
      hold.board.openIncident({
        kind:        reportKind === 'malformed-ticket' ? 'malformed-ticket' : 'system-question',
        ticketIds,
        jobId:       null,
        facts:       { notes, mergeJobId: job.id },
        defaultMove: 'incident-escalate',
      }, hold.at);
    });
  }

  /** A release carries the group's whole tip to the main line; one forked before a later landing or refresh would deliver work main lacks. */
  async function releaseGapOf(job: Readonly<Job>): Promise<string | null> {
    if (isRefresh(job) || slotOf(job).target !== mainLine) return null;
    const ticketId = ticketIdOf(job);
    const group = await context.hold((hold) => {
      const ticket = hold.board.tickets().find((candidate) => candidate.frontmatter.id === ticketId);
      return ticket?.frontmatter.releasesGroup === true ? ticket.frontmatter.group : undefined;
    });
    if (group === undefined) return null;
    const groupBranch = `${groupTargetPrefix}${group}`;
    const groupTip    = GitProcess.resolvedCommitOf(context.repositoryRoot, `refs/heads/${groupBranch}`);
    if (groupTip === null) return null;
    const descends = GitProcess.run(context.repositoryRoot, ['merge-base', '--is-ancestor', groupTip, slotOf(job).branchTip]);
    return GitProcess.succeeded(descends) ? null : `The release branch of #${ticketId} does not hold ${groupBranch}'s tip ${groupTip}.`;
  }

  async function runMergeIn(job: Readonly<Job>): Promise<boolean> {
    const worktree = slotWorktreeOf(job);
    const slot     = slotOf(job);
    if (isRefresh(job)) {
      const prepared = GroupWorktrees.prepareRefreshWorktree(context.repositoryRoot, context.worktreesRoot, slot.target, slot.targetTip);
      if (prepared.verdict === 'git-failed') {
        await refuseMerge(job, MERGE_REFUSED_CAUSES.gitFailed, prepared.reason);
        return true;
      }
    }
    if (MergeRun.mergeIsInProgress(worktree)) {
      // A live holder keeps its slot; only a merge-in left behind by nobody is aborted and requeued.
      if (context.watcherIsLive(job)) return false;
      await freeSlot(job, { outcome: 'stopped', cause: REQUEUE_CAUSES.orphaned });
      return true;
    }
    const releaseGap = await releaseGapOf(job);
    if (releaseGap !== null) {
      await refuseMerge(job, MERGE_REFUSED_CAUSES.releaseBehindGroup, releaseGap);
      return true;
    }
    const merge = MergeRun.mergeInOnce(worktree, MergeRun.sidesOf(job, slot));
    if (merge.verdict === 'merged' || merge.verdict === 'already-descends') {
      await context.hold((hold) => setPhase(hold, job, 'gating'));
      return true;
    }
    if (merge.verdict === 'conflicted' && isRefresh(job)) {
      // A refresh has no ticket agent to resolve it: User decides.
      await refuseMerge(job, MERGE_REFUSED_CAUSES.refreshConflicted, `The merge of ${mainLine} conflicts in ${merge.conflictedFiles.join(', ')}.`);
      return true;
    }
    if (merge.verdict === 'conflicted') {
      await context.hold((hold) => {
        context.keepAirlockFacts(job, { conflictedFiles: merge.conflictedFiles.join('\n') });
        launchAirlockAgent(hold, job, 1);
        setPhase(hold, job, 'resolving');
      });
      return true;
    }
    await refuseMerge(job, MERGE_REFUSED_CAUSES.gitFailed, merge.verdict === 'git-failed' ? merge.reason : 'unknown commit');
    return true;
  }

  /**
   * The ticket's most recent agent goes into the Airlock worktree, its own session resumed; a fresh agent of the same role in place of one
   * that could not resume carries the same attempt.
   */
  function launchAirlockAgent(hold: AirlockHold, job: Readonly<Job>, attempt: number): void {
    hold.board.launchJob({
      kind: 'merge-agent', role: airlockAgentRoleOf(hold.board), ticketIds: job.ticketIds, parentJobId: job.id, attempt, target: slotOf(job).target,
    }, hold.at);
  }

  async function runGate(job: Readonly<Job>, hasOpenIncident: boolean): Promise<boolean> {
    if (hasOpenIncident) return false;
    const worktree = slotWorktreeOf(job);
    const treeId   = MergeRun.treeOf(worktree);
    if (treeId === null) {
      await refuseMerge(job, MERGE_REFUSED_CAUSES.gitFailed, 'The merged tree cannot be read.');
      return true;
    }
    const landsUngated = await context.hold((hold) => {
      if (!mergedTreeWasLastPassed(hold.board, worktree, job, treeId)) return false;
      setPhase(hold, job, 'landing');
      return true;
    });
    if (landsUngated) return true;
    const { outcome, step, output } = await context.gateMergedTree(worktree, treeId);
    const resumesSpent = await context.hold((hold) => {
      if (outcome !== 'setup-failed' && outcome !== 'sandbox-unavailable') hold.board.recordGateRan({ tree: treeId, outcome, cached: false }, hold.at);
      const agent = mergeAgentOf(hold.board, job);
      if (outcome === 'passed') {
        if (agent !== undefined) hold.board.endJob(agent.id, { outcome: 'resolved', commit: MergeRun.headOf(worktree) ?? treeId }, hold.at);
        setPhase(hold, job, 'landing');
        return false;
      }
      if (outcome === 'failed') return isRefresh(job) || resumeOrSpendTheAgent(hold, job, agent, { step: step ?? '', output, worktree });
      hold.board.openIncident({
        kind:        MERGE_GATE_INCIDENT_KINDS[outcome],
        ticketIds:   job.ticketIds,
        jobId:       job.id,
        facts:       { tree: treeId, gate: step ?? '' },
        defaultMove: 'gate-retry',
      }, hold.at);
      return false;
    });
    if (resumesSpent) await abortAndPark(job, tailOf(output, context.limits.CHECK_OUTPUT_TAIL_LINES));
    return true;
  }

  /**
   * A red merged tree goes back to the ticket's agent with the red handoff message: its session in the Airlock is resumed, or, with none
   * there yet, the agent's own session is resumed into the Airlock. Past the resumes the agent ends `failed` and the merge parks. Returns
   * whether the resumes are spent.
   */
  function resumeOrSpendTheAgent(hold: AirlockHold, job: Readonly<Job>, agent: Readonly<Job> | undefined, red: { step: string; output: string; worktree: string }): boolean {
    const { resumes } = airlockAgentHistoryOf(hold.board, job);
    if (resumes >= context.redHandoffResumes) {
      if (agent !== undefined) hold.board.endJob(agent.id, { outcome: 'failed', cause: RED_RESUMES_SPENT_CAUSE }, hold.at);
      return true;
    }
    // The merge job's folder keeps the newest red handoff for an agent launched into the Airlock, a fresh one included.
    const folders = [context.jobFolderOf(job), ...agent === undefined ? [] : [context.jobFolderOf(agent)]];
    for (const folder of folders) {
      RedHandoff.writeRedHandoff(folder, {
        kind:                'gate',
        name:                red.step,
        command:             hold.board.pipeline()?.gates.find((gate) => gate.name === red.step)?.run ?? null,
        fixCommand:          null,
        commit:              MergeRun.headOf(red.worktree) ?? '',
        exitCode:            null,
        batonPassPath:       RedHandoff.batonPassPathOf(folder),
        fullLogPath:         null,
        resume:              resumes + 1,
        resumesAllowed:      context.redHandoffResumes,
        callBudget:          RED_HANDOFF_RESUME_CALL_BUDGET,
        interruptedInstance: agent?.watcherInstance ?? 0,
      }, red.output);
    }
    if (agent === undefined) launchAirlockAgent(hold, job, 1);
    else hold.board.interruptJob(agent.id, HANDOFF_RED_INTERRUPTION, hold.at);
    setPhase(hold, job, 'fixing');
    return false;
  }

  /** The merge aborts, the slot frees and the ticket is held `parked:merge-gate-red` with a `parked` decision; a refresh asks User. */
  async function abortAndPark(job: Readonly<Job>, notes: string): Promise<boolean> {
    const cause = MERGE_GATE_RED_PARK_CAUSE;
    if (isRefresh(job)) {
      await refuseMerge(job, cause, notes);
      return true;
    }
    const ticketId = ticketIdOf(job);
    await freeSlot(job, { outcome: 'failed', cause }, (hold) => {
      hold.board.setTicketMergeQueued(ticketId, false, hold.at);
      hold.board.holdTicket(ticketId, `${PARKED_HOLD_PREFIX}${cause}`, hold.at);
      openDecision(hold, 'parked', [ticketId], notes);
    });
    return true;
  }

  /**
   * The agent resolving the conflict or fixing the red merged tree, settled by its report. One that could not resume was ended `replaced`,
   * and a fresh agent of its role and attempt takes its place; any other agent that ended leaves the slot orphaned.
   */
  async function runAirlockAgent(job: Readonly<Job>, hasOpenIncident: boolean): Promise<boolean> {
    if (hasOpenIncident) return false;
    const { agent, history } = await context.hold((hold) => ({ agent: mergeAgentOf(hold.board, job), history: airlockAgentHistoryOf(hold.board, job) }));
    if (agent !== undefined) return settleAirlockAgent(job, agent, history);
    const ending = history.newestEnding;
    if (ending?.outcome === 'replaced') {
      await context.hold((hold) => launchAirlockAgent(hold, job, ending.attempt));
      return true;
    }
    await freeSlot(job, { outcome: 'stopped', cause: REQUEUE_CAUSES.orphaned });
    return true;
  }

  /**
   * At its budget or on `cannot-resolve` the merge is refused; on `resolved` the agent waits through the gate of the merged tree, so a red
   * one resumes the same session and a pass ends it `resolved`.
   */
  async function settleAirlockAgent(job: Readonly<Job>, agent: Readonly<Job>, history: AirlockAgentHistory): Promise<boolean> {
    const reading = context.mergeAgentReadingOf(agent);
    const budget  = await context.hold((hold) => airlockAgentBudgetOf(hold.board, agent, history));
    if (agent.state === 'running' && reading.calls >= budget) {
      await context.stopMergeAgent(agent);
      await refuseMerge(job, MERGE_REFUSED_CAUSES.outOfCalls, `The ${agent.role ?? 'agent'} of job ${agent.id} reached its ${budget} calls in the Airlock.`);
      return true;
    }
    if (agent.state !== 'in-customs') return false;
    // Its report is in: nothing else closes an Airlock agent's session, so the Overseer stops it before settling the slot.
    await context.stopMergeAgent(agent);
    const notes   = String(reportFieldOf(reading.report, 'notes') ?? '');
    const outcome = reportFieldOf(reading.report, 'outcome');
    if (outcome !== 'resolved') {
      const cause = outcome === 'cannot-resolve' ? MERGE_REFUSED_CAUSES.cannotResolve : MERGE_REFUSED_CAUSES.noReport;
      await refuseMerge(job, cause, notes, reportFieldOf(reading.report, 'reportKind') ?? null);
      return true;
    }
    const worktree      = slotWorktreeOf(job);
    const resolvedFiles = reportFieldOf(reading.report, 'resolvedFiles');
    const resolvedFileList = Array.isArray(resolvedFiles) ? resolvedFiles.map(String) : [];
    if (slotOf(job).phase === 'resolving' && !MergeRun.resolutionIsSound(worktree, MergeRun.sidesOf(job, slotOf(job)), resolvedFileList)) {
      await refuseMerge(job, MERGE_REFUSED_CAUSES.unresolved, notes);
      return true;
    }
    await context.hold((hold) => {
      hold.board.moveJob(agent.id, 'gating', hold.at);
      setPhase(hold, job, 'gating');
    });
    return true;
  }

  /** A resumed session has the red handoff's short budget; a fresh agent has its role's full budget until its own first resume. */
  function airlockAgentBudgetOf(board: Board, agent: Readonly<Job>, history: AirlockAgentHistory): number {
    const isFreshAndUnresumed = history.freshAgentIds.has(agent.id) && redResumesOf(board, agent) === 0;
    if (!isFreshAndUnresumed) return RED_HANDOFF_RESUME_CALL_BUDGET;
    return agent.role === 'builder' ? context.limits.FRESH_BUILDER_API_CALL_BUDGET : context.limits.FRESH_REVIEWER_API_CALL_BUDGET;
  }

  function currentBranchIn(directory: string): string | null {
    const branch = readCurrentBranch(directory);
    return branch.verdict === 'on-branch' ? branch.branch : null;
  }

  /** Rechecked every sweep: each held target's checkout back on its branch with nothing uncommitted clears its notice. */
  function recheckHeldTargets(): void {
    for (const target of [...heldTargets.keys()]) {
      const directory = target === mainLine ? context.repositoryRoot : GroupWorktrees.groupWorktreeOf(context.worktreesRoot, target);
      if (currentBranchIn(directory) === target && (uncommittedPathsOf(directory) ?? ['?']).length === 0) heldTargets.delete(target);
    }
  }

  /** What the landing does on the board once git moved the target: deliver, approve a group's ticket, or record a refresh. */
  function landOnTheBoard(hold: AirlockHold, job: Readonly<Job>, commit: string): void {
    const slot     = slotOf(job);
    const ticketId = ticketIdOf(job);
    if (isRefresh(job)) {
      hold.board.recordMergeLanded(job.id, { target: slot.target, commit, kind: 'integrated' }, hold.at);
      hold.board.endJob(job.id, { outcome: 'refreshed', commit }, hold.at);
      return;
    }
    if (slot.target !== mainLine) {
      hold.board.moveTicket(ticketId, 'reviewed', { checksLegality: true }, hold.at);
      hold.board.recordMergeLanded(job.id, { target: slot.target, commit, kind: 'integrated' }, hold.at);
      hold.board.endJob(job.id, { outcome: 'integrated', commit }, hold.at);
      return;
    }
    const tickets  = hold.board.tickets();
    const group    = tickets.find((candidate) => candidate.frontmatter.id === ticketId)?.frontmatter.group;
    // The bundle's integrated tickets go with the release; one delivered already stays as it is.
    const released = group === undefined ? [] : hold.board.releaseBundleTicketIdsOf(group).filter((bundleTicketId) => (
      bundleTicketId !== ticketId && tickets.some((candidate) => candidate.frontmatter.id === bundleTicketId && candidate.frontmatter.status === 'reviewed')
    ));
    hold.board.releaseTickets([ticketId, ...released], { branch: `ticket-${ticketId}`, commit }, hold.at);
    hold.board.recordMergeLanded(job.id, { target: mainLine, commit, kind: 'landed' }, hold.at);
    hold.board.endJob(job.id, { outcome: 'landed', commit }, hold.at);
  }

  /** After the landing hold: a refresh's temporary worktree goes, and a release removes the group's worktree and deletes its branch. */
  function cleanUpAfterLanding(job: Readonly<Job>, releasedGroup: string | undefined): void {
    if (isRefresh(job)) removeRefreshWorktree(job);
    if (releasedGroup === undefined) return;
    const groupBranch = `${groupTargetPrefix}${releasedGroup}`;
    const reason      = GroupWorktrees.removeGroup(context.repositoryRoot, context.worktreesRoot, groupBranch);
    if (reason !== null) context.reportDeclinedCleanup({ cleanup: 'release', groupBranch, reason });
  }

  async function runLanding(job: Readonly<Job>): Promise<boolean> {
    const ticketId     = ticketIdOf(job);
    const slot         = slotOf(job);
    const mergedCommit = MergeRun.headOf(slotWorktreeOf(job));
    const directory    = targetDirectoryOf(slot.target);
    if (mergedCommit === null || directory === null) {
      await refuseMerge(job, MERGE_REFUSED_CAUSES.gitFailed, mergedCommit === null ? 'The merged commit cannot be read.' : `The ${slot.target} worktree cannot be prepared.`);
      return true;
    }
    let releasedGroup: string | undefined = undefined;
    const landed = await context.hold((hold) => {
      const ticket = hold.board.tickets().find((candidate) => candidate.frontmatter.id === ticketId);
      // Only a review accounts for the Acceptance: a pipeline without a review phase lands on its gates alone.
      const pipeline = hold.board.pipeline();
      const acceptanceIsReviewed = pipeline === null || pipeline.review !== undefined;
      const ticketRefusal = ticket === undefined || !acceptanceIsReviewed ? null : Landing.ticketRefusalOf([ticket]);
      if (ticketRefusal !== null) return ticketRefusal;
      const verdict = Landing.landOnTarget({
        target:            { branch: slot.target, directory },
        mergedCommit,
        expectedTargetTip: slot.targetTip,
        recordedLandings:  hold.board.recordedLandingsOn(slot.target),
        hookPolicy:        'hooks-off',
      });
      if (verdict.verdict === 'refused') return verdict;
      if (slot.target === mainLine && ticket?.frontmatter.releasesGroup === true) releasedGroup = ticket.frontmatter.group;
      landOnTheBoard(hold, job, verdict.commit);
      return verdict;
    });
    if (landed.verdict !== 'refused') {
      cleanUpAfterLanding(job, releasedGroup);
      return true;
    }
    switch (LANDING_OUTCOME_OF_REFUSAL[landed.reason]) {
      case 'requeue-from-branch-tip':
        await freeSlot(job, { outcome: 'stopped', cause: 'target-moved-by-a-recorded-landing' });
        return true;
      case 'open-target-moved':
        return settleMovedTarget(job, landed.facts.targetTip ?? '');
      case 'hold-target':
        heldTargets.set(slot.target, {
          target: slot.target, branch: currentBranchIn(directory), blockingFiles: landed.facts.blockingFiles ?? [], heldFiles: landed.facts.heldFiles ?? []
        });
        await freeSlot(job, { outcome: 'stopped', cause: REQUEUE_CAUSES.targetHeld });
        return true;
      case 'hold-ticket':
        await freeSlot(job, { outcome: 'failed', cause: landed.reason }, (hold) => {
          hold.board.setTicketMergeQueued(ticketId, false, hold.at);
          hold.board.holdTicket(ticketId, `${LANDING_REFUSED_DECISION}:${landed.reason}`, hold.at);
          openDecision(hold, LANDING_REFUSED_DECISION, [ticketId], landed.reason);
        });
        return true;
      case 'finish-board-side':
        return true;
    }
  }

  /** Q38: requeued silently while the ref denies hold, parked after TARGET_MOVED_MERGES_BEFORE_PARKING moves in a row; else one decision per tip. */
  async function settleMovedTarget(job: Readonly<Job>, newTip: string): Promise<boolean> {
    const ticketId = ticketIdOf(job);
    if (!context.refDeniesHold) {
      return context.hold((hold) => {
        if (hold.board.decisions().some((decision) => decision.kind === 'target-moved' && decision.context === newTip)) return false;
        openDecision(hold, 'target-moved', [], newTip);
        return true;
      });
    }
    await freeSlot(job, { outcome: 'stopped', cause: REQUEUE_CAUSES.targetMoved }, (hold) => {
      if (isRefresh(job) || targetMovesInARowOf(hold.board, ticketId) < context.limits.TARGET_MOVED_MERGES_BEFORE_PARKING) return;
      hold.board.holdTicket(ticketId, `${PARKED_HOLD_PREFIX}target-moved`, hold.at);
      openDecision(hold, 'parked', [ticketId], REQUEUE_CAUSES.targetMoved);
    });
    return true;
  }

  async function advance(job: Readonly<Job>, hasOpenIncident: boolean): Promise<boolean> {
    switch (slotOf(job).phase) {
      case 'merge-in':
        return runMergeIn(job);
      case 'resolving':
      case 'fixing':
        return runAirlockAgent(job, hasOpenIncident);
      case 'gating':
        return runGate(job, hasOpenIncident);
      case 'landing':
        return runLanding(job);
    }
  }

  /** A parked candidate, by its incident's `merge abort` default or a `ticket park`, gives up the slot: the merge aborts and it leaves the queue. */
  async function abortParkedMerge(job: Readonly<Job>): Promise<boolean> {
    await freeSlot(job, { outcome: 'stopped', cause: MERGE_ABORTED_CAUSE }, (hold) => {
      job.ticketIds.forEach((ticketId) => hold.board.setTicketMergeQueued(ticketId, false, hold.at));
    });
    return true;
  }

  async function advanceTheSlot(target: string): Promise<boolean> {
    const holding = await context.hold((hold) => {
      const job = hold.board.airlockHolderOf(target);
      if (job === undefined) return null;
      const parked = job.ticketIds.some((ticketId) => hold.board.ticketByReference(ticketId)?.frontmatter.hold?.startsWith(PARKED_HOLD_PREFIX) === true);
      return { job, parked, hasOpenIncident: hold.board.incidents().some((incident) => incident.jobId === job.id) };
    });
    if (holding === null || holding.job.airlock === undefined) return false;
    if (holding.parked && !holding.hasOpenIncident) return abortParkedMerge(holding.job);
    return advance(holding.job, holding.hasOpenIncident);
  }

  function predictionOf(target: string, candidate: MergeCandidate): { candidate: MergeCandidate; branchTip: string | null; conflictedFiles: string[] | null } {
    const branch    = `ticket-${candidate.ticketId}`;
    const branchTip = GitProcess.resolvedCommitOf(context.repositoryRoot, `refs/heads/${branch}`);
    const predicted = predictMerge(context.repositoryRoot, { target, branch });
    return { candidate, branchTip, conflictedFiles: predicted.verdict === 'clean' ? [] : predicted.verdict === 'conflicting' ? predicted.conflictedFiles : null };
  }

  /** Design section 6.2's order: priority, clean first, fewest conflicts caused among the clean, readiness, ticket id. */
  function orderedPredictions(target: string, candidates: readonly MergeCandidate[]): ReturnType<typeof predictionOf>[] {
    const predictions = candidates.map((candidate) => predictionOf(target, candidate)).filter((prediction) => prediction.branchTip !== null);
    const clean       = predictions.filter((prediction) => prediction.conflictedFiles?.length === 0);
    const conflictsCaused = new Map(predictions.map((prediction) => {
      const others = clean.filter((other) => other.candidate.ticketId !== prediction.candidate.ticketId);
      const pairs  = others.map((other) => ({ target: `ticket-${other.candidate.ticketId}`, branch: `ticket-${prediction.candidate.ticketId}` }));
      return [prediction.candidate.ticketId, predictMerges(context.repositoryRoot, pairs).filter((pair) => pair.verdict !== 'clean').length];
    }));
    const isClean = (prediction: ReturnType<typeof predictionOf>): number => (prediction.conflictedFiles?.length === 0 ? 0 : 1);
    return predictions.sort((a, b) => (
      MERGE_PRIORITY_RANK[a.candidate.priority] - MERGE_PRIORITY_RANK[b.candidate.priority]
      || isClean(a) - isClean(b)
      || (conflictsCaused.get(a.candidate.ticketId) ?? 0) - (conflictsCaused.get(b.candidate.ticketId) ?? 0)
      || a.candidate.readiness - b.candidate.readiness
      || Number(a.candidate.ticketId) - Number(b.candidate.ticketId)
    ));
  }

  /** A refused claim (a higher priority queued meanwhile, the slot taken, a release queued) is derived again in the next round. */
  function claimed(claim: () => void): boolean {
    try {
      claim();
      return true;
    } catch (refusal) {
      if (refusal instanceof BoardRefusal) return true;
      throw refusal;
    }
  }

  /** Due as MergeQueueUtil says, never while a refused refresh of the group waits for User or main holds nothing the group lacks. */
  function refreshIsDue(target: string, releaseIsQueuedOrSlotted: boolean, refreshWasRefused: boolean): boolean {
    if (refreshWasRefused) return false;
    const count = GitProcess.run(context.repositoryRoot, ['rev-list', '--count', `${target}..${mainLine}`]);
    const mainCommitsAheadOfGroup = GitProcess.succeeded(count) ? Number(count.standardOutput.trim()) : null;
    if (mainCommitsAheadOfGroup === 0) return false;
    return MergeQueueUtil.groupRefreshIsDue({
      mainCommitsAheadOfGroup,
      groupTipAgainstMain:            forecastOf(predictMerge(context.repositoryRoot, { target, branch: mainLine })),
      releaseTicketIsQueuedOrSlotted: releaseIsQueuedOrSlotted,
    }, context.limits);
  }

  async function allocateRefresh(target: string, releaseIsQueuedOrSlotted: boolean, refreshWasRefused: boolean): Promise<boolean> {
    const targetTip = GitProcess.resolvedCommitOf(context.repositoryRoot, `refs/heads/${target}`);
    const mainTip   = GitProcess.resolvedCommitOf(context.repositoryRoot, `refs/heads/${mainLine}`);
    if (targetTip === null || mainTip === null || !refreshIsDue(target, releaseIsQueuedOrSlotted, refreshWasRefused)) return false;
    return context.hold((hold) => {
      const tipsMoved = GitProcess.resolvedCommitOf(context.repositoryRoot, `refs/heads/${target}`) !== targetTip
        || GitProcess.resolvedCommitOf(context.repositoryRoot, `refs/heads/${mainLine}`) !== mainTip;
      return tipsMoved || claimed(() => hold.board.claimRefreshSlot({
        group: groupOf(target), target, targetTip, mainTip
      }, hold.at));
    });
  }

  async function allocate(target: string): Promise<boolean> {
    if (heldTargets.has(target) || context.dispatchIsStopped()) return false;
    const queue = await context.hold((hold) => {
      if (hold.board.airlockHolderOf(target) !== undefined) return null;
      const isGroup = target !== mainLine;
      return {
        candidates:               hold.board.mergeCandidatesOf(target, targetOf, branchTreeOf),
        releaseIsQueuedOrSlotted: isGroup && hold.board.groupReleaseQueuedOrSlotted(groupOf(target)) !== null,
        refreshWasRefused:        isGroup && hold.board.decisions().some((decision) => (
          decision.kind === 'merge-refused' && decision.ticketIds.length === 0 && decision.context.startsWith(`${target}${REFRESH_REFUSAL_SEPARATOR}`)
        )),
      };
    });
    if (queue === null) return false;
    if (target !== mainLine && await allocateRefresh(target, queue.releaseIsQueuedOrSlotted, queue.refreshWasRefused)) return true;
    const [first] = orderedPredictions(target, queue.candidates);
    if (first?.branchTip === undefined || first.branchTip === null) return false;
    const targetTip = GitProcess.resolvedCommitOf(context.repositoryRoot, `refs/heads/${target}`);
    if (targetTip === null) return false;
    const { branchTip } = first;
    return context.hold((hold) => {
      const tipsMoved = GitProcess.resolvedCommitOf(context.repositoryRoot, `refs/heads/${target}`) !== targetTip
        || GitProcess.resolvedCommitOf(context.repositoryRoot, `refs/heads/ticket-${first.candidate.ticketId}`) !== branchTip;
      return tipsMoved || claimed(() => hold.board.claimAirlock({
        ticketId: first.candidate.ticketId, target, targetTip, branchTip, predictedConflictFiles: first.conflictedFiles ?? [],
      }, targetOf, branchTreeOf, hold.at));
    });
  }

  /** The main line, every group with an open ticket, and every target a slot still holds. */
  async function liveTargets(): Promise<string[]> {
    return context.hold((hold) => {
      const targets = new Set([mainLine]);
      for (const { frontmatter } of hold.board.tickets()) {
        if (frontmatter.group !== undefined && frontmatter.status !== 'delivered' && frontmatter.status !== 'abandoned') targets.add(`${groupTargetPrefix}${frontmatter.group}`);
      }
      for (const job of hold.board.jobs()) if ((job.kind === 'merge' || isRefresh(job)) && job.target !== null) targets.add(job.target);
      return [...targets];
    });
  }

  async function sweep(): Promise<readonly HeldTarget[]> {
    recheckHeldTargets();
    for (let round = 0; round < ROUNDS_PER_SWEEP; round += 1) {
      let moved = false;
      for (const target of await liveTargets()) {
        const advanced  = await advanceTheSlot(target);
        const regated   = await settleTicketsAwaitingGreen(target);
        const allocated = await allocate(target);
        moved = moved || advanced || regated || allocated;
      }
      if (!moved) break;
    }
    return [...heldTargets.values()];
  }

  return { sweep };
}
