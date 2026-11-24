/**
 * The state of a setup agent's session as every setup view reads it, and the one place a refused launch enters it: stopped while no job of
 * the session is on the board, not launched while forge refused that job's launch for the agent's program (a Running it never reached),
 * stopping, else running.
 */
import type { BoardJobDocument }           from '../../../../@types/board/BoardJobDocuments.ts';
import type { BoardPipelineSetupDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import type { BoardJobState }              from '../../../../@types/board/BoardVocabulary.ts';
import { JobStateUtil }                    from '../../../utils/JobStateUtil.ts';
import type { PanelStatus }                from '../PipelinePanel.tsx';

export type AgentSessionState = 'running' | 'stopping' | 'not-launched' | 'stopped';

/** Every setup step's panel head and pill for a session forge did not start, in the failure colour. */
export const NOT_LAUNCHED_PANEL_STATUS: PanelStatus = Object.freeze({ tone: 'failed', text: 'Not launched' });

/** What a session reads of the board's jobs: whether its job's launch stands refused. */
export type SessionJob = Pick<BoardJobDocument, 'id' | 'notLaunched'>;

function sessionStateOf(agentJobId: string | null, agentJobState: BoardJobState | null, jobs: readonly SessionJob[]): AgentSessionState {
  const job = agentJobId === null ? undefined : jobs.find((candidate) => candidate.id === agentJobId);
  if (job !== undefined && JobStateUtil.launchIsRefused(job)) return 'not-launched';
  if (agentJobState === null) return 'stopped';
  return agentJobState === 'stopping' ? 'stopping' : 'running';
}

/** The session of the setup record's own agent: the forge's, or an entity's in a setup narrowed to that entity. */
function setupSessionStateOf(setup: Pick<BoardPipelineSetupDocument, 'record' | 'agentJobState'>, jobs: readonly SessionJob[]): AgentSessionState {
  return sessionStateOf(setup.record.agentJobId, setup.agentJobState, jobs);
}

export const AgentSessionModel = Object.freeze({ sessionStateOf, setupSessionStateOf });
