/**
 * An Airlock agent whose worktree's denied root cannot be made does not launch, and the Airlock waits on it. The `sandbox-unavailable` incident
 * tells the Assistant so; the launch is tried again each pass, and opens no second incident while the first stands.
 */
import type { LogRecord }                   from '../../lib/tracker-model/@types/LogRecord.ts';
import type { Board }                       from '../../lib/tracker-model/Board.ts';
import { type FolderMaker, WorkerProfiles } from './WorkerProfiles.ts';

/** The `step` a refused Airlock agent launch names in its incident. */
const AIRLOCK_AGENT_LAUNCH_STEP = 'airlock-agent';

export interface UnmadeAirlockAgentRoot {
  jobId:  string;
  reason: string;
}

function unmadeRootOf(
  jobId: string,
  facts: Parameters<typeof WorkerProfiles.unmadeDeniedRootRefusalOf>[0],
  folderMaker?: FolderMaker,
): UnmadeAirlockAgentRoot | null {
  const reason = WorkerProfiles.unmadeDeniedRootRefusalOf(facts, folderMaker);
  return reason === null ? null : { jobId, reason };
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
    facts:       { step: AIRLOCK_AGENT_LAUNCH_STEP, reason: unmadeRoot.reason },
    defaultMove: 'gate-retry',
  }, at).logged;
}

export const AirlockSandboxIncident = Object.freeze({ unmadeRootOf, openOnce });
