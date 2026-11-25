/**
 * The board document's ingestion over the documents a scratch forge at the supported forge version answered (`hephaestus-fetch-board`). What
 * matters: every served fact of the forge's board maps to its field of Gaia's model unchanged, the attention entries with their typed
 * target, the worded notices, today's figures with their date, the open decisions in answering order, each ticket's facts and offers, each
 * job's stop holds and offers, the effective pipelines, the limits, an option's recommendation beside its unmarked label, the entities
 * draft with its refusals and their typed fix, the Apply refusal and the step run times; the Assistant's switch is the stored pipeline's
 * `assistant` key, read from the boards recorded after it was switched off and on, off while no readable pipeline is stored; the forge's agent
 * as the forge serves it, from the first setup record at its agent step with no agent chosen, through the agent chosen and its program
 * running, to a job standing not launched once that program is gone, with the forge's sentence; a missing
 * key, or a value outside a value list, makes the document malformed and is named; a key Gaia does not read is passed over, and so is a
 * key Gaia names as passed over.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardAgent }                                                      from '../../shared/@types/board/BoardAgent.ts';
import { BoardStateIngestion, type BoardReading }                               from './BoardStateIngestion.ts';
import { RECORDED_TRACKER_ID, recordedBoardDocumentOf, recordedCalendarDateOf } from './testing/BoardDocuments.ts';

type MutableDocument = Record<string, unknown>;

const INGESTION = new BoardStateIngestion();

/** A day as the forge writes it: year, month and day of month. */
const CALENDAR_DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

async function boardAtWorkDocument(): Promise<MutableDocument> {
  return structuredClone(await recordedBoardDocumentOf('board-at-work')) as MutableDocument;
}

function boardOf(reading: BoardReading) {
  if (reading.board === null) throw new Error(`The board did not read: ${reading.reason.invalidKeys.join(', ')}.`);
  return reading.board;
}

function recordAt(document: MutableDocument, path: readonly (string | number)[]): MutableDocument {
  let value: unknown = document;
  for (const step of path) value = (value as Record<string | number, unknown>)[step];
  return value as MutableDocument;
}

describe('boardOf, on the board of a forge at work', () => {
  test('stamps the board with the forge it was read from, which the document does not name', async () => {
    const board = boardOf(INGESTION.boardOf(RECORDED_TRACKER_ID, await boardAtWorkDocument()));
    expect(board.trackerId).toBe(RECORDED_TRACKER_ID);
    expect(board.project).toBe('Example Storefront');
    expect(board.hephaestus).toEqual({ state: 'serving', paused: false, codeVersion: expect.any(String) });
  });

  test('keeps the attention entries in the forge\'s order, each with its typed target', async () => {
    const board = boardOf(INGESTION.boardOf(RECORDED_TRACKER_ID, await boardAtWorkDocument()));
    expect(board.attention.map(({
      key, kind, actionLabel, target
    }) => ({
      key, kind, actionLabel, target
    }))).toEqual([
      {
        key: 'decision:E2', kind: 'escalated-question', actionLabel: 'Answer', target: { subject: 'decision', id: 'E2' }
      },
      {
        key: 'ticket:001', kind: 'draft-ticket', actionLabel: 'Ready', target: { subject: 'ticket', id: '001' }
      },
    ]);
    expect(board.attention[0]?.escalatedFromIncidentId).toBe('I3');
  });

  test('keeps a notice\'s kind, facts, sentence and cause sentence as the forge worded them', async () => {
    const board = boardOf(INGESTION.boardOf(RECORDED_TRACKER_ID, await boardAtWorkDocument()));
    expect(board.notices).toEqual([{
      kind:          'incident-defaulted',
      facts:         { incidentId: 'I2', move: 'incident-escalate', cause: 'turn-closed' },
      sentence:      'incident I2 took its default, incident-escalate: its delivery turn closed',
      causeSentence: 'its delivery turn closed',
    }]);
    expect(board.warnings).toEqual([]);
  });

  test('keeps today\'s figures with the date they were counted on, and the open decisions in answering order with the escalated ones', async () => {
    const board = boardOf(INGESTION.boardOf(RECORDED_TRACKER_ID, await boardAtWorkDocument()));
    expect(board.today).toEqual({ calendarDate: await recordedCalendarDateOf('board-at-work'), deliveredTickets: 0, tokens: 0 });
    expect(board.today.calendarDate).toMatch(CALENDAR_DATE_SHAPE);
    expect(board.openDecisionIds).toEqual(['E2']);
    expect(board.escalatedDecisionIds).toEqual(['E2']);
  });

  test('keeps a decision option\'s unmarked label beside its recommendation, and fills what an option leaves out', async () => {
    const board = boardOf(INGESTION.boardOf(RECORDED_TRACKER_ID, await boardAtWorkDocument()));
    expect(board.decisions[0]?.questions[0]?.options).toEqual([
      {
        label:            'Card first',
        description:      'The card form opens at once.',
        recommended:      true,
        touches:          ['apps/web/checkout.ts'],
        tradeOff:         'One step fewer.',
        acceptanceEffect: null,
      },
      {
        label: 'Choice first', description: 'The shopper picks a way to pay first.', recommended: false, touches: [], tradeOff: null, acceptanceEffect: null
      },
    ]);
  });

  test('keeps each ticket\'s served facts and the commands it accepts now', async () => {
    const board = boardOf(INGESTION.boardOf(RECORDED_TRACKER_ID, await boardAtWorkDocument()));
    const draftTicket = board.page.tickets.find((ticket) => ticket.id === '001');
    expect(draftTicket?.facts).toEqual({
      resolvedPriority:     'normal',
      settlesADependency:   false,
      isClosed:             false,
      noAgentHasPickedItUp: true,
      reviewRound:          null,
      isRepeatReview:       false,
    });
    expect(draftTicket?.offers).toEqual({ kinds: ['ticket-hold', 'ticket-park', 'ticket-network', 'ticket-priority'], priorityChoices: ['high', 'low'] });
    expect(draftTicket?.priority).toBeNull();
    expect(board.page.facts.readyTickets).toEqual([{ id: '002', isHeld: false }]);
  });

  test('keeps each job\'s stop holds as the forge words them and what it accepts now', async () => {
    const board = boardOf(INGESTION.boardOf(RECORDED_TRACKER_ID, await boardAtWorkDocument()));
    const assistant = board.jobs.find((job) => job.role === 'assistant');
    expect(assistant?.stopHolds).toEqual({ stop: `stopped by User (${assistant?.id})`, windDown: `wound down by User (${assistant?.id})` });
    expect(assistant?.offers).toEqual({ stopModes: ['stop', 'wind-down'], takesFresh: false, takesMessage: true });
    expect(assistant?.interruption).toBeNull();
  });

  test('keeps the limits and defaults the forge\'s rules apply', async () => {
    const { limits } = boardOf(INGESTION.boardOf(RECORDED_TRACKER_ID, await boardAtWorkDocument()));
    expect(limits).toMatchObject({
      concurrency:                { lowest: 1, ceiling: 10, defaultLimit: 2 },
      workerModel:                'opus',
      workerEffort:               'medium',
      reworkRoundThresholdLines:  750,
      defaultTicketPriority:      'normal',
      firstRepeatReviewRound:     2,
      reReviewThresholdStepLines: 50,
      minimumBarWidthPercent:     0.6,
    });
    expect(limits.defaultInstructionsOfRole.builder).toEqual([{ kind: 'constitution' }, { kind: 'default-brief', role: 'builder' }]);
    expect(Object.keys(limits.defaultInstructionsOfRole)).toHaveLength(9);
    expect([limits.defaultInstructionsOfRole.specAgent, limits.defaultInstructionsOfRole.planAgent]).toEqual([
      [{ kind: 'constitution' }, { kind: 'default-brief', role: 'specAgent' }],
      [{ kind: 'constitution' }, { kind: 'default-brief', role: 'planAgent' }],
    ]);
  });

  test('keeps the applied pipeline with each entity\'s effective pipeline', async () => {
    const { pipeline } = boardOf(INGESTION.boardOf(RECORDED_TRACKER_ID, await boardAtWorkDocument()));
    if (pipeline.applied.readingVerdict !== 'readable') throw new Error('The recorded pipeline is readable.');
    expect(Object.keys(pipeline.applied.entityPipelines)).toEqual(['web', 'api']);
    expect(pipeline.applied.application).toMatchObject({ appliedRevision: 1 });
    expect(pipeline.applied.pipeline.entities?.['web']).toMatchObject({
      kind: 'app', home: ['/apps/web'], whitelist: [], concurrency: null
    });
  });

  test('reads the Assistant\'s switch from the stored pipeline as the forge served it: off once switched off, the key gone, and on once switched on again', async () => {
    expect(boardOf(INGESTION.boardOf(RECORDED_TRACKER_ID, await boardAtWorkDocument())).assistantIsOn).toBe(true);
    const switchedOff = await recordedBoardDocumentOf('assistant-switched-off') as MutableDocument;
    expect(Object.hasOwn(recordAt(switchedOff, ['pipeline', 'pipeline']), 'assistant')).toBe(false);
    expect(boardOf(INGESTION.boardOf(RECORDED_TRACKER_ID, switchedOff)).assistantIsOn).toBe(false);
    expect(boardOf(INGESTION.boardOf(RECORDED_TRACKER_ID, await recordedBoardDocumentOf('assistant-switched-on'))).assistantIsOn).toBe(true);
  });

  test('reads the Assistant\'s switch as off while no readable pipeline is stored', async () => {
    const withoutPipeline = await boardAtWorkDocument();
    withoutPipeline['pipeline'] = { readingVerdict: 'absent' };
    expect(boardOf(INGESTION.boardOf(RECORDED_TRACKER_ID, withoutPipeline)).assistantIsOn).toBe(false);
  });

  test('keeps the entities draft: each entity\'s effective pipeline and dependents, its refusals with their row and typed fix', async () => {
    const { setup } = boardOf(INGESTION.boardOf(RECORDED_TRACKER_ID, await boardAtWorkDocument())).pipeline;
    expect(Object.keys(setup?.draftEntities ?? {})).toEqual(['web', 'api']);
    expect(setup?.draftEntities['web']).toEqual({
      effectivePipeline: expect.objectContaining({
        gates: [{
          name: 'unit', run: 'echo Example gate passed', fix: null, runsIn: null, network: [], writes: []
        }]
      }),
      dependentEntityKeys: [],
    });
    expect(setup?.entityRefusals).toEqual([{
      reason:     'equal-homes',
      entityKeys: ['web', 'api'],
      shownOn:    'api',
      sentence:   'Pipeline setup S2\'s draft cannot be stored as it is: the entities web, api share the home "/apps/web". Continue and Apply wait until it is fixed.',
      fix:        {
        label: 'Remove apps/web from api',
        edits: [{ target: 'entity', entityKey: 'api', value: { kind: 'app', home: ['/apps/api'], summary: null } }],
      },
    }]);
  });

  test('keeps the Apply refusal the forge serves, its code, fields and sentence unchanged', async () => {
    const { setup } = boardOf(INGESTION.boardOf(RECORDED_TRACKER_ID, await boardAtWorkDocument())).pipeline;
    expect(setup?.applyRefusal).toEqual({
      code:     'entity-refusals-stand',
      fields:   { setupId: 'S2', reasons: ['equal-homes'] },
      sentence: expect.stringMatching(/^Pipeline setup S2's draft still holds 1 entity refusal \(equal-homes\)/),
    });
    expect(setup?.record.stepStates).toEqual({
      billing: 'done', agent: 'done', research: 'done', constitution: 'done', design: 'done', apply: 'not-started', entities: 'done'
    });
  });

  test('keeps each step line\'s newest run time with its entity, kind, name, phase and ending', async () => {
    const { pipeline } = boardOf(INGESTION.boardOf(RECORDED_TRACKER_ID, await boardAtWorkDocument()));
    expect(pipeline.stepRunTimes).toEqual([{
      entity:          'web',
      stepKind:        'gate',
      stepName:        'unit',
      phase:           'build',
      runMilliseconds: expect.any(Number),
      ending:          'passed',
      at:              expect.any(String),
    }]);
  });

  test('reads the board a forge serves while an install change holds its launches', async () => {
    const board = boardOf(INGESTION.boardOf(RECORDED_TRACKER_ID, await recordedBoardDocumentOf('board-install-held')));
    expect(board.hephaestus.state).toBe('held-by-install-change');
  });
});

describe('boardOf, on a forge\'s agent', () => {
  test('reads a first setup record at its agent step with no agent chosen, and the places the installers put the vendor\'s program', async () => {
    const document = await recordedBoardDocumentOf('setup-choosing-agent') as MutableDocument;
    const board = boardOf(INGESTION.boardOf(RECORDED_TRACKER_ID, document));
    expect(board.agent).toEqual({
      vendors:            recordAt(document, ['agent'])['vendors'] as BoardAgent['vendors'],
      choice:             null,
      machineProgramPath: null,
      programPath:        null,
      check:              null,
      places:             [
        { path: '/Users/example/.bun/bin/bun', found: true },
        { path: '/opt/homebrew/bin/bun', found: false },
        { path: '/usr/local/bin/bun', found: false },
        { path: '/Users/example/.local/bin/bun', found: false },
      ],
      toolsListed: false,
      tools:       [{
        name: 'git', path: expect.any(String), approved: true, usedBy: [{ kind: 'every-job', name: null, entity: null }]
      }],
    });
    const record = board.pipeline.setup?.record;
    expect(record?.currentStep).toBe('agent');
    expect(record?.agent).toBeNull();
    expect(record?.stepStates).toMatchObject({ billing: 'done', agent: 'in-progress', research: 'not-started' });
    expect(record?.tools).toEqual(board.agent.tools);
    expect(board.jobs).toEqual([]);
  });

  test('reads the agent chosen, pinned to its program, which runs with its version, beside the applied pipeline and the update that follow it', async () => {
    const document = await boardAtWorkDocument();
    const [vendor] = recordAt(document, ['agent'])['vendors'] as { vendor: string }[];
    const board = boardOf(INGESTION.boardOf(RECORDED_TRACKER_ID, document));
    const choice = { vendor: vendor?.vendor, program: { pinned: '/Users/example/.bun/bin/bun' } };
    expect(board.agent).toMatchObject({ choice, programPath: '/Users/example/.bun/bin/bun', check: { verdict: 'runs', version: expect.any(String) } });
    expect(board.pipeline.applied).toMatchObject({ pipeline: { agent: choice, tools: null } });
    expect(board.pipeline.setup?.record).toMatchObject({ currentStep: 'design', agent: choice, tools: board.agent.tools });
    expect(board.jobs.map((job) => job.notLaunched)).toEqual(board.jobs.map(() => null));
  });

  test('reads a job standing not launched with the forge\'s cause, program and sentence, and the program looked at again that does not run', async () => {
    const board = boardOf(INGESTION.boardOf(RECORDED_TRACKER_ID, await recordedBoardDocumentOf('job-not-launched')));
    const vanishedProgramPath = '/Users/example/.local/bin/example-agent';
    const sentence = `the Claude Code at ${vanishedProgramPath} is not there`;
    expect(board.jobs.flatMap((job) => (job.notLaunched === null ? [] : [{ role: job.role, notLaunched: job.notLaunched }]))).toEqual([
      { role: 'product-owner', notLaunched: { cause: 'not-there', programPath: vanishedProgramPath, sentence } },
    ]);
    const check = { verdict: 'does-not-run', cause: 'not-there', sentence };
    expect(board.agent).toMatchObject({ choice: { program: { pinned: vanishedProgramPath } }, programPath: vanishedProgramPath, check });
  });
});

describe('boardOf, on a document Gaia cannot read', () => {
  test('names every key Gaia reads that is missing, nested keys as paths', async () => {
    const document = await boardAtWorkDocument();
    delete recordAt(document, ['today'])['calendarDate'];
    delete document['openDecisionIds'];
    delete recordAt(document, ['pipelineSetup', 'entityRefusals', 0])['shownOn'];
    expect(INGESTION.boardOf(RECORDED_TRACKER_ID, document)).toEqual({
      board:  null,
      reason: { invalidKeys: ['pipelineSetup.entityRefusals[0].shownOn', 'today.calendarDate', 'openDecisionIds'] },
    });
  });

  test('names a value outside a value list Gaia maps', async () => {
    const document = await boardAtWorkDocument();
    recordAt(document, ['page', 'tickets', 0])['status'] = 'example-added-status';
    recordAt(document, ['jobs', 0])['state'] = 'example-added-state';
    expect(INGESTION.boardOf(RECORDED_TRACKER_ID, document)).toEqual({ board: null, reason: { invalidKeys: ['page.tickets[0].status', 'jobs[0].state'] } });
  });

  test('names a cause of a job not launched outside the value list, and a program check whose cause is outside it as a whole', async () => {
    const document = structuredClone(await recordedBoardDocumentOf('job-not-launched')) as MutableDocument;
    const notLaunchedJobIndex = (document['jobs'] as MutableDocument[]).findIndex((job) => job['notLaunched'] !== null);
    recordAt(document, ['jobs', notLaunchedJobIndex, 'notLaunched'])['cause'] = 'example-added-cause';
    recordAt(document, ['agent', 'check'])['cause'] = 'example-added-cause';
    expect(INGESTION.boardOf(RECORDED_TRACKER_ID, document)).toEqual({ board: null, reason: { invalidKeys: [`jobs[${notLaunchedJobIndex}].notLaunched.cause`, 'agent.check'] } });
  });

  test('reads no board whose Assistant switch is no boolean', async () => {
    const document = await boardAtWorkDocument();
    recordAt(document, ['pipeline', 'pipeline'])['assistant'] = 'on';
    expect(INGESTION.boardOf(RECORDED_TRACKER_ID, document).board).toBeNull();
  });

  test('maps nothing of a body that is no object', () => {
    const reading = INGESTION.boardOf(RECORDED_TRACKER_ID, ['example']);
    expect(reading.board).toBeNull();
  });
});

describe('boardOf, on keys Gaia does not read', () => {
  test('passes over a key the forge adds, at the top and inside a part', async () => {
    const recorded = boardOf(INGESTION.boardOf(RECORDED_TRACKER_ID, await boardAtWorkDocument()));
    const document = await boardAtWorkDocument();
    document['exampleAddedFact'] = { example: true };
    recordAt(document, ['jobs', 0])['exampleAddedFact'] = 1;
    expect(boardOf(INGESTION.boardOf(RECORDED_TRACKER_ID, document))).toEqual(recorded);
  });

  test('passes over a key it names but no view reads, whatever it holds', async () => {
    const recorded = boardOf(INGESTION.boardOf(RECORDED_TRACKER_ID, await boardAtWorkDocument()));
    const document = await boardAtWorkDocument();
    delete document['confinement'];
    recordAt(document, ['hephaestus'])['restartWarning'] = 'example';
    expect(boardOf(INGESTION.boardOf(RECORDED_TRACKER_ID, document))).toEqual(recorded);
  });
});
