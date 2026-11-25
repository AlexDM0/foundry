/**
 * The billing step's model. What matters: the cards are the ways the record's agent's vendor bills, in forge's order with its default
 * first, worded from the served facts (the vendor's display name) with the key's variable as forge serves it, and none for a vendor that
 * bills no way; the
 * choice is the record's billing, else the default, unsaved; the cap is sent as typed once it is a number (Hephaestus, not the board,
 * refuses a cap that is not positive) and never on a way whose launch takes none; a billing change is sent only when the choice differs
 * from the record's or the record has none; Continue saves first when it must and exists only at billing; the waiting tickets are the
 * committed ones; the pipeline agent's meter shows its pair over five bars, the default pair until a draft names one; the panel head says
 * the agent is not started until the record names its job, then whether its job runs; the footer words the chosen billing and its cap.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardSetupRecordDocument }                                              from '../../../../@types/board/BoardPipelineDocuments.ts';
import { EXAMPLE_AGENT_KEY_VARIABLE_NAME, EXAMPLE_PIPELINE_AGENT, exampleBoardAgent } from '../../../testing/AgentFixture.ts';
import { PIPELINE_CHOICES_FIXTURE, pipelineBoardStateOf }                             from '../../../testing/PipelineFixture.ts';
import { BillingStepModel, type BillingCard }                                         from './BillingStepModel.ts';

const {
  billingCardsOf, billingChoiceOf, billingOf, billingChangeCommandOf, continueCommandsOf, pendingTicketCountOf, waitingTicketsTextOf,
  pipelineAgentMeterOf, panelStatusOf, footerLinesOf
} = BillingStepModel;

function setupRecordOf(name: 'A0b-running' | 'A0b-at-billing' | 'A0b-at-billing-api' | 'A1'): BoardSetupRecordDocument {
  const record = pipelineBoardStateOf(name).pipeline.setup?.record;
  if (record === undefined) throw new Error(`the fixture ${name} has no setup record`);
  return record;
}

const AGENT_FACTS = { agent: exampleBoardAgent() };

const CARDS = billingCardsOf(AGENT_FACTS, setupRecordOf('A0b-at-billing'));

const UNCAPPED_KEY_CARDS: readonly BillingCard[] = CARDS.map((card) => ({ ...card, capsEachLaunch: false }));

const CONTINUE = {
  boardCommandVersion: 3, kind: 'pipeline-setup-step', setupId: 'S1', step: 'billing', move: 'continue'
} as const;

describe('the cards', () => {
  test('are the vendor\'s ways to bill in forge\'s order, the first its default, worded from what forge serves', () => {
    expect(CARDS).toEqual([
      {
        mode:            'subscription',
        label:           'Subscription',
        description:     'Agents run on this machine\'s Example Agent login. Usage counts against the plan\'s limits, such as its weekly window.',
        isDefault:       true,
        keyVariableName: null,
        capsEachLaunch:  false,
      },
      {
        mode:            'api',
        label:           'API key',
        description:     'Billed to the API key in Hephaestus\'s environment. The key is never stored.',
        isDefault:       false,
        keyVariableName: EXAMPLE_AGENT_KEY_VARIABLE_NAME,
        capsEachLaunch:  true,
      },
    ]);
  });

  test('follow the record\'s vendor: one whose key comes first makes it the default, and one that bills no way offers none', () => {
    const { vendors } = exampleBoardAgent();
    const keyFirst = vendors.map((vendor) => ({ ...vendor, billingOptions: [...vendor.billingOptions].reverse() }));
    expect(billingCardsOf({ agent: exampleBoardAgent({ vendors: keyFirst }) }, setupRecordOf('A0b-at-billing')).map((card) => [card.mode, card.isDefault]))
      .toEqual([['api', true], ['subscription', false]]);
    const laterVendorRecord = { ...setupRecordOf('A0b-at-billing'), agent: { ...EXAMPLE_PIPELINE_AGENT, vendor: 'second-example-agent' } };
    expect(billingCardsOf(AGENT_FACTS, laterVendorRecord)).toEqual([]);
  });

  test('carry no key variable where forge names none', () => {
    const vendors = exampleBoardAgent().vendors.map((vendor) => ({ ...vendor, billingOptions: vendor.billingOptions.map((option) => ({ ...option, keyVariableName: null })) }));
    expect(billingCardsOf({ agent: exampleBoardAgent({ vendors }) }, setupRecordOf('A0b-at-billing'))[1]?.keyVariableName).toBeNull();
  });
});

describe('the choice', () => {
  test('is the record\'s billing, else the vendor\'s default, unsaved', () => {
    expect(billingChoiceOf(null, CARDS)).toEqual({ mode: 'subscription', capText: '' });
    expect(billingChoiceOf(null, [...CARDS].reverse())).toEqual({ mode: 'api', capText: '' });
    expect(billingChoiceOf({ mode: 'api', maximumBudgetDollars: 5 }, CARDS)).toEqual({ mode: 'api', capText: '5' });
    expect(billingChoiceOf({ mode: 'api', maximumBudgetDollars: null }, CARDS)).toEqual({ mode: 'api', capText: '' });
  });

  test('sends the cap as typed once it is a number, none when the field is empty, and nothing for text that is no number', () => {
    expect(billingOf({ mode: 'subscription', capText: '25' }, CARDS)).toEqual({ mode: 'subscription' });
    expect(billingOf({ mode: 'api', capText: ' 12.5 ' }, CARDS)).toEqual({ mode: 'api', maximumBudgetDollars: 12.5 });
    expect(billingOf({ mode: 'api', capText: '' }, CARDS)).toEqual({ mode: 'api', maximumBudgetDollars: null });
    expect(billingOf({ mode: 'api', capText: 'ten' }, CARDS)).toBeNull();
  });

  test('a cap that is not positive is still sent, so Hephaestus\'s refusal shows', () => {
    expect(billingOf({ mode: 'api', capText: '0' }, CARDS)).toEqual({ mode: 'api', maximumBudgetDollars: 0 });
  });

  test('a key whose launch takes no cap sends none, whatever the field held', () => {
    expect(billingOf({ mode: 'api', capText: '12' }, UNCAPPED_KEY_CARDS)).toEqual({ mode: 'api', maximumBudgetDollars: null });
  });
});

describe('the commands', () => {
  test('a billing change is sent only when the choice differs from the record, or the record has none', () => {
    const record = setupRecordOf('A0b-running');
    expect(billingChangeCommandOf(record, { mode: 'subscription', capText: '' }, CARDS)).toBeNull();
    expect(billingChangeCommandOf(record, { mode: 'api', capText: '8' }, CARDS)).toEqual({
      boardCommandVersion: 3, kind: 'pipeline-setup-billing', setupId: 'S1', billing: { mode: 'api', maximumBudgetDollars: 8 }
    });
    expect(billingChangeCommandOf(setupRecordOf('A0b-at-billing'), { mode: 'subscription', capText: '' }, CARDS)).toEqual({
      boardCommandVersion: 3, kind: 'pipeline-setup-billing', setupId: 'S1', billing: { mode: 'subscription' }
    });
  });

  test('Continue at billing saves a choice the record does not hold first, and only continues when it holds it', () => {
    expect(continueCommandsOf(setupRecordOf('A0b-at-billing'), { mode: 'subscription', capText: '' }, CARDS)).toEqual([
      {
        boardCommandVersion: 3, kind: 'pipeline-setup-billing', setupId: 'S1', billing: { mode: 'subscription' }
      },
      CONTINUE,
    ]);
    expect(continueCommandsOf(setupRecordOf('A0b-at-billing-api'), { mode: 'api', capText: '20' }, CARDS)).toEqual([CONTINUE]);
  });

  test('Continue waits on a cap that is no number, and a record past billing has no Continue here', () => {
    expect(continueCommandsOf(setupRecordOf('A0b-at-billing'), { mode: 'api', capText: 'ten' }, CARDS)).toBeNull();
    expect(continueCommandsOf(setupRecordOf('A1'), { mode: 'subscription', capText: '' }, CARDS)).toBeNull();
    expect(continueCommandsOf(setupRecordOf('A0b-running'), { mode: 'subscription', capText: '' }, CARDS)).toBeNull();
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
  test('is not started until the record names its job, then says whether the job runs, or that forge did not launch it rather than Running', () => {
    expect(panelStatusOf(setupRecordOf('A0b-at-billing'), 'stopped')).toEqual({ tone: 'idle', text: 'Not started' });
    expect(panelStatusOf(setupRecordOf('A1'), 'stopped')).toEqual({ tone: 'idle', text: 'Stopped' });
    expect(panelStatusOf(setupRecordOf('A1'), 'running')).toEqual({ tone: 'working', text: 'Running' });
    expect(panelStatusOf(setupRecordOf('A1'), 'not-launched')).toEqual({ tone: 'failed', text: 'Not launched' });
  });
});

describe('the footer', () => {
  test('words the chosen billing, the key it bills, and its cap as typed where a launch takes one', () => {
    expect(footerLinesOf({ mode: 'subscription', capText: '' }, CARDS, 'Example Agent'))
      .toEqual({ summary: 'Subscription', detail: 'Agents run on this machine\'s Example Agent login.' });
    expect(footerLinesOf({ mode: 'api', capText: ' ' }, CARDS, 'Example Agent'))
      .toEqual({ summary: 'API key', detail: 'Billed to the API key. No cap per launch.' });
    expect(footerLinesOf({ mode: 'api', capText: '12.5' }, CARDS, 'Example Agent'))
      .toEqual({ summary: 'API key', detail: 'Billed to the API key. A cap of US$ 12.5 per launch.' });
    expect(footerLinesOf({ mode: 'api', capText: '12.5' }, UNCAPPED_KEY_CARDS, 'Example Agent'))
      .toEqual({ summary: 'API key', detail: 'Billed to the API key.' });
  });
});
