import { MachineConfigFile }                          from '../../adapters/machine-config/MachineConfigFile.ts';
import type { Job }                                   from '../../domain/tracker-model/@types/Job.ts';
import type { Board }                                 from '../../domain/tracker-model/Board.ts';
import { AgentBillingUtil }                           from '../../lib/agent-launch/utils/AgentBillingUtil.ts';
import { type AgentProgramResolution, AgentPrograms } from '../control/AgentPrograms.ts';
import { projectLocationOf }                          from '../tracker/ProjectLocation.ts';
import { registeredRepositoryRootsIn }                from '../tracker/RegisteredRepositoryRoots.ts';
import type { DrivePassRequest }                      from './@types/DrivePassRequest.ts';
import { PipelineAgentSessions }                      from './PipelineAgentSessions.ts';

/** The forge's agent read through this machine's config, kept as the choice names it and checked where it lies. */
export function agentProgramResolutionOf(request: DrivePassRequest, board: Board, job: Readonly<Job>): AgentProgramResolution {
  const resolution = chosenProgramResolutionOf(request, board, job);
  return resolution.verdict === 'found' ? billedResolutionOf(request, board, job, resolution.programPath) : resolution;
}

function chosenProgramResolutionOf(request: DrivePassRequest, board: Board, job: Readonly<Job>): AgentProgramResolution {
  if (request.agentProgramOf !== undefined) return request.agentProgramOf(board, job);
  const agent = PipelineAgentSessions.launchAgentOf(board, job);
  if (agent === null && request.agentProgramWhenNoneIsChosen !== undefined) return { verdict: 'found', programPath: request.agentProgramWhenNoneIsChosen };
  // An agent program anywhere in the repository is code a job could have written, whichever project the tracker is.
  const ownRepositoryRoot = projectLocationOf(request.workspace.rootDirectory).repositoryRoot;
  return AgentPrograms.resolutionOf({
    agent,
    adapterVendor:      request.agentAdapter.vendor,
    machineProgramPath: agent === null ? null : MachineConfigFile.programPathOf(MachineConfigFile.read(request.monitorFolder), agent.vendor),
    resolver:           request.platformPorts.executableResolver,
    forbiddenRoots:     AgentPrograms.forbiddenRootsOf(agent, ownRepositoryRoot, registeredRepositoryRootsIn(request.monitorFolder)),
  });
}

/** A program found launches nothing under a billing its vendor does not bill by: that stands as the job's not-launched fact, tried each sweep. */
function billedResolutionOf(request: DrivePassRequest, board: Board, job: Readonly<Job>, programPath: string): AgentProgramResolution {
  const billing = PipelineAgentSessions.launchBillingOf(board, job);
  if (billing.verdict === 'not-chosen') return { verdict: 'found', programPath };
  const readiness = AgentBillingUtil.launchReadinessOf(request.agentAdapter.billingOptions, billing.billing, () => true);
  if (readiness.verdict === 'not-offered') return { verdict: 'not-launched', notLaunched: { cause: 'billing-not-offered', programPath } };
  return { verdict: 'found', programPath };
}

/** The jobs standing not launched whose program now reads otherwise than at the refusal: it resolves, or names another path or cause. */
export function notLaunchedJobIdsWhoseProgramChanged(request: DrivePassRequest, board: Board): string[] {
  return board.jobs().flatMap((job) => {
    const { notLaunched } = job;
    if (notLaunched === undefined) return [];
    const now = agentProgramResolutionOf(request, board, job);
    const unchanged = now.verdict === 'not-launched' && now.notLaunched.cause === notLaunched.cause && now.notLaunched.programPath === notLaunched.programPath;
    return unchanged ? [] : [job.id];
  });
}
