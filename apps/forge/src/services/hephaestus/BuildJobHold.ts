/**
 * The moves a hold makes on one worktree job: open its incident, end it, or interrupt it on a red handoff its session resumes from.
 */
import { mkdirSync }                                               from 'node:fs';
import type { RedHandoffFacts }                                    from '../../adapters/red-handoff/RedHandoffIngestion.ts';
import type { Job }                                                from '../../domain/tracker-model/@types/Job.ts';
import type { Board }                                              from '../../domain/tracker-model/Board.ts';
import { FRESH_AGENT_CAUSE, STOPPED_BY_USER_CAUSE }                from '../../domain/tracker-model/JobControls.ts';
import { HANDOFF_RED_INTERRUPTION }                                from '../../domain/tracker-model/constants/JobStates.ts';
import { GitProcess }                                              from '../../lib/git/GitProcess.ts';
import { GitWorktrees }                                            from '../../lib/git/GitWorktrees.ts';
import { RED_HANDOFF_RESUME_CALL_BUDGET }                          from '../../shared/constants/HephaestusLimits.ts';
import { LIFECYCLE_LIMITS }                                        from '../../shared/constants/LifecycleLimits.ts';
import type { BuildJobIncidentKind, HoldContext, RedHandoffCause } from './@types/HoldContext.ts';
import type { JobLaunchContext }                                   from './@types/JobLaunchContext.ts';
import { RedHandoff }                                              from './RedHandoff.ts';
import { StoredFileUnreadable }                                    from './StoredFileUnreadable.ts';
import { WorktreeJobs }                                            from './WorktreeJobs.ts';

/**
 * The job's own red handoff in its hold; `null` while it never went red. The hold takes none of the job's steps over facts its observation
 * found unreadable, so a step that reads them here finds them readable.
 */
function ownRedHandoffInTheHoldOf(context: Pick<JobLaunchContext, 'workspace'>, job: Readonly<Job>): RedHandoffFacts | null {
  const facts = RedHandoff.redHandoffFactsOf(context.workspace.trackerDirectory, WorktreeJobs.jobFolderOf(context.workspace, job));
  return StoredFileUnreadable.isUnreadableFile(facts) ? null : facts;
}

function openIncidentFor(hold: HoldContext, job: Readonly<Job>, kind: BuildJobIncidentKind, facts: Record<string, string>): void {
  const defaultMoves = {
    'setup-failed': 'worktree-repair', 'out-of-calls': 'job-fresh', 'blocked': 'ticket-park', 'gate-cannot-run': 'gate-retry', 'sandbox-unavailable': 'gate-retry'
  } as const;
  hold.logged.push(...hold.change.board.openIncident({
    kind, ticketIds: job.ticketIds, jobId: job.id, facts, defaultMove: defaultMoves[kind]
  }, hold.change.at).logged);
}

/** On the job whose step needed the file, which takes no step on it until a move on the incident. */
function openUnreadableFileIncident(hold: HoldContext, job: Readonly<Job>, unreadable: StoredFileUnreadable): void {
  hold.logged.push(...StoredFileUnreadable.openIncidentOn(hold.change.board, job.id, unreadable, hold.change.at));
}

function endJob(hold: HoldContext, job: Readonly<Job>, ending: Parameters<Board['endJob']>[1]): void {
  hold.logged.push(...hold.change.board.endJob(job.id, ending, hold.change.at).logged);
}

/**
 * A red gate or Customs check never ends the job: the restart is written in its folder and the job interrupted `handoff-red`, which the
 * lifecycle resumes in the same session while its cycle has resumes left and parks after.
 */
function interruptOnRedHandoff(hold: HoldContext, job: Readonly<Job>, cause: RedHandoffCause): void {
  const jobFolder = WorktreeJobs.jobFolderOf(hold.context.workspace, job);
  const earlier = ownRedHandoffInTheHoldOf(hold.context, job);
  const { output, scopeResumed: sentBackForScope, ...named } = cause;
  mkdirSync(jobFolder, { recursive: true });
  const scopeResumed = sentBackForScope === true || scopeResumeSpent(hold.context, job);
  RedHandoff.writeRedHandoff(jobFolder, {
    ...named,
    commit: GitProcess.resolvedCommitOf(
      WorktreeJobs.worktreeOf(hold.context.workspace, job), 'HEAD', GitWorktrees.ceilingOf(WorktreeJobs.worktreeOf(hold.context.workspace, job))
    ) ?? '',
    gateFailureNotePath: RedHandoff.gateFailureNotePathOf(jobFolder),
    resume:              (earlier?.resume ?? 0) + 1,
    resumesAllowed:      LIFECYCLE_LIMITS.RED_HANDOFF_RESUMES_BEFORE_PARKING,
    callBudget:          RED_HANDOFF_RESUME_CALL_BUDGET,
    interruptedInstance: job.childInstance,
    ...(scopeResumed ? { scopeResumed: true as const } : {}),
  }, output);
  hold.logged.push(...hold.change.board.interruptJob(job.id, HANDOFF_RED_INTERRUPTION, hold.change.at).logged);
}

function workingOffARedHandoff(context: Pick<JobLaunchContext, 'workspace'>, job: Readonly<Job>): boolean {
  return ownRedHandoffInTheHoldOf(context, job) !== null;
}

/** What the last red handoff named, carried into the next one when a resumed session runs past its grace. */
function redHandoffCauseOf(context: Pick<JobLaunchContext, 'workspace'>, job: Readonly<Job>): Omit<RedHandoffCause, 'output'> {
  const facts = ownRedHandoffInTheHoldOf(context, job);
  return {
    kind:        facts?.kind ?? 'gate',
    name:        facts?.name ?? '',
    command:     facts?.command ?? null,
    fixCommand:  facts?.fixCommand ?? null,
    exitCode:    facts?.exitCode ?? null,
    fullLogPath: facts?.fullLogPath ?? null,
  };
}

/**
 * A red handoff of the job sent it back for a scope refusal before: its one V17 resume is spent, also when a red gate or another check came
 * after. A `git-failed` V17 spends nothing.
 */
function scopeResumeSpent(context: Pick<JobLaunchContext, 'workspace'>, job: Readonly<Job>): boolean {
  return ownRedHandoffInTheHoldOf(context, job)?.scopeResumed === true;
}

/** A job User stopped ends `stopped`; one User freshened ends `replaced`, so the next attempt starts on the same worktree. */
function userStopEndingOf(job: Readonly<Job>): Parameters<Board['endJob']>[1] | null {
  if (job.stopRequest === 'fresh') return { outcome: 'replaced', cause: FRESH_AGENT_CAUSE };
  return job.stopRequest === 'stop' ? { outcome: 'stopped', cause: STOPPED_BY_USER_CAUSE } : null;
}

export const BuildJobHold = Object.freeze({
  ownRedHandoffInTheHoldOf,
  openIncidentFor,
  openUnreadableFileIncident,
  endJob,
  interruptOnRedHandoff,
  workingOffARedHandoff,
  redHandoffCauseOf,
  scopeResumeSpent,
  userStopEndingOf,
});
