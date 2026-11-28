/** Which jobs a pass launches a session for, and the launch of each as an agent child of the board's Talos. */
import { mkdirSync }     from 'node:fs';
import { dirname, join } from 'node:path';

import {
  ADAPT_BUILDER_REPORT_SCHEMA,
  AIRLOCK_AGENT_REPORT_SCHEMA,
  BUILDER_REPORT_SCHEMA,
  EFFECT_READING_REPORT_SCHEMA,
  PACKAGE_BUILDER_REPORT_SCHEMA,
  PACKAGE_REVIEWER_REPORT_SCHEMA,
  REVIEWER_REPORT_SCHEMA
} from '../../adapters/reports/ReportSchemas.ts';
import type { JsonSchema }                           from '../../adapters/reports/ReportValidation.ts';
import type { Job, JobKind }                         from '../../domain/tracker-model/@types/Job.ts';
import type { Board }                                from '../../domain/tracker-model/Board.ts';
import { TicketStageUtil }                           from '../../domain/tracker-model/utils/TicketStageUtil.ts';
import type { AgentLaunchRequest }                   from '../../lib/agent-launch/AgentLaunchRequest.ts';
import { AgentBillingUtil }                          from '../../lib/agent-launch/utils/AgentBillingUtil.ts';
import { GitProcess }                                from '../../lib/git/GitProcess.ts';
import type { ConfinementRefusal }                   from '../../shared/@types/ConfinementRefusal.ts';
import { JOB_ID_VARIABLE, HATCH_DIRECTORY_VARIABLE } from '../../shared/Environment.ts';
import { WorktreesFolder }                           from '../../shared/WorktreesFolder.ts';
import { AgentTools }                                from '../control/AgentTools.ts';
import { projectLocationOf }                         from '../tracker/ProjectLocation.ts';
import type {
  AgentProgramRefused,
  AirlockConflictsUnknown,
  ApiBillingKeyMissing,
  LaunchRefusal,
  SessionConfinementRefused,
  SetupBillingNotChosen,
  TalosDidNotLaunch,
  UnreadableJobFileRefusal
} from './@types/AgentLaunchRefusal.ts';
import type { DrivePassRequest }                               from './@types/DrivePassRequest.ts';
import { type JobLaunchContext }                               from './@types/JobLaunchContext.ts';
import { AirlockSandboxIncident, type UnmadeAirlockAgentRoot } from './AirlockSandboxIncident.ts';
import type { BoardChildren }                                  from './BoardChildren.ts';
import { DocumentAgentSessions }                               from './DocumentAgentSessions.ts';
import type { EffectReadings }                                 from './EffectReadings.ts';
import { HatchInbox }                                          from './HatchInbox.ts';
import { InstructionFiles }                                    from './InstructionFiles.ts';
import { JobLaunch }                                           from './JobLaunch.ts';
import { JobResumption }                                       from './JobResumption.ts';
import { JobSandbox }                                          from './JobSandbox.ts';
import { LaunchAgentPrograms }                                 from './LaunchAgentPrograms.ts';
import { LaunchFacts }                                         from './LaunchFacts.ts';
import { LaunchProfile }                                       from './LaunchProfile.ts';
import { LaunchSettings, type SessionLaunchSettings }          from './LaunchSettings.ts';
import { PipelineAgentSessions }                               from './PipelineAgentSessions.ts';
import { RedHandoff }                                          from './RedHandoff.ts';
import { SessionConfinement }                                  from './SessionConfinement.ts';
import { SessionPlaces, type SessionPlace }                    from './SessionPlace.ts';
import { StoredFileUnreadable }                                from './StoredFileUnreadable.ts';
import { UnreadableJobFileIncident, type UnreadableJobFile }   from './UnreadableJobFileIncident.ts';
import { WorkerProfiles }                                      from './WorkerProfiles.ts';
import { WorktreeJobs }                                        from './WorktreeJobs.ts';

/** The `step` a refused worker launch names in its `sandbox-unavailable` incident. */
const WORKER_LAUNCH_STEP = 'worker';

const REPORT_SCHEMA_OF_JOB_KIND: Partial<Record<JobKind, JsonSchema>> = {
  'effect-reading': EFFECT_READING_REPORT_SCHEMA,
  'build':          BUILDER_REPORT_SCHEMA,
  'review':         REVIEWER_REPORT_SCHEMA,
  'merge-agent':    AIRLOCK_AGENT_REPORT_SCHEMA,
};

/**
 * A conflict re-reviewer reports as a reviewer while it re-reviews; resumed for a red merged tree, it reports as any Airlock agent. A package
 * stage's report also states what the package exposes: the package builder states it, the package reviewer confirms it. An
 * adapt build's report may send the ticket back to a sealed package.
 */
function reportSchemaOf(board: Board, job: Readonly<Job>): JsonSchema | null {
  if (job.kind === 'merge-agent' && LaunchFacts.airlockAgentPhaseOf(board, job) === 're-reviewing') return REVIEWER_REPORT_SCHEMA;
  const stageName = TicketStageUtil.stageOfJob(job)?.name;
  if (job.kind === 'build' && stageName === 'package-build') return PACKAGE_BUILDER_REPORT_SCHEMA;
  if (job.kind === 'review' && stageName === 'package-review') return PACKAGE_REVIEWER_REPORT_SCHEMA;
  if (job.kind === 'build' && stageName === 'adapt') return ADAPT_BUILDER_REPORT_SCHEMA;
  return REPORT_SCHEMA_OF_JOB_KIND[job.kind] ?? null;
}

function repositorySignsCommits(repositoryRoot: string): boolean {
  const run = GitProcess.run(repositoryRoot, ['config', '--bool', 'commit.gpgsign']);
  return run !== null && GitProcess.succeeded(run) && run.standardOutput.trim() === 'true';
}

/**
 * A session forge's confinement refuses opens today's `sandbox-unavailable` incident: a worktree job's through its sandbox refusal, which
 * ends the job, an Airlock agent's through the Airlock's own, tried again each pass; any other job is logged and tried again each pass.
 */
function sessionConfinementRefusalOf(
  request: DrivePassRequest, jobLaunchContext: JobLaunchContext, job: Readonly<Job>, refusal: ConfinementRefusal,
): UnmadeAirlockAgentRoot | SessionConfinementRefused | null {
  if (WorktreeJobs.isWorktreeJob(job)) {
    JobSandbox.recordSandboxRefusal(jobLaunchContext, job, { step: WORKER_LAUNCH_STEP, refusal: { code: 'confinement-refused', confinementRefusal: refusal } });
    return null;
  }
  if (job.kind === 'merge-agent') return { jobId: job.id, refusal: { code: 'confinement-refused', confinementRefusal: refusal } };
  request.log({ kind: 'session-confinement-refused', jobId: job.id, confinementRefusal: refusal });
  return { sessionConfinementRefusedFor: job.id };
}

/** A pipeline or document agent works in its snapshot of the main line, any other session in its ticket's worktree or a folder of its own. */
function sessionPlaceOf(snapshotContext: Parameters<typeof PipelineAgentSessions.prepareSnapshot>[0], board: Board, job: Readonly<Job>): SessionPlace {
  const location = projectLocationOf(snapshotContext.workspace.rootDirectory);
  if (PipelineAgentSessions.isPipelineAgentJob(job)) return SessionPlaces.snapshotSessionPlaceOf(location, PipelineAgentSessions.prepareSnapshot(snapshotContext, board, job));
  if (DocumentAgentSessions.isDocumentAgentJob(job)) return SessionPlaces.snapshotSessionPlaceOf(location, DocumentAgentSessions.prepareSnapshot(snapshotContext, board, job));
  if (job.kind === 'effect-reading') return SessionPlaces.sessionFolderPlaceOf(snapshotContext.workspace, job.id);
  return SessionPlaces.ticketSessionPlaceOf(snapshotContext.workspace, location, job);
}

/** Exactly the approved tools' folders, then the program's own, then the system's: nothing else of the inherited search path. */
function agentSearchFoldersOf(request: DrivePassRequest, board: Board, job: Readonly<Job>, programPath: string): string[] {
  const launch = AgentTools.forgeLaunchToolsOf(board.pipeline(), {
    platformPorts: request.platformPorts, homeDirectory: request.homeDirectory, monitorFolder: request.monitorFolder, rootDirectory: request.workspace.rootDirectory
  });
  for (const refused of launch.refusedTools) request.log({
    kind: 'tool-left-off-search-path', toolName: refused.name, jobId: job.id, toolPath: refused.path, forbiddenRoot: refused.forbiddenRoot,
  });
  return [...AgentTools.toolFoldersOf(launch.tools), dirname(programPath)];
}

/** Logs the refused launch; a file read for the launch is the reading job's, unless its reading names the job it belongs to. */
function unreadableJobFileRefusalOf(
  request: Pick<DrivePassRequest, 'log'>, job: Readonly<Job>, unreadable: UnreadableJobFile | StoredFileUnreadable
): UnreadableJobFileRefusal {
  const unreadableJobFile = StoredFileUnreadable.isUnreadableFile(unreadable) ? StoredFileUnreadable.unreadableJobFileOn(job.id, unreadable) : unreadable;
  request.log({
    kind: 'job-file-unreadable-at-launch', jobId: job.id, file: unreadableJobFile.file, problem: unreadableJobFile.problem
  });
  return { unreadableJobFile };
}

/**
 * Refused, spawning nothing, when an instruction file the pipeline names is missing or the agent program does not resolve: the refusal is the notice.
 * An Airlock agent whose denied root cannot be made answers that root, and one whose conflicted files nothing tells answers so; nothing
 * marks its instance spawned, so the next pass tries it again. A job file the launch needs that cannot be read answers that file.
 */
async function launchAgentChild(
  request: DrivePassRequest,
  jobLaunchContext: JobLaunchContext,
  board: Board,
  trackerId: string,
  job: Readonly<Job>,
  effectReadings: EffectReadings,
): Promise<
  LaunchRefusal | AgentProgramRefused | UnmadeAirlockAgentRoot | ApiBillingKeyMissing | SetupBillingNotChosen | AirlockConflictsUnknown | TalosDidNotLaunch
  | SessionConfinementRefused | UnreadableJobFileRefusal | null
  > {
  const { workspace, agentAdapter } = request;
  const billing = PipelineAgentSessions.launchBillingOf(board, job);
  if (billing.verdict === 'not-chosen') {
    request.log({ kind: 'pipeline-agent-awaits-billing', jobId: job.id });
    return { setupBillingNotChosenFor: job.id };
  }
  const billingReadiness = AgentBillingUtil.launchReadinessOf(agentAdapter.billingOptions, billing.billing, request.agentVariableIsSet);
  if (billingReadiness.verdict === 'key-missing') return { apiBillingKeyMissingFor: job.id };
  const instructions = InstructionFiles.readingFor(workspace.rootDirectory, request.mainLine, board.pipeline(), job, board.pipelineSetup());
  if (instructions.verdict === 'instructions-missing') return { kind: 'instructions-missing', jobId: job.id, path: instructions.path };
  const location = projectLocationOf(workspace.rootDirectory);
  const program = LaunchAgentPrograms.agentProgramResolutionOf(request, board, job);
  if (program.verdict === 'not-launched') return { notLaunchedJobId: job.id, notLaunched: program.notLaunched };
  const children         = request.boardChildren;
  const jobFolder        = children.jobFolderOf(job.id);
  const hatchDirectory   = HatchInbox.hatchDirectoryOf(workspace.rootDirectory, job.id);
  mkdirSync(join(hatchDirectory, 'requests'), { recursive: true });
  request.watchHatchFolder?.(hatchDirectory);
  const snapshotContext = { workspace, worktreesRoot: WorktreesFolder.worktreesRootOf(workspace.rootDirectory), mainLine: request.mainLine };
  const place = sessionPlaceOf(snapshotContext, board, job);
  const entityHomeFacts = WorkerProfiles.entityFactsOf(board.pipeline());
  if (WorktreeJobs.isWorktreeJob(job) && JobSandbox.deniedRootRefusalRecorded(jobLaunchContext, job, WORKER_LAUNCH_STEP, entityHomeFacts)) return null;
  if (job.kind === 'merge-agent') {
    const unmadeRoot = AirlockSandboxIncident.unmadeRootOf(
      job.id,
      {
        worktree:                      place.checkout,
        sandboxDenyShape:              agentAdapter.sandboxDenyShape,
        agentConfigurationFolderNames: agentAdapter.configurationNames.folderNames,
        projectPrefix:                 location.projectPrefix,
        ...entityHomeFacts,
      },
      request.folderMaker,
    );
    if (unmadeRoot !== null) {
      request.log({ kind: 'airlock-agent-root-unmade', jobId: job.id, lineRefusal: unmadeRoot.refusal });
      return unmadeRoot;
    }
  }
  const airlock = LaunchFacts.airlockFactsOf(board, workspace.trackerDirectory, job, place.checkout);
  if (airlock !== null && airlock !== 'conflicts-unknown' && 'unreadableJobFile' in airlock) return unreadableJobFileRefusalOf(request, job, airlock.unreadableJobFile);
  if (airlock === 'conflicts-unknown') {
    request.log({ kind: 'airlock-agent-conflicts-unknown', jobId: job.id });
    return { airlockConflictsUnknownFor: job.id };
  }
  const effectReading    = effectReadings.factsOf(board, job, location.repositoryRoot, request.mainLine);
  const factsRead = LaunchFacts.launchFactsOf(board, request, job, { instructions: instructions.text, airlock, place });
  if (StoredFileUnreadable.isUnreadableFile(factsRead)) return unreadableJobFileRefusalOf(request, job, factsRead);
  const launchFacts      = { ...factsRead, effectReading };
  const text             = request.launchTextOf(job, launchFacts);
  const resumeLine       = JobResumption.resumeLineOf(workspace.trackerDirectory, board, job, request);
  if (StoredFileUnreadable.isUnreadableFile(resumeLine)) return unreadableJobFileRefusalOf(request, job, resumeLine);
  const redHandoffTakenOver = launchFacts.redHandoff ?? null;
  // A resumed instance reads the owner its first instance recorded, though the handoff it took over may read otherwise by now.
  const staleGreenSessionOwnerAnswer = redHandoffTakenOver === null && !JobResumption.isResumedInstance(job)
    ? null
    : JobResumption.staleGreenSessionOwnerOf(children, workspace.trackerDirectory, board.logRecordsSoFar(), job, agentAdapter);
  if (staleGreenSessionOwnerAnswer?.verdict === 'unreadable') return unreadableJobFileRefusalOf(request, job, staleGreenSessionOwnerAnswer.unreadableFile);
  const staleGreenSessionOwner = staleGreenSessionOwnerAnswer?.sessionOwnerJobId ?? null;
  const sessionOwnerJobId = staleGreenSessionOwner ?? JobResumption.sessionOwnerJobIdOf(board.logRecordsSoFar(), job);
  // Read before the launch writes anything, so a pair that cannot be read leaves the job as it was.
  const launchSettings    = sessionLaunchSettingsOf(workspace.trackerDirectory, board, job, sessionOwnerJobId);
  if (StoredFileUnreadable.isUnreadableFile(launchSettings)) return unreadableJobFileRefusalOf(request, job, launchSettings);
  JobResumption.recordStaleGreenSessionOwner(workspace.trackerDirectory, job, staleGreenSessionOwner);
  // A resumed stale-green session is told its red handoff as a resume of its own ladder, never its task again.
  const firstMessage     = staleGreenSessionOwner === null || redHandoffTakenOver === null ? text.firstMessage : request.redHandoffMessageOf(redHandoffTakenOver);
  const launchParts      = JobResumption.launchPartsOf(job, firstMessage, resumeLine);
  if (!launchParts.resume && redHandoffTakenOver !== null) RedHandoff.adoptRedHandoff(jobFolder, redHandoffTakenOver);
  if (WorktreeJobs.isWorktreeJob(job)) JobLaunch.recordJobStart(jobLaunchContext, board, job);
  if (!launchParts.resume) JobResumption.storeFirstMessage(jobFolder, job.childInstance, launchParts.firstMessage);
  const resumesASession   = launchParts.resume || sessionOwnerJobId !== job.id;
  const { workingDirectory } = resumesASession
    ? SessionPlaces.resumedSessionPlaceOf(place, children.jobFolderOf(sessionOwnerJobId), request.agentAdapter.capabilities)
    : place;
  const { launchEnvironment } = request.platformPorts;
  const launchRequest: AgentLaunchRequest = {
    programPath:   program.programPath,
    sessionId:     agentAdapter.sessionIdOf(trackerId, sessionOwnerJobId),
    resume:        resumesASession,
    workingDirectory,
    homeDirectory: request.homeDirectory,
    firstMessage:  launchParts.firstMessage,
    roleBrief:     text.roleBrief,
    ...launchSettings,
    environment:   launchEnvironment.withSearchFolders(
      launchEnvironment.launchEnvironmentOf(
        request.inheritedEnvironment,
        { [JOB_ID_VARIABLE]: job.id, [HATCH_DIRECTORY_VARIABLE]: hatchDirectory },
        agentAdapter.inheritedVariableNames
      ),
      agentSearchFoldersOf(request, board, job, program.programPath),
    ),
    profile:              LaunchProfile.launchProfileOf(jobLaunchContext, board, job, place, hatchDirectory),
    confinement:          launchFacts.confinement,
    launchFilesDirectory: jobFolder,
    reportSchema:         reportSchemaOf(board, job),
    ...(billing.billing === undefined ? {} : { billing: billing.billing }),
  };
  if (WorktreeJobs.isWorktreeJob(job) || job.kind === 'merge-agent') {
    const notice = WorkerProfiles.unsignedCommitNoticeOf(launchRequest.profile, repositorySignsCommits(location.repositoryRoot), job.id);
    if (notice !== null) request.log(notice);
  }
  if (launchRequest.profile.networkDomainGuard?.programPath === null) JobSandbox.logUnstartableGuard(jobLaunchContext, job);
  if (launchRequest.profile.stageEditGuard?.programPath === null) JobSandbox.logUnstartableGuard(jobLaunchContext, job, 'stage-edits');
  JobLaunch.recordInstructionsRead(jobFolder, job.childInstance, instructions.files);
  JobLaunch.recordLaunchSettings(jobFolder, launchSettings);
  const sessionLaunch = SessionConfinement.sessionLaunchOf(agentAdapter, request.platformPorts.gateConfinement, launchRequest);
  if (sessionLaunch.verdict === 'refused') return sessionConfinementRefusalOf(request, jobLaunchContext, job, sessionLaunch.refusal);
  const launched = await children.launchAgent({
    childFolder:                    jobFolder,
    instance:                       job.childInstance,
    label:                          job.id,
    workingDirectory,
    plan:                           sessionLaunch.plan,
    treeStopAtEndGraceMilliseconds: JobLaunch.treeStopAtEndOf(job).treeStopAtEndGraceMilliseconds ?? null,
  });
  const launchedChild = {
    jobId: job.id, childInstance: job.childInstance, jobKind: job.kind, ticketIds: job.ticketIds
  };
  if (launched.verdict === 'talos-unavailable' || launched.verdict === 'refused') {
    request.log({ kind: 'child-instance-not-launched', ...launchedChild, talosRefusal: launched.verdict === 'refused' ? launched.reason : null });
    return { talosDidNotLaunch: job.id };
  }
  request.log({ kind: 'child-instance-launched', ...launchedChild });
  return null;
}

/**
 * The pair a launch runs its session on, so a later pipeline edit never changes a running session: the pair the job recorded at its first
 * launch, else the one recorded by the job whose session it resumes, else resolved now.
 */
function sessionLaunchSettingsOf(
  trackerDirectory: string, board: Board, job: Readonly<Job>, sessionOwnerJobId: string
): SessionLaunchSettings | StoredFileUnreadable {
  const recordedOf = (jobId: string): SessionLaunchSettings | null | StoredFileUnreadable => JobLaunch.recordedLaunchSettingsOf(trackerDirectory, jobId);
  const recorded = recordedOf(job.id) ?? (sessionOwnerJobId === job.id ? null : recordedOf(sessionOwnerJobId));
  if (recorded !== null) return recorded;
  const lastWorkerJobId = JobResumption.lastWorkerJobIdOf(board.logRecordsSoFar(), job);
  const lastWorkers = lastWorkerJobId === null ? null : recordedOf(lastWorkerJobId);
  if (StoredFileUnreadable.isUnreadableFile(lastWorkers)) return lastWorkers;
  return LaunchSettings.launchSettingsOf(board.pipeline(), job, lastWorkers);
}

/**
 * The job's own unreadable file, or one of the merge job an Airlock agent works for, stands as an incident. Never the Assistant's: it is
 * the session that takes the move on an incident.
 */
function waitsOnAnUnreadableFileIncident(board: Board, job: Readonly<Job>): boolean {
  if (job.kind === 'assistant') return false;
  return [job.id, job.parentJobId].some((jobId) => jobId !== null && UnreadableJobFileIncident.standsOpenFor(board, jobId));
}

/**
 * A job launching, or resumed into `running`, whose current instance nobody claimed yet; spawning twice is harmless, since the claim is
 * exclusive. A build job launches its session only once its worktree is prepared, as it moves into `running`. A job that waits on an
 * unreadable file's incident is not tried again until a move on it.
 */
function jobsNeedingAChild(
  children: BoardChildren,
  board: Board,
  spawnedInstances: ReadonlySet<string>,
  heldTicketIds: readonly string[],
): readonly Readonly<Job>[] {
  return board.jobs().filter((job) => ((job.state === 'launching' && !WorktreeJobs.isWorktreeJob(job)) || job.state === 'running')
    && job.role !== null
    && job.notLaunched === undefined
    && !job.ticketIds.some((ticketId) => heldTicketIds.includes(ticketId))
    && !waitsOnAnUnreadableFileIncident(board, job)
    && !spawnedInstances.has(`${job.id}:${job.childInstance}`)
    && children.livenessOf(children.jobFolderOf(job.id), job.childInstance).verdict === 'unlaunched');
}

export const AgentChildLaunch = Object.freeze({
  repositorySignsCommits,
  launchAgentChild,
  jobsNeedingAChild,
});
