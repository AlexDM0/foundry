/**
 * The billing step's model, pure: the billing choice a person makes on the cards and the cap field, the command it sends (the setup's
 * start on the landing, a billing change on a reopened step, and the Continue of a record still at billing), the footer's words for it,
 * the count of waiting tickets, the pipeline agent's meter and the panel head's status, and the words of the page's lists. The cap is
 * sent as typed once it is a number; Hephaestus refuses one that is not positive, and the view shows that refusal verbatim.
 */
import { PAGE_CONTRACT_VERSIONS }                              from '../../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardCommandDocument }                           from '../../../../@types/board/BoardCommandDocument.ts';
import type { BoardDocument }                                  from '../../../../@types/board/BoardDocument.ts';
import type { BoardBillingDocument, BoardSetupRecordDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import type { BoardJobState }                                  from '../../../../@types/board/BoardVocabulary.ts';
import type { PanelStatus }                                    from '../PipelinePanel.tsx';
import { SETUP_STEP_LABELS }                                   from '../PipelineViewModel.ts';
import type { PipelinePhase }                                  from '../flow/PipelinePhaseModel.ts';

export type BillingMode = BoardBillingDocument['mode'];

/** What the cards and the cap field hold before it is sent: the cap as typed, empty for none. */
export interface BillingChoice {
  readonly mode:    BillingMode;
  readonly capText: string;
}

export interface PipelineAgentMeter {
  readonly model:          string;
  readonly effort:         string;
  readonly level:          number;
  readonly levelCount:     number;
  readonly accessibleName: string;
}

export const SUBSCRIPTION_CHOICE: BillingChoice = { mode: 'subscription', capText: '' };

/** The words of each card, in the order the cards show. */
export const BILLING_CARDS: readonly { readonly mode: BillingMode; readonly label: string; readonly description: string }[] = [
  {
    mode:        'subscription',
    label:       'Subscription',
    description: 'Agents run on this machine\'s agent login. Usage counts against the plan\'s limits, such as its weekly window.',
  },
  {
    mode:        'api',
    label:       'API key',
    description: 'Billed to the API key in Hephaestus\'s environment. The key is never stored.',
  },
];

/** What the pipeline agent does once started, after "When you start it, Flint:"; the fourth is Q15's: a profile runs only when asked. */
export const HOW_IT_WORKS_LINES: readonly string[] = [
  'Reads a snapshot of main: the scripts, the lockfile and the tests.',
  'Drafts the constitution that every builder and reviewer reads.',
  'Proposes the prepare steps, the gates, the review, and each agent\'s model, effort and brief.',
  'Profiles a gate in a phase when you ask, and shows its time. The time only informs.',
  'Talks it through with you. You change any part, then apply it.',
];

/** The four phases every ticket goes through, as "What the pipeline decides" names them. */
export const PIPELINE_PHASE_SUMMARIES: readonly { readonly phase: PipelinePhase; readonly name: string; readonly line: string }[] = [
  { phase: 'ticket', name: 'Ticket', line: 'Which agent files a request, and if you ready each draft.' },
  { phase: 'build', name: 'Build', line: 'Which agent builds it, and the gates it must pass.' },
  { phase: 'review', name: 'Review', line: 'Which agent reviews it, and if you review the code too.' },
  { phase: 'merge', name: 'Merge', line: 'The gates that run on the latest main before the merge.' },
];

/** The footer's words for the chosen billing: its name, and what it means. */
export interface BillingFooterLines {
  readonly summary: string;
  readonly detail:  string;
}

function billingChoiceOf(billing: BoardBillingDocument | null): BillingChoice {
  if (billing === null || billing.mode === 'subscription') return SUBSCRIPTION_CHOICE;
  return { mode: 'api', capText: billing.maximumBudgetDollars === null ? '' : String(billing.maximumBudgetDollars) };
}

/** `null` while the cap field holds text that is not a number: nothing can be sent. */
function billingOf(choice: BillingChoice): BoardBillingDocument | null {
  if (choice.mode === 'subscription') return { mode: 'subscription' };
  const capText = choice.capText.trim();
  if (capText === '') return { mode: 'api', maximumBudgetDollars: null };
  const cap = Number(capText);
  return Number.isFinite(cap) ? { mode: 'api', maximumBudgetDollars: cap } : null;
}

function billingsAreEqual(first: BoardBillingDocument, second: BoardBillingDocument): boolean {
  if (first.mode !== second.mode) return false;
  const firstCap = first.mode === 'api' ? first.maximumBudgetDollars : null;
  const secondCap = second.mode === 'api' ? second.maximumBudgetDollars : null;
  return firstCap === secondCap;
}

function startCommandOf(choice: BillingChoice, replacesUnreadablePipeline: boolean): BoardCommandDocument | null {
  const billing = billingOf(choice);
  return billing === null ? null : {
    boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'pipeline-setup-start', billing, replacesUnreadablePipeline
  };
}

/** `null` while the choice is the record's own billing, or cannot be sent. */
function billingChangeCommandOf(record: BoardSetupRecordDocument, choice: BillingChoice): BoardCommandDocument | null {
  const billing = billingOf(choice);
  if (billing === null || billingsAreEqual(billing, record.billing)) return null;
  return {
    boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'pipeline-setup-billing', setupId: record.setupId, billing
  };
}

function pendingTicketCountOf(tickets: readonly { readonly status: string }[]): number {
  return tickets.filter((ticket) => ticket.status === 'committed').length;
}

function waitingTicketsTextOf(pendingTicketCount: number): string {
  if (pendingTicketCount === 0) return 'No ticket waits for a pipeline';
  return pendingTicketCount === 1 ? '1 ticket waits for a pipeline' : `${pendingTicketCount} tickets wait for a pipeline`;
}

/** What the meter reads: every effort in order, and the pipeline agent's default pair, both served by Hephaestus. */
export type PipelineAgentMeterFacts = Pick<BoardDocument, 'pipeline'>;

/**
 * The record's draft names the pipeline agent's pair once the agent proposed one; until then Hephaestus's default pair shows. `null`, so
 * no meter shows, when neither names one.
 */
function pipelineAgentMeterOf(record: BoardSetupRecordDocument | null, facts: PipelineAgentMeterFacts): PipelineAgentMeter | null {
  const named = record?.draft?.agents.pipelineAgent;
  const model = named?.model ?? facts.pipeline.agentDefaults.model;
  const effort = named?.effort ?? facts.pipeline.agentDefaults.effort;
  const { efforts } = facts.pipeline.choices;
  return {
    model,
    effort,
    level:          efforts.indexOf(effort) + 1,
    levelCount:     efforts.length,
    accessibleName: `Pipeline agent: ${model}, ${effort} effort`,
  };
}

/** The panel head's dot and word: not started before the setup, then whether the agent's job runs. */
function panelStatusOf(record: BoardSetupRecordDocument | null, agentJobState: BoardJobState | null): PanelStatus {
  if (record === null) return { tone: 'idle', text: 'Not started' };
  return agentJobState === null ? { tone: 'idle', text: 'Stopped' } : { tone: 'working', text: 'Running' };
}

/** "Subscription" with the login it runs on, or "API key" with its cap per launch as typed. */
function footerLinesOf(choice: BillingChoice): BillingFooterLines {
  if (choice.mode === 'subscription') return { summary: 'Subscription', detail: 'Agents run on this machine\'s agent login.' };
  const capText = choice.capText.trim();
  const capLine = capText === '' ? 'No cap per launch.' : `A cap of US$ ${capText} per launch.`;
  return { summary: 'API key', detail: `Billed to the API key. ${capLine}` };
}

/** The reopened billing step's way back to where the setup stands, in place of a second start. */
function backLabelOf(record: BoardSetupRecordDocument): string {
  return `Back to ${SETUP_STEP_LABELS[record.currentStep].toLowerCase()}`;
}

/**
 * A record still at the billing step, as a reopen leaves it, continues to the research from here, so the way out is never a link back to
 * this same screen; `null` at any later step.
 */
function continueCommandOf(record: BoardSetupRecordDocument): BoardCommandDocument | null {
  return record.currentStep === 'billing' ? {
    boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'pipeline-setup-step', setupId: record.setupId, step: 'billing', move: 'continue'
  } : null;
}

export const BillingStepModel = Object.freeze({
  billingChoiceOf,
  billingOf,
  startCommandOf,
  billingChangeCommandOf,
  pendingTicketCountOf,
  waitingTicketsTextOf,
  pipelineAgentMeterOf,
  backLabelOf,
  continueCommandOf,
  panelStatusOf,
  footerLinesOf,
});
