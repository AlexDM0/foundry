/** A job's live facts as the board words them wherever a job shows: its calls against its budget, and its last tool call. */

export interface JobCallsFacts {
  readonly live: { readonly calls: number; readonly callBudget: number | null };
}

export interface LastToolCallFacts {
  readonly toolName: string;
  readonly running:  boolean;
}

const NO_TOOL_CALL_TEXT = 'no tool call yet';

/** `12 / 150` against a budget, the calls alone when the job has none. */
function callsAgainstBudgetOf(job: JobCallsFacts): string {
  return job.live.callBudget === null ? String(job.live.calls) : `${job.live.calls} / ${job.live.callBudget}`;
}

/** `no tool call yet`, `Bash running` while the call has no result, or the tool's name alone. */
function lastToolCallTextOf(lastToolCall: LastToolCallFacts | null): string {
  if (lastToolCall === null) return NO_TOOL_CALL_TEXT;
  return lastToolCall.running ? `${lastToolCall.toolName} running` : lastToolCall.toolName;
}

export const JobLiveFactsUtil = Object.freeze({ callsAgainstBudgetOf, lastToolCallTextOf });
