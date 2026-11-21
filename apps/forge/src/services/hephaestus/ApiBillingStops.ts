/**
 * The results under API billing that end a session's work without Customs: a refused key interrupts the job and opens one board decision,
 * which holds every launch until User answers it; a stop at the pipeline's budget cap ends the job `blocked` and opens a decision holding
 * its tickets.
 */
import type { AgentResultFailure }             from '../../lib/agent-launch/AgentSessionEvent.ts';
import type { PipelineBilling }                from '../../lib/tracker-model/@types/Pipeline.ts';
import type { DecisionDraft, DecisionWording } from '../../lib/tracker-model/@types/PlaybookStep.ts';
import type { Board }                          from '../../lib/tracker-model/Board.ts';

export type ApiBilling = Extract<PipelineBilling, { mode: 'api' }>;

/** A job whose session the pass stops after the hold, since a session that printed its result still waits on its input. */
export interface StoppedSession {
  jobId:         string;
  childInstance: number;
}

const AUTHENTICATION_DECISION_KIND = 'api-authentication-failed';
const BUDGET_DECISION_KIND         = 'budget-reached';

/** The values the decision names, never words: the vendor's status and text, or the budget the pipeline set. */
function failureContextOf(failure: AgentResultFailure): string {
  return [`status ${failure.httpStatus ?? '-'}`, failure.text].filter((part) => part !== '').join('\n');
}

function budgetContextOf(billing: ApiBilling, failure: AgentResultFailure): string {
  return [`maxBudgetUsd ${billing.maxBudgetUsd ?? '-'}`, failure.text].filter((part) => part !== '').join('\n');
}

function withValues(wording: DecisionWording, values: string): DecisionWording {
  return { questions: wording.questions, context: [values, wording.context].filter((part) => part !== '').join('\n') };
}

/** One decision while any is open, however many sessions the refused key stopped. */
function interruptOnRefusedKey(board: Board, jobId: string, failure: AgentResultFailure, decisionWordingOf: (draft: DecisionDraft) => DecisionWording, at: string): void {
  board.interruptJob(jobId, 'authentication-failed', at);
  if (board.decisions().some((decision) => decision.kind === AUTHENTICATION_DECISION_KIND)) return;
  const draft = { kind: AUTHENTICATION_DECISION_KIND, ticketIds: [], jobId: null } as const;
  board.openDecision({
    ...draft, askedBy: 'hephaestus', requestId: null, ...withValues(decisionWordingOf(draft), failureContextOf(failure))
  }, at);
}

function endAtBudget(
  board: Board,
  jobId: string,
  billing: ApiBilling,
  failure: AgentResultFailure,
  decisionWordingOf: (draft: DecisionDraft) => DecisionWording,
  at: string,
): void {
  const ticketIds = [...board.jobById(jobId)?.ticketIds ?? []];
  board.endJob(jobId, { outcome: 'blocked', cause: BUDGET_DECISION_KIND }, at);
  const draft = { kind: BUDGET_DECISION_KIND, ticketIds, jobId } as const;
  board.openDecision({
    ...draft, askedBy: 'hephaestus', requestId: null, ...withValues(decisionWordingOf(draft), budgetContextOf(billing, failure))
  }, at);
}

/** Applies a refused key or a budget stop of a running job; answers the session to stop, or `null` for any other result. */
function applyResultFailure(
  board: Board,
  jobId: string,
  billing: ApiBilling,
  failure: AgentResultFailure,
  decisionWordingOf: (draft: DecisionDraft) => DecisionWording,
  at: string,
): StoppedSession | null {
  const job = board.jobById(jobId);
  if (job === undefined || job.state !== 'running') return null;
  const stopped = { jobId, childInstance: job.childInstance };
  if (failure.kind === 'authentication-failed') {
    interruptOnRefusedKey(board, jobId, failure, decisionWordingOf, at);
    return stopped;
  }
  if (failure.kind === 'budget-reached') {
    endAtBudget(board, jobId, billing, failure, decisionWordingOf, at);
    return stopped;
  }
  return null;
}

function launchesAreHeld(board: Board): boolean {
  return board.decisions().some((decision) => decision.kind === AUTHENTICATION_DECISION_KIND);
}

export const ApiBillingStops = Object.freeze({ applyResultFailure, launchesAreHeld });
