/**
 * A worktree job in Customs: its report and branch judged against the start it kept, then sent on to its gates, back to its session, or
 * ended with what its refusal opens.
 */
import type { Job }                                                 from '../../domain/tracker-model/@types/Job.ts';
import type { EntityKey }                                           from '../../domain/tracker-model/@types/Pipeline.ts';
import type { DecisionDraft }                                       from '../../domain/tracker-model/@types/PlaybookStep.ts';
import type { Board }                                               from '../../domain/tracker-model/Board.ts';
import { EntityOwnershipUtil }                                      from '../../domain/tracker-model/utils/EntityOwnershipUtil.ts';
import { TicketStageUtil }                                          from '../../domain/tracker-model/utils/TicketStageUtil.ts';
import { WorktreesFolder }                                          from '../../shared/WorktreesFolder.ts';
import { type CrossingStageScope, type CustomsSubject }             from '../lifecycle/@types/CustomsSubject.ts';
import { type CustomsVerdict, type VerificationCheck }              from '../lifecycle/@types/CustomsVerdict.ts';
import { type RefMovesAllowed }                                     from '../lifecycle/@types/RefMoves.ts';
import { clearCustoms, CUSTOMS_CHECKS }                             from '../lifecycle/Customs.ts';
import { retriedFailedBuildJobIdOf }                                from '../lifecycle/CustomsHistoryChecks.ts';
import { refMovesAllowedOf, sharedRepositoryRefsOf, watchedRefsOf } from '../lifecycle/CustomsRefMovesCheck.ts';
import type { BuildJobObservation }                                 from './@types/BuildJobObservation.ts';
import type { HoldContext }                                         from './@types/HoldContext.ts';
import type { JobLaunchContext }                                    from './@types/JobLaunchContext.ts';
import { AgentConfigHits }                                          from './AgentConfigHits.ts';
import { BuildJobHold }                                             from './BuildJobHold.ts';
import { BuildReport }                                              from './BuildReport.ts';
import { ConstitutionCommits }                                      from './ConstitutionCommits.ts';
import { CrossingStages }                                           from './CrossingStages.ts';
import { GroupWorktrees }                                           from './GroupWorktrees.ts';
import { InstructionFiles }                                         from './InstructionFiles.ts';
import { JobLaunch }                                                from './JobLaunch.ts';
import { JobPipelines, REPOSITORY_ROOT_FOLDER }                     from './JobPipelines.ts';
import { JobTicketDocuments }                                       from './JobTicketDocuments.ts';
import { NeedTickets }                                              from './NeedTickets.ts';
import { PipelineAgentSessions }                                    from './PipelineAgentSessions.ts';
import { StoredFileUnreadable }                                     from './StoredFileUnreadable.ts';
import { REVIEW_JOB_KIND, WorktreeJobs }                            from './WorktreeJobs.ts';
import { BUILD_JOB_CAUSES }                                         from './constants/BuildJobCauses.ts';

const WORK_IN_OTHER_ENTITY_DECISION = 'work-in-other-entity';

const PACKAGE_REFUSED_DECISION = 'package-refused';

/** The scope check's refusal of a job of an entity whose branch changed nothing in its own folders. */
const ONLY_OUTSIDE_THE_ENTITY = 'changed-only-outside-home-and-reach';

/** The scope check's refusals of a branch that changed another entity's files; a `git-failed` V17 stays an ordinary red handoff. */
const SCOPE_REFUSALS: readonly string[] = ['changed-outside-home-and-reach', ONLY_OUTSIDE_THE_ENTITY, 'sealed-change-altered', 'constitution-outside-ticket-entity'];

/** Customs' view of a job of a crossing ticket, measured from the start of its stage's run; `null` for every other job. */
function crossingStageScopeOfJob(hold: HoldContext, job: Readonly<Job>): CrossingStageScope | null | StoredFileUnreadable {
  const { board } = hold.change;
  const { trackerDirectory } = hold.context.workspace;
  const crossingStage = CrossingStages.crossingStageScopeOf(board, trackerDirectory, job);
  if (crossingStage === null) return null;
  const runStartJobId = CrossingStages.stageRunStartJobIdOf(board.logRecordsSoFar(), job);
  const runStart = runStartJobId === job.id ? null : JobLaunch.jobStartOf(trackerDirectory, runStartJobId);
  if (StoredFileUnreadable.isUnreadableFile(runStart)) return runStart;
  return runStart === null ? crossingStage : { ...crossingStage, stageStartCommit: runStart.startCommit };
}

/**
 * Customs judges the job from its start and the starts of the jobs it measures from, a failed build it retries and its stage run's first
 * job: one that cannot be read opens its incident, and the job waits in Customs.
 */
function verifyAndRoute(hold: HoldContext, job: Readonly<Job>, observation: BuildJobObservation): void {
  const { board, at } = hold.change;
  const { trackerDirectory } = hold.context.workspace;
  const ticket = board.tickets().find((candidate) => candidate.frontmatter.id === WorktreeJobs.ticketIdOf(job));
  const start = JobLaunch.jobStartOf(trackerDirectory, job.id);
  const retriedJobId = retriedFailedBuildJobIdOf(board.logRecordsSoFar(), job.id);
  const retriedStart = retriedJobId === null ? null : JobLaunch.jobStartOf(trackerDirectory, retriedJobId);
  const crossingStage = crossingStageScopeOfJob(hold, job);
  const unreadable = [start, retriedStart, crossingStage].find(StoredFileUnreadable.isUnreadableFile);
  if (StoredFileUnreadable.isUnreadableFile(start) || StoredFileUnreadable.isUnreadableFile(retriedStart) || StoredFileUnreadable.isUnreadableFile(crossingStage)) {
    if (unreadable !== undefined) BuildJobHold.openUnreadableFileIncident(hold, job, unreadable);
    return;
  }
  if (ticket === undefined || start === null) {
    BuildJobHold.endJob(hold, job, { outcome: 'failed', cause: 'git-failed' });
    return;
  }
  const { projectPrefix } = WorktreeJobs.projectLocationOfContext(hold.context);
  const pipeline = board.pipeline();
  const refusedPackages = pipeline?.entities === undefined ? [] : CrossingStages.refusedPackagesOf(board.logRecordsSoFar(), WorktreeJobs.ticketIdOf(job));
  const projectScope = JobPipelines.projectScopeOf(projectPrefix, pipeline, job, ticket.frontmatter.entity, refusedPackages);
  const subject: CustomsSubject = {
    role:                     job.kind === REVIEW_JOB_KIND ? 'reviewer' : 'builder',
    worktreePath:             WorktreeJobs.worktreeOf(hold.context.workspace, job),
    startCommit:              start.startCommit,
    ...(retriedStart === null ? {} : { workStartCommit: retriedStart.startCommit }),
    contentHashAtLaunch:      start.contentHashAtLaunch,
    ticketContentHash:        ticket.frontmatter.contentHash ?? '',
    documentVersionsAtLaunch: start.documentVersionsAtLaunch ?? '',
    ticketDocumentVersions:   JobTicketDocuments.ticketDocumentVersionsOf(board, ticket.frontmatter.id),
    report:                   observation.report,
    ...JobTicketDocuments.ticketTextOfCustoms(board, ticket),
    jobId:                    job.id,
    logRecords:               board.logRecordsSoFar(),
    launchSnapshot:           start.launchSnapshot,
    refMovesAllowed:          refMovesAllowedFor(hold.context, board, job),
    gates:                    pipeline === null ? [] : JobPipelines.stepsPipelineOf(pipeline, job)?.gates ?? [],
    instructionFiles:         InstructionFiles.trackedInstructionPathsOf(pipeline, projectPrefix),
    target:                   job.target ?? hold.context.mainLine,
    pathStyle:                hold.context.platformPorts.dataFolders,
    agentNaming:              hold.context.agentAdapter,
    ...(projectScope === null ? {} : { projectScope }),
    ...(crossingStage === null ? {} : { crossingStage }),
  };
  const reportVerdict = CUSTOMS_CHECKS.V1(subject);
  if (reportVerdict.verdict === 'refused') {
    BuildJobHold.endJob(hold, job, { outcome: 'failed', cause: reportVerdict.reason === 'report-invalid' ? BUILD_JOB_CAUSES.noReport : reportVerdict.reason });
    return;
  }
  const outcome = BuildReport.reportFieldOf(observation.report, 'outcome');
  if (outcome === 'blocked') {
    BuildJobHold.openIncidentFor(hold, job, 'blocked', { reason: String(BuildReport.reportFieldOf(observation.report, 'blockedReason') ?? '') });
    BuildJobHold.endJob(hold, job, { outcome: 'blocked' });
    return;
  }
  if (outcome === 'wound-down') {
    BuildJobHold.openIncidentFor(hold, job, 'out-of-calls', { calls: String(observation.calls) });
    BuildJobHold.endJob(hold, job, { outcome: 'wound-down' });
    return;
  }
  if (outcome === 'cannot-build') {
    BuildJobHold.endJob(hold, job, { outcome: 'failed', cause: BUILD_JOB_CAUSES.cannotBuild });
    return;
  }
  if (outcome === 'needs-declared') {
    endJobOnItsNeeds(hold, job);
    return;
  }
  if (outcome === 'refused') {
    endJobOnItsRefusal(hold, job, String(BuildReport.reportFieldOf(observation.report, 'refusedReason') ?? ''));
    return;
  }
  if (outcome === 'package-return') {
    endJobOnItsPackageReturn(hold, job, subject, observation.report);
    return;
  }
  const verdict = clearCustoms(subject);
  if (verdict.verdict === 'refused') {
    routeCustomsRefusal(hold, job, verdict);
    return;
  }
  hold.logged.push(...board.moveJob(job.id, 'gating', at).logged);
}

/** A refusal of a scope check sends an entity's session back once, then fails the job; a resumable check sends it back to fix. */
function routeCustomsRefusal(hold: HoldContext, job: Readonly<Job>, verdict: Readonly<Extract<CustomsVerdict, { verdict: 'refused' }>>): void {
  if (SCOPE_REFUSALS.includes(verdict.reason) && job.entity !== undefined && BuildJobHold.scopeResumeSpent(hold.context, job)) {
    if (verdict.reason === ONLY_OUTSIDE_THE_ENTITY) openWorkInOtherEntityDecision(hold, job, verdict.facts);
    BuildJobHold.endJob(hold, job, { outcome: 'failed', cause: verdict.reason });
    return;
  }
  if (resumableCustomsChecksOf(job).includes(verdict.check)) {
    BuildJobHold.interruptOnRedHandoff(hold, job, {
      kind:        'customs',
      name:        verdict.check,
      command:     null,
      fixCommand:  null,
      exitCode:    null,
      fullLogPath: null,
      output:      customsOutputOf(verdict),
      ...(SCOPE_REFUSALS.includes(verdict.reason) ? { scopeResumed: true as const } : {}),
    });
    return;
  }
  if (verdict.check === 'V13') AgentConfigHits.openAgentConfigDecision(hold, job);
  BuildJobHold.endJob(hold, job, { outcome: 'failed', cause: verdict.check === 'V7' ? BUILD_JOB_CAUSES.attribution : verdict.reason });
}

/**
 * A job of an entity files its needs as their entities' tickets in this hold and ends `needs-declared`, its branch and commits kept; one
 * that kept no need declared nothing, and a job without an entity has no needs, so both fail as a report without one.
 */
function endJobOnItsNeeds(hold: HoldContext, job: Readonly<Job>): void {
  if (job.entity === undefined) {
    BuildJobHold.endJob(hold, job, { outcome: 'failed', cause: BUILD_JOB_CAUSES.noReport });
    return;
  }
  const filed = NeedTickets.fileNeedsOf(hold.change, job, hold.context.decisionWordingOf);
  hold.logged.push(...filed.logged);
  BuildJobHold.endJob(hold, job, filed.filedNeedCount === 0 ? { outcome: 'failed', cause: BUILD_JOB_CAUSES.noReport } : { outcome: 'needs-declared' });
}

/**
 * A package build whose constitution forbids the package change ends `refused` (E22), its branch and commits kept, and opens
 * `package-refused` with its reason, which holds the ticket until User answers. The reason also waits in its job folder, for the stage 1
 * that takes the change back out once User drops it or turns it into a need. Only a package build's report can say `refused`.
 */
function endJobOnItsRefusal(hold: HoldContext, job: Readonly<Job>, refusedReason: string): void {
  const { board, at } = hold.change;
  if (TicketStageUtil.stageOfJob(job)?.name !== 'package-build' || job.entity === undefined) {
    BuildJobHold.endJob(hold, job, { outcome: 'failed', cause: BUILD_JOB_CAUSES.noReport });
    return;
  }
  CrossingStages.writeStageStatement(hold.context.workspace.trackerDirectory, job.id, { stage: 'package-refused', refusedReason });
  const draft: DecisionDraft = {
    kind: PACKAGE_REFUSED_DECISION, ticketIds: job.ticketIds, jobId: null, subject: { packageEntity: job.entity }
  };
  hold.logged.push(...board.openDecision({
    ...draft, askedBy: 'hephaestus', requestId: null, questions: hold.context.decisionWordingOf(draft).questions, context: refusedReason
  }, at).logged);
  BuildJobHold.endJob(hold, job, { outcome: 'refused' });
}

/** The sealed package an adapt build's return names: the one it names, or the only one sealed; `null` when it names none of them. */
function returnedPackageOf(sealedPackages: readonly EntityKey[], namedPackage: unknown): EntityKey | null {
  if (typeof namedPackage === 'string' && namedPackage !== '') return sealedPackages.includes(namedPackage) ? namedPackage : null;
  const [onlySealedPackage, ...otherSealedPackages] = sealedPackages;
  return otherSealedPackages.length === 0 ? onlySealedPackage ?? null : null;
}

/**
 * An adapt build that needs the package to give more ends `package-return` (E41, E42): its own commits must stay in its homes and `reach`,
 * so it holds no change of the package, and its reason waits in its job folder for the returned package build. The Board lifts the seal,
 * counts the return and moves the ticket to the package build; a second return opens `second-return` and keeps the stage (E45). A report
 * from any other stage, or one that names no sealed package, fails as a report without one.
 */
function endJobOnItsPackageReturn(hold: HoldContext, job: Readonly<Job>, subject: CustomsSubject, report: unknown): void {
  const { board, at } = hold.change;
  const ticketId = WorktreeJobs.ticketIdOf(job);
  const returnedPackage = returnedPackageOf(CrossingStages.sealedPackagesOf(board, ticketId), BuildReport.reportFieldOf(report, 'packageReturnEntity'));
  if (TicketStageUtil.stageOfJob(job)?.name !== 'adapt' || returnedPackage === null) {
    BuildJobHold.endJob(hold, job, { outcome: 'failed', cause: BUILD_JOB_CAUSES.noReport });
    return;
  }
  const scopeVerdict = CUSTOMS_CHECKS[SCOPE_CHECK](subject);
  if (scopeVerdict.verdict === 'refused') {
    routeCustomsRefusal(hold, job, { ...scopeVerdict, check: SCOPE_CHECK });
    return;
  }
  const packageReturnReason = String(BuildReport.reportFieldOf(report, 'packageReturnReason') ?? '');
  CrossingStages.writeStageStatement(hold.context.workspace.trackerDirectory, job.id, { stage: 'adapt', returnedPackage, packageReturnReason });
  BuildJobHold.endJob(hold, job, { outcome: 'package-return' });
  hold.logged.push(...board.returnTicketToThePackage(ticketId, returnedPackage, hold.context.decisionWordingOf, at).logged);
}

/**
 * A session sent back once to take its change out of another entity still changed nothing in its own: all the work of the ticket belongs
 * to another entity (E15). User moves the ticket to an entity that owns the paths, or abandons it, and the decision holds it.
 */
function openWorkInOtherEntityDecision(hold: HoldContext, job: Readonly<Job>, pathsOutside: readonly string[]): void {
  const { board, at } = hold.change;
  const entities = board.pipeline()?.entities ?? {};
  const repositoryPaths = pathsOutside.map((gitPath) => (gitPath.startsWith(REPOSITORY_ROOT_FOLDER) ? gitPath : `${REPOSITORY_ROOT_FOLDER}${gitPath}`));
  const owningEntities = [...EntityOwnershipUtil.pathsByOwnerOf(entities, repositoryPaths).keys()].filter((entityKey) => entityKey !== job.entity);
  const draft: DecisionDraft = {
    kind: WORK_IN_OTHER_ENTITY_DECISION, ticketIds: job.ticketIds, jobId: null, subject: { owningEntities, paths: pathsOutside }
  };
  if (board.decisions().some((decision) => decision.kind === draft.kind && decision.ticketIds.some((ticketId) => job.ticketIds.includes(ticketId)))) return;
  hold.logged.push(...board.openDecision({
    ...draft, askedBy: 'hephaestus', requestId: null, questions: hold.context.decisionWordingOf(draft).questions, context: pathsOutside.join(' ')
  }, at).logged);
}

/** The other jobs' branches, which their own sessions move, and the refs Hephaestus's own landings and refreshes move or remove. */
function refMovesAllowedFor(context: JobLaunchContext, board: Board, job: Readonly<Job>): RefMovesAllowed {
  const worktreesRoot = WorktreesFolder.worktreesRootOf(context.workspace.rootDirectory);
  const tickets       = board.tickets();
  return refMovesAllowedOf(board.logRecordsSoFar(), {
    ownJobId:              job.id,
    ownBranch:             WorktreeJobs.branchOf(context, job),
    otherJobBranches:      board.jobs().filter((other) => other.id !== job.id && WorktreeJobs.isWorktreeJob(other)).map((other) => WorktreeJobs.branchOf(context, other)),
    ticketBranchOf:        context.branchNames.ticketBranchOf,
    releasedGroupBranchOf: (ticketId) => {
      const frontmatter = tickets.find((candidate) => candidate.frontmatter.id === ticketId)?.frontmatter;
      return frontmatter?.releasesGroup === true && frontmatter.group !== undefined ? `${context.branchNames.groupTargetPrefix}${frontmatter.group}` : null;
    },
    refreshWorktreeOf:            (groupBranch) => GroupWorktrees.refreshWorktreeOf(worktreesRoot, groupBranch),
    constitutionCommitWorktreeOf: (jobId) => ConstitutionCommits.commitWorktreeOf(worktreesRoot, jobId),
    snapshotFolders:              PipelineAgentSessions.readerSnapshotFoldersOf(worktreesRoot),
  }, sharedRepositoryRefsOf(context.sharedRepository?.files ?? null, watchedRefsOf(context.branchNames, context.mainLine, worktreesRoot)));
}

/** The Customs checks a resumed session can put right in its own worktree: a dirty worktree, no commit, missing or stale gate claims. */
const RESUMABLE_CUSTOMS_CHECKS: readonly VerificationCheck[] = ['V3', 'V4', 'V15'];

/** V17, the scope check: a job of an entity is resumed to take a change outside its stage's folders back out (E11). */
const SCOPE_CHECK: VerificationCheck = 'V17';

/** A job without an entity, on a folder tracker too, keeps the checks it always had: there V17 fails the job. */
function resumableCustomsChecksOf(job: Readonly<Pick<Job, 'entity'>>): readonly VerificationCheck[] {
  return job.entity === undefined ? RESUMABLE_CUSTOMS_CHECKS : [...RESUMABLE_CUSTOMS_CHECKS, SCOPE_CHECK];
}

/** A refused scope check names the paths to take back out after its reason; every other check's output stays its reason. */
function customsOutputOf(verdict: Readonly<Extract<CustomsVerdict, { verdict: 'refused' }>>): string {
  return verdict.check === SCOPE_CHECK ? [verdict.reason, ...verdict.facts].join('\n') : verdict.reason;
}

export const BuildJobCustoms = Object.freeze({ verifyAndRoute, });
