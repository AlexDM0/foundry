/**
 * The board document's ingestion over the documents a scratch forge at the supported forge version answered (`overseer-fetch-board`). What
 * matters: every served fact of the forge's board maps to its field of Gaia's model unchanged, the attention entries with their typed
 * target, the worded notices, today's figures with their date, the open decisions in answering order, each ticket's facts and offers, each
 * job's stop holds and offers, the effective pipelines, the limits, an option's recommendation beside its unmarked label, the entities
 * draft with its refusals and their typed fix, the Apply refusal and the step run times; a missing key, or a value outside a value list,
 * makes the document malformed and is named; a key Gaia does not read is passed over, and so is a key Gaia names as passed over.
 */
import { describe, expect, test } from 'bun:test';

import { BoardStateIngestion, type BoardReading }       from './BoardStateIngestion.ts';
import { RECORDED_TRACKER_ID, recordedBoardDocumentOf } from './testing/BoardDocuments.ts';

type MutableDocument = Record<string, unknown>;

const INGESTION = new BoardStateIngestion();

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
    expect(board.overseer).toEqual({ state: 'serving', paused: false, codeVersion: expect.any(String) });
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
    expect(board.today).toEqual({ calendarDate: '2026-11-21', deliveredTickets: 0, tokens: 0 });
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
    const assistant = board.jobs.find((job) => job.id === 'J1');
    expect(assistant?.stopHolds).toEqual({ stop: 'stopped by User (J1)', windDown: 'wound down by User (J1)' });
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
    expect(Object.keys(limits.defaultInstructionsOfRole)).toHaveLength(7);
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
      billing: 'done', research: 'done', constitution: 'done', design: 'done', apply: 'not-started', entities: 'done'
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
    expect(board.overseer.state).toBe('held-by-install-change');
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
    recordAt(document, ['overseer'])['batonPassWarning'] = 'example';
    expect(boardOf(INGESTION.boardOf(RECORDED_TRACKER_ID, document))).toEqual(recorded);
  });
});
