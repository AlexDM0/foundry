/**
 * The billing step's model. What matters: the start carries the chosen billing, with the cap as typed once it is a number (Hephaestus,
 * not the board, refuses a cap that is not positive) and the unreadable file's replacement; a reopened step sends a billing change only
 * when the choice differs from the record's, and a record still at billing continues from here, never loops back to it; the waiting
 * tickets are the committed ones; the pipeline agent's meter shows its pair over five bars, the default pair until a draft names one; the
 * panel head says the agent is not started before a setup, then whether its job runs; the cards and the footer word the chosen billing and
 * its cap without naming the agent's vendor or its key variable, which Hephaestus's decision names once the key is missing.
 */
import { describe, expect, test } from 'bun:test';

import { PIPELINE_CHOICES_FIXTURE, pipelineBoardStateOf } from '../../../testing/PipelineFixture.ts';
import { BILLING_CARDS, BillingStepModel }                from './BillingStepModel.ts';

const {
  billingChoiceOf, startCommandOf, billingChangeCommandOf, pendingTicketCountOf, waitingTicketsTextOf, pipelineAgentMeterOf, backLabelOf, continueCommandOf,
  panelStatusOf, footerLinesOf
} = BillingStepModel;

function setupRecordOf(name: 'A0b-running' | 'A0b-at-billing' | 'A1') {
  const record = pipelineBoardStateOf(name).pipeline.setup?.record;
  if (record === undefined) throw new Error(`the fixture ${name} has no setup record`);
  return record;
}

describe('the start command', () => {
  test('a subscription start sends the subscription', () => {
    expect(startCommandOf({ mode: 'subscription', capText: '25' }, false))
      .toEqual({
        boardCommandVersion: 1, kind: 'pipeline-setup-start', billing: { mode: 'subscription' }, replacesUnreadablePipeline: false, agent: null
      });
  });

  test('an API key start sends the cap as typed, or none when the field is empty', () => {
    expect(startCommandOf({ mode: 'api', capText: ' 12.5 ' }, false))
      .toEqual({
        boardCommandVersion: 1, kind: 'pipeline-setup-start', billing: { mode: 'api', maximumBudgetDollars: 12.5 }, replacesUnreadablePipeline: false, agent: null
      });
    expect(startCommandOf({ mode: 'api', capText: '' }, true))
      .toEqual({
        boardCommandVersion: 1, kind: 'pipeline-setup-start', billing: { mode: 'api', maximumBudgetDollars: null }, replacesUnreadablePipeline: true, agent: null
      });
  });

  test('a cap that is not positive is still sent, so Hephaestus\'s refusal shows', () => {
    expect(startCommandOf({ mode: 'api', capText: '0' }, false))
      .toEqual({
        boardCommandVersion: 1, kind: 'pipeline-setup-start', billing: { mode: 'api', maximumBudgetDollars: 0 }, replacesUnreadablePipeline: false, agent: null
      });
  });

  test('a cap that is not a number sends nothing', () => {
    expect(startCommandOf({ mode: 'api', capText: 'ten' }, false)).toBeNull();
  });
});

describe('a reopened billing step', () => {
  test('starts from the record\'s billing', () => {
    expect(billingChoiceOf(null)).toEqual({ mode: 'subscription', capText: '' });
    expect(billingChoiceOf({ mode: 'api', maximumBudgetDollars: 5 })).toEqual({ mode: 'api', capText: '5' });
    expect(billingChoiceOf({ mode: 'api', maximumBudgetDollars: null })).toEqual({ mode: 'api', capText: '' });
  });

  test('sends a billing change only when the choice differs from the record', () => {
    const record = setupRecordOf('A0b-running');
    expect(billingChangeCommandOf(record, { mode: 'subscription', capText: '' })).toBeNull();
    expect(billingChangeCommandOf(record, { mode: 'api', capText: '8' }))
      .toEqual({
        boardCommandVersion: 1, kind: 'pipeline-setup-billing', setupId: 'S1', billing: { mode: 'api', maximumBudgetDollars: 8 }
      });
  });

  test('offers the way back to the current step', () => {
    expect(backLabelOf(setupRecordOf('A0b-running'))).toBe('Back to pipeline design');
    expect(backLabelOf(setupRecordOf('A1'))).toBe('Back to research');
  });

  test('a record still at billing continues to the agent step, and a record past it has no Continue here', () => {
    expect(continueCommandOf(setupRecordOf('A0b-at-billing'))).toEqual({
      boardCommandVersion: 1, kind: 'pipeline-setup-step', setupId: 'S1', step: 'billing', move: 'continue'
    });
    expect(continueCommandOf(setupRecordOf('A1'))).toBeNull();
    expect(continueCommandOf(setupRecordOf('A0b-running'))).toBeNull();
  });
});

describe('the waiting tickets', () => {
  test('are the committed tickets of the page', () => {
    expect(pendingTicketCountOf([{ status: 'committed' }, { status: 'in-progress' }, { status: 'committed' }])).toBe(2);
  });

  test('are counted in words', () => {
    expect(waitingTicketsTextOf(3)).toBe('3 tickets wait for a pipeline');
    expect(waitingTicketsTextOf(1)).toBe('1 ticket waits for a pipeline');
    expect(waitingTicketsTextOf(0)).toBe('No ticket waits for a pipeline');
  });
});

describe('the pipeline agent\'s meter', () => {
  test('shows Hephaestus\'s default pair over five bars before any draft', () => {
    expect(pipelineAgentMeterOf(null, pipelineBoardStateOf('A0'))).toEqual({
      model: 'opus', effort: 'high', level: 3, levelCount: 5, accessibleName: 'Pipeline agent: opus, high effort',
    });
    const board = pipelineBoardStateOf('A0');
    expect(pipelineAgentMeterOf(null, { pipeline: { ...board.pipeline, agentDefaults: { model: 'sonnet', effort: 'low' } } }))
      .toMatchObject({ model: 'sonnet', effort: 'low', level: 1 });
  });

  test('counts its bars in the efforts the forge serves', () => {
    const board = pipelineBoardStateOf('A0');
    expect(pipelineAgentMeterOf(null, { pipeline: { ...board.pipeline, choices: { ...PIPELINE_CHOICES_FIXTURE, efforts: ['low', 'high'] } } }))
      .toMatchObject({ level: 2, levelCount: 2 });
  });

  test('shows the pair a draft names for the pipeline agent', () => {
    const record = setupRecordOf('A0b-running');
    const draft = record.draft === null ? null : { ...record.draft, agents: { pipelineAgent: { model: 'fable', effort: 'max', instructions: null } } } as const;
    expect(pipelineAgentMeterOf({ ...record, draft }, pipelineBoardStateOf('A0'))).toMatchObject({ model: 'fable', effort: 'max', level: 5 });
  });
});

describe('the panel head', () => {
  test('is not started before a setup, then says whether the agent\'s job runs', () => {
    expect(panelStatusOf(null, null)).toEqual({ tone: 'idle', text: 'Not started' });
    expect(panelStatusOf(setupRecordOf('A1'), null)).toEqual({ tone: 'idle', text: 'Stopped' });
    expect(panelStatusOf(setupRecordOf('A1'), 'running')).toEqual({ tone: 'working', text: 'Running' });
  });
});

describe('the cards', () => {
  test('word the login and the API key in Hephaestus\'s environment', () => {
    expect(BILLING_CARDS.map((card) => card.description)).toEqual([
      'Agents run on this machine\'s agent login. Usage counts against the plan\'s limits, such as its weekly window.',
      'Billed to the API key in Hephaestus\'s environment. The key is never stored.',
    ]);
  });
});

describe('the footer', () => {
  test('words the chosen billing, and the API key with its cap as typed', () => {
    expect(footerLinesOf({ mode: 'subscription', capText: '' })).toEqual({ summary: 'Subscription', detail: 'Agents run on this machine\'s agent login.' });
    expect(footerLinesOf({ mode: 'api', capText: ' ' })).toEqual({ summary: 'API key', detail: 'Billed to the API key. No cap per launch.' });
    expect(footerLinesOf({ mode: 'api', capText: '12.5' })).toEqual({ summary: 'API key', detail: 'Billed to the API key. A cap of US$ 12.5 per launch.' });
  });
});
