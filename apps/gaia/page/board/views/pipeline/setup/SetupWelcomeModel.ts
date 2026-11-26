/**
 * The setup welcome's model, pure: its title, the steps the setup will walk with what each decides, the first one current, whether forge
 * found this machine's program of the agent and where, and the line for the tickets that wait for the pipeline.
 */
import type { BoardAgentDocument }                                    from '../../../../@types/board/BoardAgentDocuments.ts';
import type { BoardSetupStep }                                        from '../../../../@types/board/BoardVocabulary.ts';
import { PipelineViewModel, SETUP_STEP_LABELS, SETUP_STEP_SUMMARIES } from '../PipelineViewModel.ts';
import { AgentChoiceModel }                                           from '../agent/AgentChoiceModel.ts';
import { BillingStepModel }                                           from './BillingStepModel.ts';

export interface WelcomeStepRow {
  readonly step:      BoardSetupStep;
  readonly position:  number;
  readonly label:     string;
  readonly summary:   string;
  readonly isCurrent: boolean;
}

export type WelcomeAgentLine =
  | { readonly programIsFound: true; readonly text: string; readonly path: string }
  | { readonly programIsFound: false; readonly text: string };

function titleOf(project: string): string {
  return project === '' ? 'Set up the pipeline' : `Set up ${project}'s pipeline`;
}

/** The steps a setup with no record walks, so a monorepo's `entities` step shows only once the record holds it. */
function stepRowsOf(): readonly WelcomeStepRow[] {
  return PipelineViewModel.setupStepsOf(null).map((step, index) => ({
    step,
    position:  index + 1,
    label:     SETUP_STEP_LABELS[step],
    summary:   SETUP_STEP_SUMMARIES[step],
    isCurrent: PipelineViewModel.setupStepStatusOf(null, step) === 'current',
  }));
}

function agentLineOf(agent: BoardAgentDocument): WelcomeAgentLine {
  const displayName = AgentChoiceModel.displayNameOf(agent, AgentChoiceModel.chosenVendorOf(agent, null));
  const machineProgram = AgentChoiceModel.machineProgramOf(agent);
  if (machineProgram === null) return { programIsFound: false, text: `Forge found no ${displayName} program yet. You choose it in the first step.` };
  return { programIsFound: true, text: `${displayName} found at`, path: machineProgram.path };
}

/** "4 tickets wait for a pipeline; none of them builds yet.", or `null` while no ticket waits. */
function waitingTicketsTextOf(tickets: readonly { readonly status: string }[]): string | null {
  const pendingTicketCount = BillingStepModel.pendingTicketCountOf(tickets);
  return pendingTicketCount === 0 ? null : `${BillingStepModel.waitingTicketsTextOf(pendingTicketCount)}; none of them builds yet.`;
}

export const SetupWelcomeModel = Object.freeze({
  titleOf,
  stepRowsOf,
  agentLineOf,
  waitingTicketsTextOf,
});
