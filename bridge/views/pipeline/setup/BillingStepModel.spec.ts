/**
 * The billing step's model. What matters: the start carries the chosen billing, with the cap as typed once it is a number (the Overseer,
 * not the Bridge, refuses a cap that is not positive) and the unreadable file's replacement; a reopened step sends a billing change only
 * when the choice differs from the record's; the waiting tickets are the pending ones; the pipeline agent's meter shows its pair over
 * five bars, the default pair until a draft names one.
 */
import { describe, expect, test } from 'bun:test';

import { PIPELINE_CHOICES_FIXTURE, pipelineBoardStateOf } from '../../../testing/PipelineFixture.ts';
import { BillingStepModel }                               from './BillingStepModel.ts';

const {
  billingChoiceOf, startCommandOf, billingChangeCommandOf, pendingTicketCountOf, waitingTicketsTextOf, pipelineAgentMeterOf, backLabelOf
} = BillingStepModel;

function setupRecordOf(name: 'A0b-running' | 'A1') {
  const record = pipelineBoardStateOf(name).pipelineSetup?.record;
  if (record === undefined) throw new Error(`the fixture ${name} has no setup record`);
  return record;
}

describe('the start command', () => {
  test('a subscription start sends the subscription', () => {
    expect(startCommandOf({ mode: 'subscription', capText: '25' }, false))
      .toEqual({ kind: 'pipeline-setup-start', billing: { mode: 'subscription' }, replacesUnreadablePipeline: false });
  });

  test('an API key start sends the cap as typed, or none when the field is empty', () => {
    expect(startCommandOf({ mode: 'api', capText: ' 12.5 ' }, false))
      .toEqual({ kind: 'pipeline-setup-start', billing: { mode: 'api', maxBudgetUsd: 12.5 }, replacesUnreadablePipeline: false });
    expect(startCommandOf({ mode: 'api', capText: '' }, true))
      .toEqual({ kind: 'pipeline-setup-start', billing: { mode: 'api' }, replacesUnreadablePipeline: true });
  });

  test('a cap that is not positive is still sent, so the Overseer\'s refusal shows', () => {
    expect(startCommandOf({ mode: 'api', capText: '0' }, false))
      .toEqual({ kind: 'pipeline-setup-start', billing: { mode: 'api', maxBudgetUsd: 0 }, replacesUnreadablePipeline: false });
  });

  test('a cap that is not a number sends nothing', () => {
    expect(startCommandOf({ mode: 'api', capText: 'ten' }, false)).toBeNull();
  });
});

describe('a reopened billing step', () => {
  test('starts from the record\'s billing', () => {
    expect(billingChoiceOf(null)).toEqual({ mode: 'subscription', capText: '' });
    expect(billingChoiceOf({ mode: 'api', maxBudgetUsd: 5 })).toEqual({ mode: 'api', capText: '5' });
    expect(billingChoiceOf({ mode: 'api' })).toEqual({ mode: 'api', capText: '' });
  });

  test('sends a billing change only when the choice differs from the record', () => {
    const record = setupRecordOf('A0b-running');
    expect(billingChangeCommandOf(record, { mode: 'subscription', capText: '' })).toBeNull();
    expect(billingChangeCommandOf(record, { mode: 'api', capText: '8' }))
      .toEqual({ kind: 'pipeline-setup-billing', setupId: 'S1', billing: { mode: 'api', maxBudgetUsd: 8 } });
  });

  test('offers the way back to the current step', () => {
    expect(backLabelOf(setupRecordOf('A0b-running'))).toBe('Back to pipeline design');
    expect(backLabelOf(setupRecordOf('A1'))).toBe('Back to research');
  });
});

describe('the waiting tickets', () => {
  test('are the pending tickets of the page', () => {
    expect(pendingTicketCountOf([{ status: 'pending' }, { status: 'in-progress' }, { status: 'pending' }])).toBe(2);
  });

  test('are counted in words', () => {
    expect(waitingTicketsTextOf(3)).toBe('3 tickets wait for a pipeline');
    expect(waitingTicketsTextOf(1)).toBe('1 ticket waits for a pipeline');
    expect(waitingTicketsTextOf(0)).toBe('No ticket waits for a pipeline');
  });
});

describe('the pipeline agent\'s meter', () => {
  test('shows the Overseer\'s default pair over five bars before any draft', () => {
    expect(pipelineAgentMeterOf(null, pipelineBoardStateOf('A0'))).toEqual({
      model: 'opus', effort: 'high', level: 3, levelCount: 5, accessibleName: 'Pipeline agent: opus, high effort',
    });
    expect(pipelineAgentMeterOf(null, { ...pipelineBoardStateOf('A0'), pipelineAgentDefaults: { model: 'sonnet', effort: 'low' } }))
      .toMatchObject({ model: 'sonnet', effort: 'low', level: 1 });
  });

  test('keeps five bars when the Overseer serves no choices', () => {
    expect(pipelineAgentMeterOf(null, { pipelineAgentDefaults: { model: 'opus', effort: 'high' } })?.levelCount).toBe(5);
  });

  test('shows no meter when neither a draft nor the Overseer names a pair', () => {
    expect(pipelineAgentMeterOf(null, { pipelineChoices: PIPELINE_CHOICES_FIXTURE })).toBeNull();
  });

  test('shows the pair a draft names for the pipeline agent', () => {
    const record = setupRecordOf('A0b-running');
    const draft = record.draft === null ? null : { ...record.draft, agents: { pipelineAgent: { model: 'fable', effort: 'max' } } } as const;
    expect(pipelineAgentMeterOf({ ...record, draft }, {})).toMatchObject({ model: 'fable', effort: 'max', level: 5 });
  });
});
