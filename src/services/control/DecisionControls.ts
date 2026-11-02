/**
 * The decision kinds of the control contract: User's answer to an open decision, the first one winning. It is a `writeTracker` change, so it
 * is taken with the Overseer down too; the Overseer delivers it to the session after the hold.
 */
import type { DecisionAnswered } from '../../lib/tracker-model/@types/BoardChanges.ts';
import type { ControlCommandOf } from '../../shared/@types/ControlCommand.ts';
import { OnboardingProposal }    from '../lifecycle/OnboardingProposal.ts';
import type { TrackerChange }    from '../tracker/TrackerPipeline.ts';

/** A `pipeline-proposal` option whose label starts so accepts; any other answer declines and changes nothing. */
export const ACCEPT_PROPOSAL_LABEL = 'Accept';

function answerDecision(command: ControlCommandOf<'decision-answer'>, change: TrackerChange) {
  const answered = change.board.answerDecisionInForm(command.decisionId, command.answer, change.at);
  if (answered.decision.kind === 'pipeline-proposal') return answerPipelineProposal(answered, change);
  return answered;
}

/** Accepted, the onboarder's stored proposal is written through the gate verbs' moves in this hold; declined, nothing changes. */
function answerPipelineProposal(answered: DecisionAnswered, change: TrackerChange): DecisionAnswered {
  const accepted = Object.values(answered.answer).some((label) => label.startsWith(ACCEPT_PROPOSAL_LABEL));
  const { jobId } = answered.decision;
  if (!accepted || jobId === null) return answered;
  const outcome = OnboardingProposal.storedOutcomeOf(change.workspace.trackerDirectory, jobId);
  if (outcome?.verdict !== 'proposed') return answered;
  return { ...answered, logged: [...answered.logged, ...OnboardingProposal.acceptProposal(change.board, outcome.proposal, change.at)] };
}

export const DECISION_CONTROLS = { 'decision-answer': answerDecision, } as const;
