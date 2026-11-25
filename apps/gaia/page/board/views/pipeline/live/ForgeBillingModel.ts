/**
 * The forge settings' billing, pure: shown only while the stored pipeline's billing, or an open update's or advise's, is not one of the ways
 * the forge's agent bills, so no job launches; the words that say so, and the command that stores the chosen way with the agent, which forge
 * judges against the agent's vendor.
 */
import { PAGE_CONTRACT_VERSIONS }                                 from '../../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardPipelineAgentDocument }                        from '../../../../@types/board/BoardAgentDocuments.ts';
import type { BoardCommandDocument }                              from '../../../../@types/board/BoardCommandDocument.ts';
import type { BoardDocument }                                     from '../../../../@types/board/BoardDocument.ts';
import type { BoardBillingDocument }                              from '../../../../@types/board/BoardPipelineDocuments.ts';
import { BillingStepModel, type BillingCard, type BillingChoice } from '../setup/BillingStepModel.ts';

export type ForgeBillingFacts = Pick<BoardDocument, 'agent' | 'pipeline'>;

const BILLING_MODE_WORDS: Readonly<Record<BoardBillingDocument['mode'], string>> = { subscription: 'the subscription', api: 'an API key' };

/** The billings forge launches under: the stored pipeline's, and an open update's or advise's, which has no billing step of its own. */
function standingBillingsOf(facts: ForgeBillingFacts): BoardBillingDocument[] {
  const { applied, setup } = facts.pipeline;
  const storedBilling = applied.readingVerdict === 'readable' ? applied.pipeline.billing : null;
  const recordBilling = setup !== null && setup.record.mode !== 'setup' ? setup.record.billing : null;
  return [storedBilling, recordBilling].filter((billing): billing is BoardBillingDocument => billing !== null);
}

/** The first standing billing the forge's agent does not bill by; `null` while every one is a way it bills, or no agent is chosen. */
function billingNotOfferedOf(facts: ForgeBillingFacts): BoardBillingDocument | null {
  const { choice } = facts.agent;
  if (choice === null) return null;
  const offeredModes = BillingStepModel.billingOptionsOf(facts, { agent: choice }).map((option) => option.mode);
  return standingBillingsOf(facts).find((billing) => !offeredModes.includes(billing.mode)) ?? null;
}

function noticeTextOf(billing: BoardBillingDocument, displayName: string): string {
  return `The pipeline bills by ${BILLING_MODE_WORDS[billing.mode]}, which ${displayName} does not offer, so no job launches. Choose how ${displayName} bills.`;
}

/** The agent as it is, with the chosen way to bill; `null` while the cap field holds text that is not a number. */
function saveCommandOf(agent: BoardPipelineAgentDocument, choice: BillingChoice, cards: readonly BillingCard[]): BoardCommandDocument | null {
  const billing = BillingStepModel.billingOf(choice, cards);
  if (billing === null) return null;
  return {
    boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'pipeline-agent-set', agent, billing
  };
}

export const ForgeBillingModel = Object.freeze({ billingNotOfferedOf, noticeTextOf, saveCommandOf });
