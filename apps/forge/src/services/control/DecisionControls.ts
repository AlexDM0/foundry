/**
 * The decision kinds of the control contract: User's answer to an open decision, the first one winning. It is a `writeTracker` change, so it
 * is taken with Hephaestus down too; Hephaestus delivers it to the session after the hold.
 */
import type { DecisionAnswered } from '../../domain/tracker-model/@types/BoardChanges.ts';
import type { ControlCommandOf } from '../../shared/@types/ControlCommand.ts';
import type { BoardTransaction } from '../tracker/BoardTransaction.ts';

function answerDecision(command: ControlCommandOf<'decision-answer'>, change: BoardTransaction): DecisionAnswered {
  return change.board.answerDecisionInForm(command.decisionId, command.answer, change.at);
}

export const DECISION_CONTROLS = { 'decision-answer': answerDecision, } as const;
