/**
 * What confines a worktree job: the sandbox facts of its session and lines, a line's process sandbox and environment, and the refusal kept
 * when one cannot be made.
 */
import { mkdirSync }                                                     from 'node:fs';
import { join }                                                          from 'node:path';
import type { UnstartableGuardReason }                                   from '../../adapters/@types/HephaestusLogRecord.ts';
import { type SandboxRefusal, SandboxRefusalIngestion }                  from '../../adapters/sandbox-refusal/SandboxRefusalIngestion.ts';
import { createSandboxRefusalWriter }                                    from '../../adapters/sandbox-refusal/SandboxRefusalWriter.ts';
import type { Job }                                                      from '../../domain/tracker-model/@types/Job.ts';
import type { EntityKey, Pipeline }                                      from '../../domain/tracker-model/@types/Pipeline.ts';
import { GitProcess }                                                    from '../../lib/git/GitProcess.ts';
import { GitWorktrees }                                                  from '../../lib/git/GitWorktrees.ts';
import { PORTABLE_GIT_SETTINGS }                                         from '../../lib/git/constants/GitConventions.ts';
import { GitArgumentsUtil }                                              from '../../lib/git/utils/GitArgumentsUtil.ts';
import type { RefusedStep }                                              from '../../shared/@types/LineRefusal.ts';
import { AgentTools, type ToolNamingSteps }                              from '../control/AgentTools.ts';
import { type GateConfinement, GateRun }                                 from '../lifecycle/GateRun.ts';
import type { GateEnvironmentContext, JobLaunchContext, SandboxContext } from './@types/JobLaunchContext.ts';
import { CrossingStages }                                                from './CrossingStages.ts';
import { GuardCommand }                                                  from './GuardCommand.ts';
import { HatchInbox }                                                    from './HatchInbox.ts';
import type { ProcessSandboxRequest }                                    from './LineSandbox.ts';
import { StoredFileUnreadable }                                          from './StoredFileUnreadable.ts';
import { type SandboxFacts, type SandboxFactsRequest, WorkerProfiles }   from './WorkerProfiles.ts';
import { JOB_FILES, WorktreeJobs }                                       from './WorktreeJobs.ts';

/**
 * `worktree` is the ticket's own unless named, as an Airlock agent names the Airlock worktree it works in. On a forge with entities the facts
 * also name every entity home, whose configuration folder is denied, and the job's entity with the homes its stage 1 may write a proposal in, a package
 * of `refusedPackages` left out.
 */
function sandboxFactsFor(
  context: JobLaunchContext,
  job: Readonly<Job>,
  pipeline: Readonly<Pipeline> | null,
  worktree: string = WorktreeJobs.worktreeOf(context.workspace, job),
  refusedPackages: readonly EntityKey[] = []
): SandboxFacts {
  const { workspace } = context;
  const { repositoryRoot, projectPrefix } = WorktreeJobs.projectLocationOfContext(context);
  const facts = WorkerProfiles.sandboxFactsOf({
    repositoryRoot,
    projectPrefix,
    dataFolder:                    workspace.trackerDirectory,
    monitorFolder:                 context.monitorFolder,
    homeDirectory:                 context.homeDirectory,
    worktree,
    ownBranch:                     WorktreeJobs.branchOf(context, job),
    mainLine:                      context.mainLine,
    branchNames:                   context.branchNames,
    hatchDirectory:                HatchInbox.hatchDirectoryOf(workspace.rootDirectory, job.id),
    sandboxDenyShape:              context.agentAdapter.sandboxDenyShape,
    credentialPaths:               context.agentAdapter.credentialPathsOf(context.homeDirectory),
    agentConfigurationFolderNames: context.agentAdapter.configurationNames.folderNames,
    guardCommand:                  guardCommandOf(context),
    ...cacheFolderFactsOf(context),
  });
  return { ...facts, ...WorkerProfiles.entityFactsOf(pipeline, job.entity, CrossingStages.proposalHomesOf(pipeline, job, refusedPackages)) };
}

function guardCommandOf(context: Pick<JobLaunchContext, 'programCommand' | 'workspace'>): readonly string[] | null {
  const verdict = GuardCommand.guardCommandOf(context.programCommand, context.workspace.rootDirectory);
  return verdict.verdict === 'found' ? verdict.command : null;
}

/** The guards a Hephaestus renders into a job's settings: the network guard and, for a job of an entity, the stage edit guard. */
type ToolCallGuardKind = 'network' | 'stage-edits';

/** Called for a launch whose guard renders no hook, so the owner reads why the calls it would check are denied. */
function logUnstartableGuard(
  context: Pick<JobLaunchContext, 'programCommand' | 'workspace' | 'log'>, job: Readonly<Job>, guardKind: ToolCallGuardKind = 'network'
): void {
  const repositoryRoot = context.workspace.rootDirectory;
  const verdict = GuardCommand.guardCommandOf(context.programCommand, repositoryRoot);
  const reason: UnstartableGuardReason = verdict.verdict === 'refused'
    ? {
      kind: 'command-refused', part: verdict.part, cause: verdict.cause, path: verdict.path, repositoryRoot
    }
    : { kind: 'not-an-absolute-runtime-path' };
  context.log({
    kind: 'guard-cannot-start', jobId: job.id, ticketId: WorktreeJobs.ticketIdOf(job), guard: guardKind, reason
  });
}

/** What a worker's stored `writes` are judged by at launch: Hephaestus's `PATH` and the host's path rules. */
function cacheFolderFactsOf(context: SandboxContext): Pick<SandboxFactsRequest, 'executableSearchPath' | 'cacheFolderStyle'> {
  const { dataFolders, launchEnvironment } = context.platformPorts;
  return { executableSearchPath: launchEnvironment.searchFoldersOf(context.inheritedEnvironment), cacheFolderStyle: dataFolders };
}

/** The portable git settings ride along, so a gate's own git reaches a long path as Hephaestus's does. */
function inheritedGateEnvironmentOf(context: SandboxContext): Record<string, string> {
  return context.platformPorts.launchEnvironment.launchEnvironmentOf(context.inheritedEnvironment, GitArgumentsUtil.environmentOf(PORTABLE_GIT_SETTINGS));
}

/**
 * A gate, a prepare step or a gate's fix searches what an agent of the forge searches: the folders of the tools `steps` name and approve,
 * then the system's, nothing else of Hephaestus's own search path.
 */
function gateEnvironmentOf(context: GateEnvironmentContext, steps: Readonly<ToolNamingSteps> | null, reportFile?: string): Record<string, string> {
  const launch = AgentTools.forgeLaunchToolsOf(steps, {
    platformPorts: context.platformPorts, homeDirectory: context.homeDirectory, monitorFolder: context.monitorFolder, rootDirectory: context.workspace.rootDirectory
  });
  const { launchEnvironment } = context.platformPorts;
  return GateRun.gateEnvironmentOf(launchEnvironment.withSearchFolders(inheritedGateEnvironmentOf(context), AgentTools.toolFoldersOf(launch.tools)), reportFile);
}

function processSandboxRequestOf(context: SandboxContext, facts: SandboxFacts, confinement: GateConfinement): ProcessSandboxRequest {
  const adminFolder = GitProcess.run(facts.worktree, ['rev-parse', '--absolute-git-dir'], 'hooks-off', undefined, GitWorktrees.ceilingOf(facts.worktree));
  return {
    worktree:             facts.worktree,
    worktreeAdminFolder:  GitProcess.succeeded(adminFolder) ? adminFolder.standardOutput.trim() : null,
    homeDirectory:        context.homeDirectory,
    temporaryDirectory:   context.platformPorts.dataFolders.temporaryFolderOf(inheritedGateEnvironmentOf(context)),
    cachePaths:           confinement.writes,
    executableSearchPath: facts.executableSearchPath,
    cacheFolderStyle:     facts.cacheFolderStyle,
    deniedWritableRoots:  WorkerProfiles.deniedWritableRootsOf(facts),
    deniedReadableRoots:  WorkerProfiles.deniedReadableRootsOf(facts),
    network:              confinement.network,
  };
}

/** Kept in the job folder for the next pass's hold, which opens the incident; the refused line never started. */
function recordSandboxRefusal(context: JobLaunchContext, job: Readonly<Job>, refused: RefusedStep): void {
  const jobFolder = WorktreeJobs.jobFolderOf(context.workspace, job);
  mkdirSync(jobFolder, { recursive: true });
  createSandboxRefusalWriter(join(jobFolder, JOB_FILES.sandboxRefusal)).write(refused);
  context.log({
    kind: 'line-refused', jobId: job.id, ticketId: WorktreeJobs.ticketIdOf(job), step: refused.step, lineRefusal: refused.refusal
  });
}

/**
 * Makes the denied roots a launch in the job's worktree needs, every entity home's configuration folder among them when `entityHomes` names them; when
 * one cannot be made, records the refusal and answers true, so `step` never starts.
 */
function deniedRootRefusalRecorded(context: JobLaunchContext, job: Readonly<Job>, step: string, entityFacts: Pick<SandboxFacts, 'entityHomes'> = {}): boolean {
  const { projectPrefix } = WorktreeJobs.projectLocationOfContext(context);
  const deniedRoot = WorkerProfiles.unmadeDeniedRootOf({
    worktree:                      WorktreeJobs.worktreeOf(context.workspace, job),
    sandboxDenyShape:              context.agentAdapter.sandboxDenyShape,
    agentConfigurationFolderNames: context.agentAdapter.configurationNames.folderNames,
    projectPrefix,
    ...entityFacts,
  });
  if (deniedRoot === null) return false;
  recordSandboxRefusal(context, job, { step, refusal: { code: 'denied-root-unmade', deniedRoot } });
  return true;
}

/** A refusal kept that cannot be read is still a refused line: the job takes no step until a move on the file's incident. */
function sandboxRefusalOf(context: JobLaunchContext, job: Readonly<Job>): SandboxRefusal | StoredFileUnreadable | null {
  const refusalFilePath = join(WorktreeJobs.jobFolderOf(context.workspace, job), JOB_FILES.sandboxRefusal);
  const reading = new SandboxRefusalIngestion(refusalFilePath).read();
  if (reading.verdict === 'readable') return reading.refusal;
  const { trackerDirectory } = context.workspace;
  return reading.verdict === 'absent' ? null : StoredFileUnreadable.unreadableFileOf(trackerDirectory, refusalFilePath, reading.problem);
}

export const JobSandbox = Object.freeze({
  sandboxFactsFor,
  logUnstartableGuard,
  cacheFolderFactsOf,
  gateEnvironmentOf,
  processSandboxRequestOf,
  recordSandboxRefusal,
  deniedRootRefusalRecorded,
  sandboxRefusalOf,
});
