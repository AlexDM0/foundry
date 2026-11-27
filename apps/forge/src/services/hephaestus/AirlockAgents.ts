/**
 * The merge agents of a slot: the ticket's last worker resumed for a conflict or a red merged tree, a part's worker of a crossing ticket's
 * conflict, and the conflict re-reviewers, each launched, budgeted and settled by its report.
 */
import type { KeptAirlockFacts }                        from '../../adapters/airlock-facts/AirlockFactsIngestion.ts';
import type { Job }                                     from '../../domain/tracker-model/@types/Job.ts';
import type { Board }                                   from '../../domain/tracker-model/Board.ts';
import { HANDOFF_RED_INTERRUPTION }                     from '../../domain/tracker-model/constants/JobStates.ts';
import { RED_HANDOFF_RESUME_CALL_BUDGET }               from '../../shared/constants/HephaestusLimits.ts';
import { MergeRun, type CrossingLanding }               from '../lifecycle/MergeRun.ts';
import type { AirlockAgentHistory, AirlockAgentScope }  from './@types/AirlockAgents.ts';
import type { AirlockAgents, AirlockRed, AirlockSlots } from './@types/AirlockParts.ts';
import type { AirlockHold, AirlocksContext }            from './@types/Airlocks.ts';
import {
  airlockAgentHistoryOf,
  conflictPartFactsOf,
  conflictPartScopeOf,
  entityAndStageOf,
  homeWorkerScopeOf,
  nextConflictReReviewerOf,
  redResumesOf
} from './AirlockAgentHistory.ts';
import {
  crossingLandingOf,
  mergeAgentOf,
  redGateOf,
  slotOf,
  ticketIdOf
} from './AirlockReadings.ts';
import { RedHandoff }                                                    from './RedHandoff.ts';
import { UnreadableJobFileIncident }                                     from './UnreadableJobFileIncident.ts';
import { MERGE_REFUSED_CAUSES, REQUEUE_CAUSES, RED_RESUMES_SPENT_CAUSE } from './constants/AirlockCauses.ts';

function reportFieldOf(report: unknown, field: string): unknown {
  return typeof report === 'object' && report !== null && Object.hasOwn(report, field) ? (report as Record<string, unknown>)[field] : undefined;
}

export function createAirlockAgents(context: AirlocksContext, slots: AirlockSlots): AirlockAgents {
  const {
    freeSlot, refuseMerge, setPhase, slotWorktreeOf
  } = slots;

  /**
   * The ticket's last worker goes into the Airlock worktree, its own session resumed, or a conflict re-reviewer as a fresh session; a fresh
   * agent of the same role in place of one that could not resume carries the same attempt.
   */
  function launchAirlockAgent(hold: AirlockHold, job: Readonly<Job>, attempt: number, scope: AirlockAgentScope): void {
    hold.board.launchJob({
      kind: 'merge-agent', role: scope.role, ticketIds: job.ticketIds, parentJobId: job.id, attempt, target: slotOf(job).target, ...entityAndStageOf(scope),
    }, hold.at);
  }

  /**
   * A red merged tree goes back to the ticket's last worker with the red handoff message: its session in the Airlock is resumed (the
   * conflict re-reviewer's after a re-review), or, with none there yet, the last worker's own session is resumed into the Airlock. Past the
   * resumes the agent ends `failed` and the merge parks. Returns whether the resumes are spent.
   */
  function resumeOrSpendTheAgent(
    hold: AirlockHold, job: Readonly<Job>, agent: Readonly<Job> | undefined, red: AirlockRed
  ): boolean {
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
        command:             redGateOf(hold.board.pipeline(), red.entity, red.step)?.run ?? null,
        fixCommand:          null,
        commit:              MergeRun.headOf(red.worktree) ?? '',
        exitCode:            null,
        gateFailureNotePath: RedHandoff.gateFailureNotePathOf(folder),
        fullLogPath:         null,
        resume:              resumes + 1,
        resumesAllowed:      context.redHandoffResumes,
        callBudget:          RED_HANDOFF_RESUME_CALL_BUDGET,
        interruptedInstance: agent?.childInstance ?? 0,
      }, red.output);
    }
    if (agent === undefined) launchAirlockAgent(hold, job, 1, homeWorkerScopeOf(hold.board, ticketIdOf(job)));
    else hold.board.interruptJob(agent.id, HANDOFF_RED_INTERRUPTION, hold.at);
    setPhase(hold, job, 'fixing');
    return false;
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
      await context.hold((hold) => launchAirlockAgent(
        hold, job, ending.attempt, ending.role === null ? homeWorkerScopeOf(hold.board, ticketIdOf(job)) : { role: ending.role, ...entityAndStageOf(ending) }
      ));
      return true;
    }
    await freeSlot(job, { outcome: 'stopped', cause: REQUEUE_CAUSES.orphaned });
    return true;
  }

  /**
   * At its budget or on `cannot-resolve` the merge is refused; on `resolved` the agent waits through the gate of the merged tree, so a red
   * one resumes the same session and a pass ends it `resolved`. A resolution V10 refuses, or, for a tracker in a project folder, V5, V17 or
   * V13 on the report of a resolution or of a red gate's fix, refuses the merge. A sound resolution that changed more lines than the merge
   * train's re-review threshold goes to a conflict re-reviewer first, and one a package's builder took part in goes to that package's
   * conflict re-reviewer too (E62). A crossing ticket's worker that left the merge open hands it on to the next part's worker (E64).
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
    // Its report is in: nothing else closes an Airlock agent's session, so Hephaestus stops it before settling the slot.
    await context.stopMergeAgent(agent);
    if (slotOf(job).phase === 're-reviewing') return settleConflictReReview(job, agent, reading.report);
    const notes   = String(reportFieldOf(reading.report, 'notes') ?? '');
    const outcome = reportFieldOf(reading.report, 'outcome');
    if (outcome !== 'resolved') {
      const cause = outcome === 'cannot-resolve' ? MERGE_REFUSED_CAUSES.cannotResolve : MERGE_REFUSED_CAUSES.noReport;
      await refuseMerge(job, cause, notes, reportFieldOf(reading.report, 'reportKind') ?? null);
      return true;
    }
    const worktree      = slotWorktreeOf(job);
    const resolvedFiles = reportFieldOf(reading.report, 'resolvedFiles');
    // An empty path names no file, and the kept facts refuse one.
    const resolvedFileList = Array.isArray(resolvedFiles) ? resolvedFiles.map(String).filter((path) => path !== '') : [];
    const isResolving = slotOf(job).phase === 'resolving';
    const kept = isResolving ? context.keptAirlockFactsOf(job) : null;
    if (kept?.verdict === 'unreadable') {
      // The resolution is not settled on facts that cannot be read: the merge job waits on its incident.
      await context.hold((hold) => UnreadableJobFileIncident.openOnce(hold.board, kept.unreadableFile, hold.at));
      return true;
    }
    const keptFacts = kept?.verdict === 'kept' ? kept.facts : null;
    const landing = isResolving ? await context.hold((hold) => crossingLandingOf(hold.board, ticketIdOf(job))) : null;
    // Only a crossing ticket's conflict is split by owner, so only its resolution asks git whether the merge was left open.
    if (landing !== null && MergeRun.mergeIsInProgress(worktree)) return handOnTheOpenMerge(job, agent, landing, resolvedFileList, notes, keptFacts);
    // The files the workers before this one resolved, on a crossing ticket's conflict split by owner; none for every other merge.
    const filesResolvedBefore = keptFacts?.filesResolvedBefore ?? [];
    if (isResolving && !MergeRun.resolutionIsSound(worktree, MergeRun.sidesOf(job, slotOf(job)), [...filesResolvedBefore, ...resolvedFileList], context.agentNaming)) {
      await refuseMerge(job, MERGE_REFUSED_CAUSES.unresolved, notes);
      return true;
    }
    if (await refusedOutsideProjectScope(job, worktree, resolvedFileList, `The resolution of job ${agent.id}`)) return true;
    const reReview = isResolving ? await context.hold((hold) => hold.board.pipeline()?.airlock?.reReview ?? null) : null;
    // Fail closed: a resolution whose size git cannot tell is re-reviewed.
    const resolutionLines = reReview === null ? null : context.resolutionLinesOf(worktree);
    const homeNeedsAReReview = reReview !== null && (resolutionLines === null || resolutionLines > reReview.thresholdLines);
    await context.hold((hold) => {
      const reReviewer = isResolving ? nextConflictReReviewerOf(hold.board, job, homeNeedsAReReview) : null;
      if (reReviewer !== null) {
        hold.board.endJob(agent.id, { outcome: 'resolved', commit: MergeRun.headOf(worktree) ?? '' }, hold.at);
        launchAirlockAgent(hold, job, 1, reReviewer);
        setPhase(hold, job, 're-reviewing');
        return;
      }
      hold.board.moveJob(agent.id, 'gating', hold.at);
      setPhase(hold, job, 'gating');
    });
    return true;
  }

  /**
   * A worker that left the merge open hands it on (E64): the files of its own part and of the parts before it resolved, whatever its report
   * lists, and the rest still unmerged, the next part's worker is launched in the same worktree, the home's last, which commits the one
   * merge. Anything else refuses the merge, so a worker that hands on its own part unresolved is never launched again on it.
   */
  async function handOnTheOpenMerge(
    job: Readonly<Job>, agent: Readonly<Job>, landing: Readonly<CrossingLanding>, resolvedFiles: readonly string[], notes: string, keptFacts: KeptAirlockFacts | null
  ): Promise<boolean> {
    const sides = MergeRun.sidesOf(job, slotOf(job));
    const ownPartFiles = keptFacts?.conflictedFiles ?? [];
    const filesResolvedBefore = [...new Set([...keptFacts?.filesResolvedBefore ?? [], ...ownPartFiles, ...resolvedFiles])];
    const verdict = ownPartFiles.length === 0 ? { verdict: 'unresolved' } as const : MergeRun.openMergeVerdictOf(slotWorktreeOf(job), sides, filesResolvedBefore);
    if (verdict.verdict === 'unresolved') {
      await refuseMerge(job, MERGE_REFUSED_CAUSES.unresolved, notes);
      return true;
    }
    await context.hold((hold) => {
      const part = MergeRun.firstConflictPartOf(landing, verdict.remainingFiles) ?? { packageEntity: null, files: verdict.remainingFiles, leavesTheMergeOpen: false };
      hold.board.endJob(agent.id, { outcome: 'resolved', commit: sides.startTip }, hold.at);
      context.keepAirlockFacts(job, conflictPartFactsOf(part, filesResolvedBefore));
      launchAirlockAgent(hold, job, 1, conflictPartScopeOf(part, homeWorkerScopeOf(hold.board, ticketIdOf(job))));
    });
    return true;
  }

  /**
   * For a tracker in a project folder, V5, V17 and V13 on every commit since the branch tip, so a red gate's fix and a re-reviewer's fix are
   * judged with the resolution; a refusal refuses the merge. A tracker at its repository's root asks nothing here, as it always did.
   */
  async function refusedOutsideProjectScope(job: Readonly<Job>, worktree: string, resolvedFiles: readonly string[], refusedWork: string): Promise<boolean> {
    const { projectPrefix } = context;
    if (projectPrefix === undefined || projectPrefix === '') return false;
    const reach = await context.hold((hold) => hold.board.pipeline()?.reach ?? []);
    const verdict = MergeRun.resolutionScopeVerdictOf(worktree, MergeRun.sidesOf(job, slotOf(job)), resolvedFiles, { projectPrefix, reach }, context.agentNaming);
    if (verdict.verdict === 'in-scope') return false;
    await refuseMerge(job, verdict.reason, `${refusedWork} was refused: ${verdict.reason} ${verdict.facts.join(', ')}`.trim());
    return true;
  }

  /** The commit the conflict re-reviewer started from: the resolution its merge job's resolver ended on. */
  function resolutionCommitOf(board: Board, job: Readonly<Job>): string {
    const resolverJobIds = new Set<string>();
    let resolutionCommit = '';
    for (const record of board.logRecordsSoFar()) {
      if (record.kind === 'job-launched' && record.fields.parentJobId === job.id && record.fields.role !== 'conflict-re-reviewer') resolverJobIds.add(record.jobId);
      if (record.kind === 'job-ended' && resolverJobIds.has(record.jobId) && record.fields.outcome === 'resolved') resolutionCommit = record.fields.commit ?? '';
    }
    return resolutionCommit;
  }

  /**
   * A re-review whose report holds goes on to the next re-review the resolution needs, or to the gate of the merged tree, its agent waiting
   * through it as a resolver does, so a red gate resumes it; an invalid report, a moved history, a claim that still does not hold or, for a
   * tracker in a project folder, a fix V5, V17 or V13 refuses, refuses the merge.
   */
  async function settleConflictReReview(job: Readonly<Job>, agent: Readonly<Job>, report: unknown): Promise<boolean> {
    const worktree = slotWorktreeOf(job);
    const resolutionCommit = await context.hold((hold) => resolutionCommitOf(hold.board, job));
    const verdict = MergeRun.reReviewVerdictOf(worktree, resolutionCommit, report, context.agentNaming);
    if (verdict.verdict === 'customs-refused') {
      const cause = verdict.reason === 'report-invalid' ? MERGE_REFUSED_CAUSES.noReport : MERGE_REFUSED_CAUSES.reReviewFailed;
      const facts = [...verdict.facts, ...(verdict.reportProblems ?? []).map(context.mergeDecisionSentenceOf)];
      await refuseMerge(job, cause, `The conflict re-review of job ${agent.id} was refused: ${verdict.reason} ${facts.join(', ')}`.trim());
      return true;
    }
    if (verdict.verdict === 'claims-refused') {
      const reviewText = String(reportFieldOf(report, 'reviewText') ?? '');
      await refuseMerge(job, MERGE_REFUSED_CAUSES.reReviewFailed, `${reviewText}\n\nDoes not hold: ${verdict.acceptanceItems.join(', ')}`.trim());
      return true;
    }
    if (await refusedOutsideProjectScope(job, worktree, [], `The conflict re-review of job ${agent.id}`)) return true;
    await context.hold((hold) => {
      // A home re-review, when needed, came first: only the packages' re-reviews can follow (E62).
      const nextReReviewer = nextConflictReReviewerOf(hold.board, job, false);
      if (nextReReviewer !== null) {
        hold.board.endJob(agent.id, { outcome: 'reviewed', commit: MergeRun.headOf(worktree) ?? '' }, hold.at);
        launchAirlockAgent(hold, job, 1, nextReReviewer);
        return;
      }
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

  return { launchAirlockAgent, resumeOrSpendTheAgent, runAirlockAgent };
}
