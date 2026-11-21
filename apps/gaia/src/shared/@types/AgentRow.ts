import type { BoardRoute } from './board/BoardRoute.ts';

/** Where a job's session stands: waiting between two turns, or inside one. */
export type JobTurn = 'between-turns' | 'mid-turn';

/**
 * One job of a forge that runs an agent. A forge read through its summary reports only the job id, kind, role, tickets, state and tokens;
 * every other fact is then `null`, never zero.
 */
export interface AgentRow {
  jobId:               string;
  kind:                string;
  role:                string | null;
  state:               string;
  ticketIds:           string[];
  tokens:              number;
  ticketTitle:         string | null;
  attempt:             number | null;
  startedAt:           string | null;
  calls:               number | null;
  callBudget:          number | null;
  toolCalls:           number | null;
  lastToolCall:        string | null;
  runningSubagents:    number | null;
  silentSweeps:        number | null;
  /** The forge's own quiet-job verdict, never Gaia's. */
  quiet:               boolean | null;
  /** `null` for a job with no session turn to tell, such as an Assistant's or a merge. */
  turn:                JobTurn | null;
  messagesWaiting:     number | null;
  lastLine:            string | null;
  waitingOnDecisionId: string | null;
  /** Why the forge's job stands interrupted, as its monitor names it; `null` while it is not, and from a summary. */
  interruption:        string | null;
  boardRoute:          BoardRoute | null;
}
