import type { Job }                                               from '../../domain/tracker-model/@types/Job.ts';
import type { PipelineGate }                                      from '../../domain/tracker-model/@types/Pipeline.ts';
import type { Board }                                             from '../../domain/tracker-model/Board.ts';
import { Playbook }                                               from '../../domain/tracker-model/Playbook.ts';
import { EntityOwnershipUtil, ROOT_ENTITY_KEY }                   from '../../domain/tracker-model/utils/EntityOwnershipUtil.ts';
import type { ShellLine }                                         from '../../lib/shell-line/ShellLine.ts';
import { LIFECYCLE_LIMITS }                                       from '../../shared/constants/LifecycleLimits.ts';
import type { UnreadableJobFileRefusal }                          from './@types/AgentLaunchRefusal.ts';
import type { DrivePassRequest }                                  from './@types/DrivePassRequest.ts';
import type { AirlockFacts, JobLaunchFacts, ReviewFindingsFacts } from './@types/JobLaunchFacts.ts';
import { AirlockFactsFile, type AirlockAgentPhase }               from './AirlockFactsFile.ts';
import { AssistantBoot }                                          from './AssistantBoot.ts';
import { CrossingStages, type CrossingStageFacts }                from './CrossingStages.ts';
import { DocumentAgentSessions }                                  from './DocumentAgentSessions.ts';
import { jobFolderIn }                                            from './HephaestusFiles.ts';
import { IntakeSessions }                                         from './IntakeSessions.ts';
import { JobPipelines }                                           from './JobPipelines.ts';
import { JobResumption }                                          from './JobResumption.ts';
import { JobTicketDocuments }                                     from './JobTicketDocuments.ts';
import { MainMergeRounds }                                        from './MainMergeRounds.ts';
import { NeedTickets }                                            from './NeedTickets.ts';
import { PipelineAgentSessions }                                  from './PipelineAgentSessions.ts';
import { RedHandoff }                                             from './RedHandoff.ts';
import { SessionConfinement }                                     from './SessionConfinement.ts';
import { SessionPlaces, type SessionPlace }                       from './SessionPlace.ts';
import { StoredFileUnreadable }                                   from './StoredFileUnreadable.ts';
import { TargetCatchUps }                                         from './TargetCatchUps.ts';

/**
 * The Airlock phase an agent is launched or resumed in, read from its merge job's slot. Under a build or review job in `merging-main`, the
 * agent is the conflict re-reviewer of the merge before User's code review.
 */
function airlockAgentPhaseOf(board: Board, job: Readonly<Job>): AirlockAgentPhase {
  const parent = board.jobs().find((candidate) => candidate.id === job.parentJobId);
  if (parent?.state === 'merging-main') return 're-reviewing';
  const phase = parent?.airlock?.phase;
  return phase === 'fixing' || phase === 're-reviewing' ? phase : 'resolving';
}

/**
 * `null` for a job that is no Airlock agent; `conflicts-unknown` when neither the kept facts nor git tell which files conflict; a file of
 * the merge job the agent is told of that cannot be read stops the launch, and its incident opens on the merge job that owns it.
 */
function airlockFactsOf(
  board: Board, trackerDirectory: string, job: Readonly<Job>, checkout: string
): AirlockFacts | null | 'conflicts-unknown' | UnreadableJobFileRefusal {
  if (job.kind !== 'merge-agent' || job.parentJobId === null) return null;
  const mergeJob       = board.jobs().find((candidate) => candidate.id === job.parentJobId);
  const resumesSession = JobResumption.sessionOwnerJobIdOf(board.logRecordsSoFar(), job) !== job.id;
  if (mergeJob?.state === 'merging-main') {
    const conflict = MainMergeRounds.mainMergeConflictOf(trackerDirectory, mergeJob);
    if (StoredFileUnreadable.isUnreadableFile(conflict)) return { unreadableJobFile: StoredFileUnreadable.unreadableJobFileOn(mergeJob.id, conflict) };
    return {
      mergePlacement:  'before-human-code-review',
      worktree:        checkout,
      branchTip:       conflict?.branchTip ?? '',
      targetTip:       conflict?.targetTip ?? '',
      phase:           're-reviewing',
      conflictedFiles: conflict?.conflictedFiles ?? [],
      redHandoff:      null,
      resumesSession,
    };
  }
  const mergeJobFolder = jobFolderIn(trackerDirectory, job.parentJobId);
  const phase          = airlockAgentPhaseOf(board, job);
  const kept           = AirlockFactsFile.keptFactsOf(mergeJobFolder, job.parentJobId);
  if (kept.verdict === 'unreadable') return { unreadableJobFile: kept.unreadableFile };
  const keptFacts      = kept.verdict === 'kept' ? kept.facts : null;
  const conflicts      = AirlockFactsFile.conflictedFilesOf(keptFacts, phase, checkout);
  if (conflicts.verdict === 'unknown') return 'conflicts-unknown';
  const leavesTheMergeOpen = phase === 'resolving' && keptFacts?.leavesTheMergeOpen === true;
  const redHandoff = RedHandoff.redHandoffFactsOf(trackerDirectory, mergeJobFolder);
  if (StoredFileUnreadable.isUnreadableFile(redHandoff)) return { unreadableJobFile: StoredFileUnreadable.unreadableJobFileOn(job.parentJobId, redHandoff) };
  return {
    mergePlacement:  'airlock',
    worktree:        checkout,
    branchTip:       mergeJob?.airlock?.branchTip ?? '',
    targetTip:       mergeJob?.airlock?.targetTip ?? '',
    phase,
    conflictedFiles: conflicts.conflictedFiles,
    redHandoff,
    resumesSession,
    ...(leavesTheMergeOpen ? { leavesTheMergeOpen } : {}),
  };
}

/**
 * What a builder whose session is carried on is told of the review that sent it back: the ticket's newest Review, or for a package build the
 * Review its package review kept in its job folder. `null` for a fresh session, and for `adapt` taking up the home builder's session
 * after the package stages, which gets the adapt message; after a home review that did not hold, `adapt` gets its findings.
 */
function reviewFindingsOf(
  board: Board, trackerDirectory: string, job: Readonly<Job>, crossingStage: CrossingStageFacts | null
): ReviewFindingsFacts | null | StoredFileUnreadable {
  if (job.kind !== 'build' || JobResumption.sessionOwnerJobIdOf(board.logRecordsSoFar(), job) === job.id) return null;
  const [ticketId] = job.ticketIds;
  if (crossingStage?.stage === 'adapt' && ticketId !== undefined && CrossingStages.followsThePackageStages(board.logRecordsSoFar(), ticketId)) return null;
  const ticketBody = board.tickets().find((ticket) => job.ticketIds.includes(ticket.frontmatter.id))?.body ?? '';
  const reviewSection = crossingStage?.stage === 'package-build' ? crossingStage.packageReviewFindings ?? '' : JobResumption.newestReviewSectionOf(ticketBody);
  const targetCatchUp = TargetCatchUps.targetCatchUpHandoverOf(trackerDirectory, board.logRecordsSoFar(), job.ticketIds[0] ?? '');
  if (StoredFileUnreadable.isUnreadableFile(targetCatchUp)) return targetCatchUp;
  return {
    reviewSection,
    resume:         Playbook.handoffCycleResumesOf(job, board.logRecordsSoFar()),
    resumesAllowed: LIFECYCLE_LIMITS.RED_HANDOFF_RESUMES_BEFORE_PARKING,
    targetCatchUp,
  };
}

/** The gates as the display line of this machine's shell grammar; `null` with no pipeline stored. */
function checksLineOf(gates: readonly Readonly<PipelineGate>[] | null, shellLine: Pick<ShellLine, 'displayLineOf'>): string | null {
  return gates === null ? null : shellLine.displayLineOf(gates.map((gate) => ({ line: gate.run, workingDirectory: gate.in ?? null })));
}

type LaunchFactsSource = Pick<DrivePassRequest, 'workspace' | 'platformPorts' | 'branchNames' | 'mainLine' | 'agentAdapter'>;

/** What a job's launch text is filled from, read off the board and the tracker's job folders; a job file it reads that cannot be read stops the launch. */
function launchFactsOf(
  board: Board, request: LaunchFactsSource, job: Readonly<Job>, launch: { instructions: string; airlock: AirlockFacts | null; place: SessionPlace }
): JobLaunchFacts | StoredFileUnreadable {
  const { trackerDirectory } = request.workspace;
  const { instructions, airlock, place } = launch;
  const pipeline = board.pipeline();
  const jobGates = pipeline === null ? null : JobPipelines.sessionGatesOf(pipeline, job);
  const gates = jobGates === null ? null : SessionPlaces.gatesFromStartOf(place, jobGates);
  const resumesSession = JobResumption.sessionOwnerJobIdOf(board.logRecordsSoFar(), job) !== job.id;
  const needsSettled = NeedTickets.needsSettledOf(board, job, { mainLine: request.mainLine, resumesSession });
  const crossingStage = CrossingStages.crossingStageFactsOf(board, trackerDirectory, job, resumesSession);
  if (StoredFileUnreadable.isUnreadableFile(crossingStage)) return crossingStage;
  const rootEntityKey = pipeline?.entities === undefined ? ROOT_ENTITY_KEY : EntityOwnershipUtil.rootEntityKeyOf(pipeline.entities);
  const pipelineAgentLaunch = { lineGrammar: request.platformPorts.shellLine.lineGrammar, rootDirectory: request.workspace.rootDirectory, agentAdapter: request.agentAdapter };
  const reviewFindings = needsSettled === null ? reviewFindingsOf(board, trackerDirectory, job, crossingStage) : null;
  if (StoredFileUnreadable.isUnreadableFile(reviewFindings)) return reviewFindings;
  const redHandoff = JobResumption.redHandoffTakenOverOf(trackerDirectory, board.logRecordsSoFar(), job);
  if (StoredFileUnreadable.isUnreadableFile(redHandoff)) return redHandoff;
  return {
    instructions: IntakeSessions.productOwnerInstructionsOf(board, job, instructions),
    confinement:  SessionConfinement.launchConfinementOf(request.agentAdapter.capabilities, request.platformPorts.gateConfinement),
    airlock,
    tickets:      board.tickets()
      .filter((ticket) => job.ticketIds.includes(ticket.frontmatter.id))
      .map((ticket) => {
        const documents = JobTicketDocuments.ticketDocumentReadingsOf(board, job, ticket.frontmatter.id);
        return {
          id:     ticket.frontmatter.id,
          title:  ticket.frontmatter.title,
          body:   ticket.body,
          branch: request.branchNames.ticketBranchOf(ticket.frontmatter.id),
          ...(documents.length === 0 ? {} : { documents }),
        };
      }),
    checksLine:             checksLineOf(gates, request.platformPorts.shellLine),
    gates,
    ...place.projectFolderFromStart === '' ? {} : { projectFolder: place.projectFolderFromStart },
    mergeApprovalIsOn:      board.mergeApprovalIsOn(),
    earlierSessionReplaced: JobResumption.earlierSessionWasReplaced(board.logRecordsSoFar(), job),
    redHandoff,
    reviewFindings,
    needsSettled,
    ...(crossingStage === null ? {} : { crossingStage }),
    ...(rootEntityKey === ROOT_ENTITY_KEY ? {} : { rootEntityKey }),
    intake:                 IntakeSessions.intakeFactsOf(board, job, request.agentAdapter),
    assistant:              AssistantBoot.assistantFactsOf(board, job),
    pipelineAgent:          PipelineAgentSessions.pipelineAgentFactsOf(board, job, pipelineAgentLaunch),
    documentAgent:          DocumentAgentSessions.documentAgentFactsOf(board, job),
  };
}

export const LaunchFacts = Object.freeze({
  airlockAgentPhaseOf,
  airlockFactsOf,
  launchFactsOf,
});
