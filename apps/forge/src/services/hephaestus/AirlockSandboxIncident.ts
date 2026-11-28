/**
 * An Airlock agent whose worktree's denied root cannot be made does not launch, and the Airlock waits on it. The `sandbox-unavailable` incident
 * tells the Assistant so; the launch is tried again each pass, and opens no second incident while the first stands. The launch that succeeds closes it.
 */
import type { Incident }                    from '../../domain/tracker-model/@types/Incident.ts';
import type { LogRecord }                   from '../../domain/tracker-model/@types/LogRecord.ts';
import type { Board }                       from '../../domain/tracker-model/Board.ts';
import type { LineRefusal }                 from '../../shared/@types/LineRefusal.ts';
import { StepProblemFactsUtil }             from '../../shared/utils/StepProblemFactsUtil.ts';
import { type FolderMaker, WorkerProfiles } from './WorkerProfiles.ts';

/** The `step` a refused Airlock agent launch names in its incident. */
const AIRLOCK_AGENT_LAUNCH_STEP = 'airlock-agent';

/** An Airlock agent whose launch was refused: a denied root could not be made, or forge's confinement refused its session. */
export interface UnmadeAirlockAgentRoot {
  jobId:   string;
  refusal: LineRefusal;
}

function unmadeRootOf(
  jobId: string,
  facts: Parameters<typeof WorkerProfiles.unmadeDeniedRootOf>[0],
  folderMaker?: FolderMaker,
): UnmadeAirlockAgentRoot | null {
  const deniedRoot = WorkerProfiles.unmadeDeniedRootOf(facts, folderMaker);
  return deniedRoot === null ? null : { jobId, refusal: { code: 'denied-root-unmade', deniedRoot } };
}

/** Opens the incident unless one stands open for the job, or the job has left the board; answers what it logged. */
function openOnce(board: Board, unmadeRoot: UnmadeAirlockAgentRoot, at: string): readonly LogRecord[] {
  const job = board.jobById(unmadeRoot.jobId);
  if (job === undefined) return [];
  const alreadyOpen = board.incidents().some((incident) => incident.kind === 'sandbox-unavailable' && incident.jobId === job.id);
  if (alreadyOpen) return [];
  return board.openIncident({
    kind:        'sandbox-unavailable',
    ticketIds:   job.ticketIds,
    jobId:       job.id,
    facts:       { step: AIRLOCK_AGENT_LAUNCH_STEP, ...StepProblemFactsUtil.factsOf(unmadeRoot.refusal) },
    defaultMove: 'gate-retry',
  }, at).logged;
}

function openLaunchIncidentsOf(board: Board, jobId: string): readonly Readonly<Incident>[] {
  return board.incidents().filter((incident) => incident.kind === 'sandbox-unavailable' && incident.jobId === jobId && incident.facts['step'] === AIRLOCK_AGENT_LAUNCH_STEP);
}

/** True when the job holds an open launch incident, which its launch closes; a pass asks this before it takes the tracker lock. */
function standsOpenFor(board: Board, jobId: string): boolean {
  return openLaunchIncidentsOf(board, jobId).length > 0;
}

/** The Airlock agent launched, so its launch incident is no longer true: Hephaestus closes it with the move its default takes. */
function closeOnLaunch(board: Board, jobId: string, at: string): readonly LogRecord[] {
  return openLaunchIncidentsOf(board, jobId).flatMap((incident) => board.handleIncident(incident.id, incident.defaultMove, at).logged);
}

export const AirlockSandboxIncident = Object.freeze({
  unmadeRootOf, openOnce, standsOpenFor, closeOnLaunch
});
