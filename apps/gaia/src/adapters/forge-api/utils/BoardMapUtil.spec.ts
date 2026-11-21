/**
 * The board mapper against its own contract, on parts the recorded board does not hold. What matters: a ticket's absent fields read as
 * `null` or empty and a held ready ticket as held; a task row's absent phases stay `null`, apart from a row with none; a note in the log
 * carries no id lists; every forecast step keeps its kind; an interrupted job keeps its cause and its lost line, and takes what it waits
 * for from presence, `null` where presence lists it not; a refusal and a question's
 * answer keep the forge's values unchanged; and the recorded board maps whole.
 */
import { describe, expect, test }  from 'bun:test';
import type { ForgeBoardDocument } from 'forge-contracts/ForgeBoardDocument';

import type { ResumeWaitsOfJobs }  from '../@types/ResumeWaitsOfJobs.ts';
import { recordedBoardDocumentOf } from '../testing/BoardDocuments.ts';
import { BoardMapUtil }            from './BoardMapUtil.ts';
import { PipelineMapUtil }         from './PipelineMapUtil.ts';

const EXAMPLE_TRACKER_ID = 'example-tracker';

async function recordedDocument(): Promise<ForgeBoardDocument> {
  return structuredClone(await recordedBoardDocumentOf('board-at-work')) as ForgeBoardDocument;
}

function boardOf(document: ForgeBoardDocument, resumeWaits: ResumeWaitsOfJobs = new Map()) {
  return BoardMapUtil.boardOf(EXAMPLE_TRACKER_ID, document, PipelineMapUtil.pipelineFactsOf(document), resumeWaits);
}

describe('boardOf', () => {
  test('fills a ticket\'s absent fields and keeps the ones it names', async () => {
    const document = await recordedDocument();
    const [recordedTicket] = document.page.tickets;
    if (recordedTicket === undefined) throw new Error('The recorded board holds a ticket.');
    const named = {
      ...recordedTicket, priority: 'high', hold: '', epics: ['example-epic'], releasesGroup: true, introducedBy: '009'
    } as const;
    const mapped = boardOf({ ...document, page: { ...document.page, tickets: [recordedTicket, named] } }).page.tickets;
    expect(mapped[0]).toMatchObject({
      priority: null, size: null, hold: null, epics: [], releasesGroup: false, dependsOn: [], entity: null, crosses: []
    });
    expect(mapped[0]).toMatchObject({ introducedBy: null, foundInReview: null });
    expect(mapped[1]).toMatchObject({
      priority: 'high', hold: '', epics: ['example-epic'], releasesGroup: true, introducedBy: '009'
    });
  });

  test('keeps a row\'s phases, `null` for a row filed before phases were kept, and a log note without id lists', async () => {
    const document = await recordedDocument();
    const { progress } = document.page.payload;
    const [row] = progress.tasks;
    if (row === undefined) throw new Error('The recorded board holds a row.');
    const { history: _history, ...rowWithoutPhases } = row;
    const changedProgress = {
      ...progress,
      tasks: [row, rowWithoutPhases],
      log:   [{ at: '2026-11-21T01:00:00+01:00', text: 'Example note' }, {
        at: '2026-11-21T01:00:01+01:00', text: 'Example record', taskIds: [1], ticketIds: []
      }],
      view: {
        kind: 'relative', from: '-2h', to: 'now', tickMinutes: null
      },
    } as const;
    const mapped = boardOf({ ...document, page: { ...document.page, payload: { ...document.page.payload, progress: changedProgress } } }).page.progress;
    expect(mapped.tasks[0]?.history).toEqual([{ status: 'committed', at: expect.any(String) }]);
    expect(mapped.tasks[1]?.history).toBeNull();
    expect(mapped.log.map(({ taskIds, ticketIds }) => ({ taskIds, ticketIds }))).toEqual([{ taskIds: null, ticketIds: null }, { taskIds: [1], ticketIds: [] }]);
    expect(mapped.view).toEqual({
      kind: 'relative', from: '-2h', to: 'now', tickMinutes: null
    });
  });

  test('keeps every kind of forecast step', async () => {
    const document = await recordedDocument();
    const steps = [
      { kind: 'build', attempt: 2, jobId: 'J7' },
      { kind: 'customs-and-gates', gateNames: ['unit'], jobId: null },
      { kind: 'review', round: 1, jobId: null },
      { kind: 'merge-approval', target: 'main' },
      { kind: 'land', target: null },
      { kind: 'integrate', target: 'main', group: 'example-group' },
    ] as const;
    const forecast = {
      ticketId: '002', steps, currentStepIndex: 0, dependents: [{ ticketId: '003', stillWaitingOnTicketIds: ['002'] }]
    };
    expect(boardOf({ ...document, ticketForecasts: [forecast] }).ticketForecasts).toEqual([forecast]);
  });

  test('keeps an interrupted job\'s cause, its lost line, the Airlock phase it holds and what presence says it waits for', async () => {
    const document = await recordedDocument();
    const [job] = document.jobs;
    if (job === undefined) throw new Error('The recorded board holds a job.');
    const interrupted = {
      ...job, state: 'interrupted', interruption: 'network-outage', lostLine: { line: 'gate', cause: 'reboot' }, airlock: { phase: 'merging' }
    } as const;
    expect(boardOf({ ...document, jobs: [interrupted] }, new Map([[job.id, 'instruction']])).jobs[0]).toMatchObject({
      state:        'interrupted',
      interruption: 'network-outage',
      lostLine:     { line: 'gate', cause: 'reboot' },
      airlockPhase: 'merging',
      waitsFor:     'instruction',
    });
    expect(boardOf({ ...document, jobs: [interrupted] }).jobs[0]?.waitsFor).toBeNull();
  });
});

describe('refusalOf and questionAnswerOf', () => {
  test('keep a refusal\'s code, fields and sentence unchanged', () => {
    const refusal = { code: 'example-refusal', fields: { setupId: 'S1', reasons: ['equal-homes'], count: 2 }, sentence: 'Example sentence.' };
    expect(BoardMapUtil.refusalOf(refusal)).toEqual(refusal);
  });

  test('tell chosen letters from free text, and keep an open question open', () => {
    const answeredAt = '2026-11-21T01:00:00+01:00';
    expect(BoardMapUtil.questionAnswerOf({ letters: ['a', 'c'], answeredAt })).toEqual({ form: 'letters', letters: ['a', 'c'], answeredAt });
    expect(BoardMapUtil.questionAnswerOf({ text: 'Example', answeredAt })).toEqual({ form: 'text', text: 'Example', answeredAt });
    expect(BoardMapUtil.questionAnswerOf(null)).toBeNull();
  });
});
