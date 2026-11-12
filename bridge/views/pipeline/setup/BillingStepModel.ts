/**
 * The billing step's model, pure: the billing choice a person makes on the cards and the cap field, the command it sends (the setup's
 * start on the landing, a billing change on a reopened step), the count of waiting tickets, and the pipeline agent's meter. The cap is
 * sent as typed once it is a number; the Overseer refuses one that is not positive, and the view shows that refusal verbatim.
 */
import type { PipelineBilling }    from '../../../../src/lib/tracker-model/@types/Pipeline.ts';
import type { PipelineChoices }    from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import type { PipelineSetup }      from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import type { AgentPair }          from '../../../../src/lib/tracker-model/@types/Ticket.ts';
import { AGENT_EFFORTS }           from '../../../../src/lib/tracker-model/constants/AgentSettings.ts';
import type { ControlCommandBody } from '../../../api/CommandClient.ts';
import { SETUP_STEP_LABELS }       from '../PipelineViewModel.ts';

export type BillingMode = PipelineBilling['mode'];

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
    description: 'Agents run on this machine\'s Claude login. Usage counts against the plan\'s limits, such as its weekly window.',
  },
  {
    mode:        'api',
    label:       'API key',
    description: 'Billed to the Console account of ANTHROPIC_API_KEY in the Overseer\'s environment. The key is never stored.',
  },
];

/** What the pipeline agent does, in order; the third line is Q15's: a gate's profile runs only when User asks for it. */
export const HOW_IT_WORKS_LINES: readonly string[] = [
  'It reads a snapshot of main: the scripts, the lockfile, the tests.',
  'It proposes the prepare steps, the build gates, the merge gates, the review and each agent\'s model, effort and brief.',
  'User can profile each gate in each phase; its time shows on the flow. It only informs.',
  'User talks it through beside the flow, changes any node, then applies it.',
];

function billingChoiceOf(billing: PipelineBilling | null): BillingChoice {
  if (billing === null || billing.mode === 'subscription') return SUBSCRIPTION_CHOICE;
  return { mode: 'api', capText: billing.maxBudgetUsd === undefined ? '' : String(billing.maxBudgetUsd) };
}

/** `null` while the cap field holds text that is not a number: nothing can be sent. */
function billingOf(choice: BillingChoice): PipelineBilling | null {
  if (choice.mode === 'subscription') return { mode: 'subscription' };
  const capText = choice.capText.trim();
  if (capText === '') return { mode: 'api' };
  const cap = Number(capText);
  return Number.isFinite(cap) ? { mode: 'api', maxBudgetUsd: cap } : null;
}

function billingsAreEqual(first: PipelineBilling, second: PipelineBilling): boolean {
  if (first.mode !== second.mode) return false;
  const firstCap = first.mode === 'api' ? first.maxBudgetUsd : undefined;
  const secondCap = second.mode === 'api' ? second.maxBudgetUsd : undefined;
  return firstCap === secondCap;
}

function startCommandOf(choice: BillingChoice, replacesUnreadablePipeline: boolean): ControlCommandBody | null {
  const billing = billingOf(choice);
  return billing === null ? null : { kind: 'pipeline-setup-start', billing, replacesUnreadablePipeline };
}

/** `null` while the choice is the record's own billing, or cannot be sent. */
function billingChangeCommandOf(record: PipelineSetup, choice: BillingChoice): ControlCommandBody | null {
  const billing = billingOf(choice);
  if (billing === null || billingsAreEqual(billing, record.billing)) return null;
  return { kind: 'pipeline-setup-billing', setupId: record.setupId, billing };
}

function pendingTicketCountOf(tickets: readonly { readonly status: string }[]): number {
  return tickets.filter((ticket) => ticket.status === 'pending').length;
}

function waitingTicketsTextOf(pendingTicketCount: number): string {
  if (pendingTicketCount === 0) return 'No ticket waits for a pipeline';
  return pendingTicketCount === 1 ? '1 ticket waits for a pipeline' : `${pendingTicketCount} tickets wait for a pipeline`;
}

/** What the meter reads: every effort in order, and the pipeline agent's default pair, both served by the Overseer. */
export interface PipelineAgentMeterFacts {
  readonly pipelineChoices?:       PipelineChoices;
  readonly pipelineAgentDefaults?: AgentPair;
}

/**
 * The record's draft names the pipeline agent's pair once the agent proposed one; until then the Overseer's default pair shows. `null`, so
 * no meter shows, when neither names one.
 */
function pipelineAgentMeterOf(record: PipelineSetup | null, facts: PipelineAgentMeterFacts): PipelineAgentMeter | null {
  const named = record?.draft?.agents?.pipelineAgent;
  const model = named?.model ?? facts.pipelineAgentDefaults?.model;
  const effort = named?.effort ?? facts.pipelineAgentDefaults?.effort;
  if (model === undefined || effort === undefined) return null;
  const efforts: readonly string[] = facts.pipelineChoices?.efforts ?? AGENT_EFFORTS;
  return {
    model,
    effort,
    level:          efforts.indexOf(effort) + 1,
    levelCount:     efforts.length,
    accessibleName: `Pipeline agent: ${model}, ${effort} effort`,
  };
}

/** The reopened billing step's way back to where the setup stands, in place of a second start. */
function backLabelOf(record: PipelineSetup): string {
  return `Back to ${SETUP_STEP_LABELS[record.currentStep].toLowerCase()}`;
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
});
