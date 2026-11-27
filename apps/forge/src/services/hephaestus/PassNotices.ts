import type { Board }                       from '../../domain/tracker-model/Board.ts';
import type { AgentProgramRefused }         from './@types/AgentLaunchRefusal.ts';
import type { DeclinedCleanup, HeldTarget } from './@types/Airlocks.ts';
import type { DrivePassRequest }            from './@types/DrivePassRequest.ts';
import type { HephaestusNotice }            from './@types/HephaestusStateDocument.ts';
import type { DefaultedIncident }           from './IncidentRouter.ts';

/** One notice for each job that stands not launched, read from its stored fact so it outlasts a restart, this pass's refusals included. */
function agentProgramNoticesOf(request: DrivePassRequest, board: Board, refusedThisPass: readonly AgentProgramRefused[]): HephaestusNotice[] {
  const standing = board.jobs().flatMap((job) => (job.notLaunched === undefined ? [] : [{ notLaunchedJobId: job.id, notLaunched: job.notLaunched }]));
  const refusals = [...standing, ...refusedThisPass.filter((refused) => !standing.some((stood) => stood.notLaunchedJobId === refused.notLaunchedJobId))];
  return refusals.map(({ notLaunchedJobId, notLaunched }) => ({
    kind:        'agent-program-refused',
    jobId:       notLaunchedJobId,
    cause:       notLaunched.cause,
    agentName:   request.agentAdapter.displayName,
    programPath: notLaunched.programPath,
    repair:      notLaunched.cause === 'batch-target' ? request.agentAdapter.programRepairOf('batch-target') : null,
  }));
}

function noticesOf(
  request: DrivePassRequest,
  installVersionChanged: boolean,
  attributionTicketIds: readonly string[],
  nonConvergingTicketIds: readonly string[],
  heldTargets: readonly HeldTarget[],
  declinedCleanups: readonly DeclinedCleanup[],
  defaultedIncidents: readonly DefaultedIncident[],
  launchRefusals: readonly HephaestusNotice[],
): HephaestusNotice[] {
  return [
    ...heldTargets.map((held): HephaestusNotice => (held.heldFiles.length > 0
      ? { kind: 'target-file-held', target: held.target, heldFiles: held.heldFiles }
      : {
        kind: 'dirty-main-checkout', target: held.target, branch: held.branch, blockingFiles: held.blockingFiles
      })),
    ...declinedCleanups.map(({ cleanup, groupBranch, problem }) => ({
      kind: 'cleanup-declined', cleanup, groupBranch, problem
    }) as const),
    ...(installVersionChanged ? [{ kind: 'install-version-changed' } as const] : []),
    ...(request.newCodeOnDisk?.() === true ? [{ kind: 'new-code' } as const] : []),
    ...attributionTicketIds.map((ticketId) => ({ kind: 'attribution-found', ticketId }) as const),
    ...nonConvergingTicketIds.map((ticketId) => ({ kind: 'rounds-not-converging', ticketId }) as const),
    ...defaultedIncidents.map(({ incidentId, move, cause }) => ({
      kind: 'incident-defaulted', incidentId, move, cause
    }) as const),
    ...launchRefusals,
  ];
}

export const PassNotices = Object.freeze({
  agentProgramNoticesOf,
  noticesOf,
});
