/**
 * The forge settings' billing. What matters: it shows only while a billing forge launches under, the stored pipeline's or an open update's,
 * is not one of the ways the forge's agent bills, never for a first setup's record, which has its own billing step, nor with no agent; and
 * its save sends the agent as it is with the chosen way, nothing while the cap is not a number.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardDocument }   from '../../../../@types/board/BoardDocument.ts';
import { pipelineBoardStateOf } from '../../../testing/PipelineFixture.ts';
import { BillingStepModel }     from '../setup/BillingStepModel.ts';
import { ForgeBillingModel }    from './ForgeBillingModel.ts';

const BILLED_BY_KEY = { mode: 'api', maximumBudgetDollars: null } as const;

/** The login-only forge with its stored pipeline billed by subscription, beside the open record of the fixture given, billed by a key. */
function withRecordBilledByKey(recordFixture: 'A6' | 'A1'): BoardDocument {
  const facts = pipelineBoardStateOf('forge-settings-billing-not-offered');
  const { setup } = pipelineBoardStateOf(recordFixture).pipeline;
  const applied = facts.pipeline.applied.readingVerdict === 'readable'
    ? { ...facts.pipeline.applied, pipeline: { ...facts.pipeline.applied.pipeline, billing: { mode: 'subscription' } as const } }
    : facts.pipeline.applied;
  return { ...facts, pipeline: { ...facts.pipeline, applied, setup: setup === null ? null : { ...setup, record: { ...setup.record, billing: BILLED_BY_KEY } } } };
}

describe('ForgeBillingModel.billingNotOfferedOf', () => {
  test('names the stored billing the agent does not bill by, and nothing while it is one of its ways', () => {
    expect(ForgeBillingModel.billingNotOfferedOf(pipelineBoardStateOf('forge-settings-billing-not-offered'))).toEqual(BILLED_BY_KEY);
    expect(ForgeBillingModel.billingNotOfferedOf(pipelineBoardStateOf('forge-settings'))).toBeNull();
  });

  test('names an open update\'s billing, which has no billing step, but never a first setup\'s', () => {
    expect(ForgeBillingModel.billingNotOfferedOf(withRecordBilledByKey('A6'))).toEqual(BILLED_BY_KEY);
    expect(ForgeBillingModel.billingNotOfferedOf(withRecordBilledByKey('A1'))).toBeNull();
  });

  test('names nothing while no agent is chosen', () => {
    const facts = pipelineBoardStateOf('forge-settings-billing-not-offered');
    expect(ForgeBillingModel.billingNotOfferedOf({ ...facts, agent: { ...facts.agent, choice: null } })).toBeNull();
  });
});

describe('ForgeBillingModel.saveCommandOf', () => {
  test('sends the agent as it is with the chosen way, and nothing while the cap is not a number', () => {
    const facts = pipelineBoardStateOf('forge-settings');
    const agent = facts.agent.choice;
    if (agent === null) throw new Error('the fixture names an agent');
    const cards = BillingStepModel.billingCardsOf(facts, { agent });
    const capped = ForgeBillingModel.saveCommandOf(agent, { mode: 'api', capText: '12' }, cards);
    expect(capped).toMatchObject({ kind: 'pipeline-agent-set', agent, billing: { mode: 'api', maximumBudgetDollars: 12 } });
    expect(ForgeBillingModel.saveCommandOf(agent, { mode: 'api', capText: 'twelve' }, cards)).toBeNull();
  });
});
