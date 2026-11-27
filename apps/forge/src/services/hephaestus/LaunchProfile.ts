import { join } from 'node:path';

import type { Job }              from '../../domain/tracker-model/@types/Job.ts';
import type { Board }            from '../../domain/tracker-model/Board.ts';
import type { WorkerProfile }    from '../../lib/agent-launch/WorkerProfile.ts';
import { projectLocationOf }     from '../tracker/ProjectLocation.ts';
import { type JobLaunchContext } from './@types/JobLaunchContext.ts';
import { CrossingStages }        from './CrossingStages.ts';
import { DocumentAgentSessions } from './DocumentAgentSessions.ts';
import { EffectReadings }        from './EffectReadings.ts';
import { GpgDirectories }        from './GpgDirectories.ts';
import { IntakeSessions }        from './IntakeSessions.ts';
import { JobSandbox }            from './JobSandbox.ts';
import { PipelineAgentSessions } from './PipelineAgentSessions.ts';
import type { SessionPlace }     from './SessionPlace.ts';
import { WorkerProfiles }        from './WorkerProfiles.ts';
import { WorktreeJobs }          from './WorktreeJobs.ts';

const ROLES_THAT_MAY_ASK: ReadonlySet<string> = new Set(['builder', 'reviewer', 're-reviewer', 'conflict-re-reviewer', 'product-owner']);

function profileOf(context: JobLaunchContext, job: Readonly<Job>, place: SessionPlace, hatchDirectory: string): WorkerProfile {
  const {
    workspace, monitorFolder, agentAdapter, homeDirectory
  } = context;
  const location = projectLocationOf(workspace.rootDirectory);
  const nestedCheckoutFacts = { repositoryRoot: location.repositoryRoot, worktree: place.checkout, projectPrefix: location.projectPrefix };
  const sessionDenyFacts = {
    dataFolder:       workspace.trackerDirectory,
    monitorFolder,
    credentialPaths:  agentAdapter.credentialPathsOf(homeDirectory),
    gpgHomeDirectory: GpgDirectories.homeDirectoryOf(GpgDirectories.read(homeDirectory), homeDirectory),
    sandboxDenyShape: agentAdapter.sandboxDenyShape,
  };
  return {
    writableRoots:          [place.checkout],
    deniedWritableRoots:    [workspace.trackerDirectory],
    deniedReadableRoots:    WorkerProfiles.sessionDeniedReadableRootsOf(sessionDenyFacts),
    shellNetworkDomains:    [],
    webNetworkDomains:      'none',
    extraWritableDirectory: hatchDirectory,
    allowedCommandPrefixes: [],
    deniedCommandPrefixes:  [],
    askUser:                job.role !== null && ROLES_THAT_MAY_ASK.has(job.role),
    skills:                 false,
    subagents:              [],
    attribution:            'none',
    instructionsRoot:       location.repositoryRoot,
    ...place.holdsRepository ? WorkerProfiles.nestedCheckoutProfileOf(nestedCheckoutFacts) : {},
    gitHooksDirectory:      join(location.repositoryRoot, '.githooks'),
    commitSigning:          { kind: 'unsigned' },
    networkDomainGuard:     null,
  };
}

/**
 * A builder or reviewer runs confined by the per-job profile of design section 4.4, in the Airlock's worktree too when it is resumed there;
 * a product owner and a pipeline agent get their own profile, and every other role the session profile.
 */
function launchProfileOf(jobLaunchContext: JobLaunchContext, board: Board, job: Readonly<Job>, place: SessionPlace, hatchDirectory: string): WorkerProfile {
  if (IntakeSessions.isIntakeJob(job)) return IntakeSessions.productOwnerProfileOf(profileOf(jobLaunchContext, job, place, hatchDirectory));
  if (PipelineAgentSessions.isPipelineAgentJob(job)) {
    return PipelineAgentSessions.pipelineAgentProfileOf(profileOf(jobLaunchContext, job, place, hatchDirectory), hatchDirectory);
  }
  if (DocumentAgentSessions.isDocumentAgentJob(job)) {
    return DocumentAgentSessions.documentAgentProfileOf(profileOf(jobLaunchContext, job, place, hatchDirectory), hatchDirectory);
  }
  if (job.kind === 'effect-reading') {
    const { repositoryRoot } = projectLocationOf(jobLaunchContext.workspace.rootDirectory);
    const sessionProfile = profileOf(jobLaunchContext, job, place, hatchDirectory);
    return EffectReadings.effectReaderProfileOf(sessionProfile, repositoryRoot, jobLaunchContext.workspace.trackerDirectory, place.workingDirectory);
  }
  const isAirlockAgent = job.kind === 'merge-agent';
  if (!isAirlockAgent && !WorktreeJobs.isWorktreeJob(job)) return profileOf(jobLaunchContext, job, place, hatchDirectory);
  const ticket = board.tickets().find((candidate) => candidate.frontmatter.id === job.ticketIds[0]);
  const pipeline = board.pipeline();
  const toolchain = WorkerProfiles.workerToolchainOf(pipeline, ticket?.frontmatter.network ?? [], jobLaunchContext.platformPorts.shellLine, job.entity);
  const refusedPackages = pipeline?.entities === undefined ? [] : CrossingStages.refusedPackagesOf(board.logRecordsSoFar(), job.ticketIds[0] ?? '');
  const sandboxFacts = JobSandbox.sandboxFactsFor(jobLaunchContext, job, pipeline, isAirlockAgent ? place.checkout : undefined, refusedPackages);
  const profile = WorkerProfiles.profileOf(WorkerProfiles.workerRoleOf(job.role), sandboxFacts, toolchain);
  // In the Airlock the agent cannot ask User: the slot stays held while it works.
  return isAirlockAgent ? { ...profile, askUser: false } : profile;
}

export const LaunchProfile = Object.freeze({ launchProfileOf });
