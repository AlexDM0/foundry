/**
 * The billing step's model, pure: the ways the record's agent bills, as its vendor serves them with its default first, worded as cards
 * without naming the vendor; the billing choice a person makes on the cards and the cap field, the default preselected while the record
 * has none; the commands it sends (a billing change, and the Continue of a record at billing, which saves a changed choice first, since
 * forge continues only once a billing is chosen); the footer's words for it, the count of waiting tickets, the pipeline agent's meter and
 * the panel head's status, and the words of the page's lists. The cap is sent as typed once it is a number; Hephaestus refuses one that is
 * not positive, and the view shows that refusal verbatim.
 */
import { PAGE_CONTRACT_VERSIONS }                                   from '../../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardAgentBillingOptionDocument, BoardAgentDocument } from '../../../../@types/board/BoardAgentDocuments.ts';
import type { BoardCommandDocument }                                from '../../../../@types/board/BoardCommandDocument.ts';
import type { BoardDocument }                                       from '../../../../@types/board/BoardDocument.ts';
import type { BoardBillingDocument, BoardSetupRecordDocument }      from '../../../../@types/board/BoardPipelineDocuments.ts';
import { CountTextUtil }                                            from '../../../../shared/utils/CountTextUtil.ts';
import type { PanelStatus }                                         from '../PipelinePanel.tsx';
import { AgentChoiceModel }                                         from '../agent/AgentChoiceModel.ts';
import { NOT_LAUNCHED_PANEL_STATUS, type AgentSessionState }        from '../agent-panel/AgentSessionModel.ts';

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

/** One card: a way the agent bills, its words, whether it is the vendor's default, and whether it shows the cap per launch. */
export interface BillingCard {
  readonly mode:            BillingMode;
  readonly label:           string;
  readonly description:     string;
  readonly isDefault:       boolean;
  /** The environment variable the key must be in, as forge serves it; `null` for the login. */
  readonly keyVariableName: string | null;
  readonly capsEachLaunch:  boolean;
}

const BILLING_MODE_LABELS: Readonly<Record<BillingMode, string>> = { subscription: 'Subscription', api: 'API key' };

/** The facts the cards read: the vendors the forge knows, with how each bills. */
export type BillingFacts = Pick<BoardDocument, 'agent'>;

/** What the pipeline agent does once started, after "When you start it, Flint:"; the fourth is Q15's: a profile runs only when asked. */
export const HOW_IT_WORKS_LINES: readonly string[] = [
  'Reads a snapshot of main: the scripts, the lockfile and the tests.',
  'Drafts the constitution that every builder and reviewer reads.',
  'Proposes the prepare steps, the gates, the review, and each agent\'s model, effort and brief.',
  'Profiles a gate in a phase when you ask, and shows its time. The time only informs.',
  'Talks it through with you. You change any part, then apply it.',
];

/** The footer's words for the chosen billing: its name, and what it means. */
export interface BillingFooterLines {
  readonly summary: string;
  readonly detail:  string;
}

/** The ways the record's agent bills, its default first, as its vendor serves them; none while the forge names none. */
function billingOptionsOf(facts: BillingFacts, record: Pick<BoardSetupRecordDocument, 'agent'>): readonly BoardAgentBillingOptionDocument[] {
  const vendor = AgentChoiceModel.chosenVendorOf(facts.agent, record.agent);
  return facts.agent.vendors.find((known) => known.vendor === vendor)?.billingOptions ?? [];
}

function displayNameOf(agent: BoardAgentDocument, record: Pick<BoardSetupRecordDocument, 'agent'>): string {
  return AgentChoiceModel.displayNameOf(agent, AgentChoiceModel.chosenVendorOf(agent, record.agent));
}

/** The login of the vendor forge served, or the key in Hephaestus's environment; the key's variable shows beside it as a machine value. */
function descriptionOf(option: BoardAgentBillingOptionDocument, displayName: string): string {
  if (option.mode === 'subscription') {
    return `Agents run on this machine's ${displayName} login. Usage counts against the plan's limits, such as its weekly window.`;
  }
  return 'Billed to the API key in Hephaestus\'s environment. The key is never stored.';
}

/** The cards of the agent a record names: a setup record's, or the forge's stored one as its settings pass it. */
function billingCardsOf(facts: BillingFacts, record: Pick<BoardSetupRecordDocument, 'agent'>): readonly BillingCard[] {
  const displayName = displayNameOf(facts.agent, record);
  return billingOptionsOf(facts, record).map((option, i) => ({
    mode:            option.mode,
    label:           BILLING_MODE_LABELS[option.mode],
    description:     descriptionOf(option, displayName),
    isDefault:       i === 0,
    keyVariableName: option.keyVariableName,
    capsEachLaunch:  option.capsEachLaunch,
  }));
}

/** The record's billing, else the vendor's default preselected, not yet saved. */
function billingChoiceOf(billing: BoardBillingDocument | null, cards: readonly BillingCard[]): BillingChoice {
  if (billing === null) return { mode: cards[0]?.mode ?? 'subscription', capText: '' };
  if (billing.mode === 'subscription') return { mode: 'subscription', capText: '' };
  return { mode: 'api', capText: billing.maximumBudgetDollars === null ? '' : String(billing.maximumBudgetDollars) };
}

/** `null` while the cap field holds text that is not a number: nothing can be sent. A way that caps no launch sends no cap. */
function billingOf(choice: BillingChoice, cards: readonly BillingCard[]): BoardBillingDocument | null {
  if (choice.mode === 'subscription') return { mode: 'subscription' };
  const capText = choice.capText.trim();
  const capsEachLaunch = cards.find((card) => card.mode === choice.mode)?.capsEachLaunch ?? true;
  if (capText === '' || !capsEachLaunch) return { mode: 'api', maximumBudgetDollars: null };
  const cap = Number(capText);
  return Number.isFinite(cap) ? { mode: 'api', maximumBudgetDollars: cap } : null;
}

function billingsAreEqual(first: BoardBillingDocument, second: BoardBillingDocument): boolean {
  if (first.mode !== second.mode) return false;
  const firstCap = first.mode === 'api' ? first.maximumBudgetDollars : null;
  const secondCap = second.mode === 'api' ? second.maximumBudgetDollars : null;
  return firstCap === secondCap;
}

/** `null` while the choice is the record's own billing, or cannot be sent; a record with no billing yet takes any choice. */
function billingChangeCommandOf(record: BoardSetupRecordDocument, choice: BillingChoice, cards: readonly BillingCard[]): BoardCommandDocument | null {
  const billing = billingOf(choice, cards);
  if (billing === null || (record.billing !== null && billingsAreEqual(billing, record.billing))) return null;
  return {
    boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'pipeline-setup-billing', setupId: record.setupId, billing
  };
}

/**
 * The Continue of a record at the billing step: the choice saved first when it is not the record's, then the step's Continue, which opens
 * the research and launches the pipeline agent; `null` at any other step, or while the cap cannot be sent.
 */
function continueCommandsOf(record: BoardSetupRecordDocument, choice: BillingChoice, cards: readonly BillingCard[]): readonly BoardCommandDocument[] | null {
  if (record.currentStep !== 'billing' || billingOf(choice, cards) === null) return null;
  const change = billingChangeCommandOf(record, choice, cards);
  const continueCommand: BoardCommandDocument = {
    boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'pipeline-setup-step', setupId: record.setupId, step: 'billing', move: 'continue'
  };
  return change === null ? [continueCommand] : [change, continueCommand];
}

function pendingTicketCountOf(tickets: readonly { readonly status: string }[]): number {
  return tickets.filter((ticket) => ticket.status === 'committed').length;
}

function waitingTicketsTextOf(pendingTicketCount: number): string {
  if (pendingTicketCount === 0) return 'No ticket waits for a pipeline';
  return CountTextUtil.countedPhrase(pendingTicketCount, 'ticket waits for a pipeline', 'tickets wait for a pipeline');
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

/** The panel head's dot and word: not started before the billing's Continue launches it, then whether its job runs, or that forge did not. */
function panelStatusOf(record: BoardSetupRecordDocument, sessionState: AgentSessionState): PanelStatus {
  if (record.agentJobId === null) return { tone: 'idle', text: 'Not started' };
  if (sessionState === 'not-launched') return NOT_LAUNCHED_PANEL_STATUS;
  return sessionState === 'stopped' ? { tone: 'idle', text: 'Stopped' } : { tone: 'working', text: 'Running' };
}

/** "Subscription" with the login it runs on, or "API key" with its cap per launch as typed, where a launch takes one. */
function footerLinesOf(choice: BillingChoice, cards: readonly BillingCard[], displayName: string): BillingFooterLines {
  if (choice.mode === 'subscription') return { summary: BILLING_MODE_LABELS.subscription, detail: `Agents run on this machine's ${displayName} login.` };
  const card = cards.find((candidate) => candidate.mode === 'api');
  const keyLine = 'Billed to the API key.';
  if (card?.capsEachLaunch === false) return { summary: BILLING_MODE_LABELS.api, detail: keyLine };
  const capText = choice.capText.trim();
  const capLine = capText === '' ? 'No cap per launch.' : `A cap of US$ ${capText} per launch.`;
  return { summary: BILLING_MODE_LABELS.api, detail: `${keyLine} ${capLine}` };
}

export const BillingStepModel = Object.freeze({
  billingOptionsOf,
  billingCardsOf,
  billingChoiceOf,
  billingOf,
  billingChangeCommandOf,
  continueCommandsOf,
  pendingTicketCountOf,
  waitingTicketsTextOf,
  pipelineAgentMeterOf,
  panelStatusOf,
  footerLinesOf,
});
