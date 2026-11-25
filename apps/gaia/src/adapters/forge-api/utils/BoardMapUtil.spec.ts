/**
 * The board mapper against its own contract, on parts the recorded board does not hold. What matters: a ticket's absent fields read as
 * `null` or empty and a held ready ticket as held; a task row's absent phases stay `null`, apart from a row with none; a note in the log
 * carries no id lists; every forecast step keeps its kind; an interrupted job keeps its cause and its lost line, and takes what it waits
 * for from presence, `null` where presence lists it not; a refusal and a question's
 * answer keep the forge's values unchanged; the recorded board maps whole; and the board in the spec-then-plan route keeps a ticket's
 * documents summary only on the ticket that has documents, each draft's stage, wait and agent, and a spec agent's question with its letters,
 * its document, its anchor and its placement on the head.
 */
import { describe, expect, test }  from 'bun:test';
import type { ForgeBoardDocument } from 'forge-contracts/ForgeBoardDocument';

import type { ResumeWaitsOfJobs }     from '../@types/ResumeWaitsOfJobs.ts';
import { BoardStateIngestion }        from '../BoardStateIngestion.ts';
import { recordedBoardDocumentOf }    from '../testing/BoardDocuments.ts';
import {
  RECORDED_BOOKSHOP_TRACKER_ID,
  RECORDED_TICKET_IDS,
  recordedQuestionBoardDocumentOf,
  recordedSpecThenPlanBoardDocument
} from '../testing/TicketDocumentsRecordings.ts';
import { BoardMapUtil }    from './BoardMapUtil.ts';
import { PipelineMapUtil } from './PipelineMapUtil.ts';

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

describe('the board in the spec-then-plan route', () => {
  test('keeps the documents summary of the ticket that has documents, and adds no key to a ticket that has none', async () => {
    const reading = new BoardStateIngestion().boardOf(RECORDED_BOOKSHOP_TRACKER_ID, await recordedSpecThenPlanBoardDocument());
    if (reading.board === null) throw new Error(`The spec-then-plan board does not ingest: ${reading.reason.invalidKeys.join(', ')}`);
    const ticketsById = new Map(reading.board.page.tickets.map((ticket) => [ticket.id, ticket]));
    expect(ticketsById.get(RECORDED_TICKET_IDS.withDocuments)?.documents).toEqual({
      spec:      { standing: 'drafting', headNumber: 1, approvedNumber: null },
      plan:      { standing: 'unwritten', headNumber: null, approvedNumber: null },
      buildHeld: false,
    });
    expect(Object.hasOwn(ticketsById.get(RECORDED_TICKET_IDS.withoutDocuments) ?? {}, 'documents')).toBe(false);
  });

  test('keeps each draft\'s stage, what waits on User, its agent and when the wait began, and no wait once nothing waits', async () => {
    const reading = new BoardStateIngestion().boardOf(RECORDED_BOOKSHOP_TRACKER_ID, await recordedQuestionBoardDocumentOf('ticket-documents-question-open'));
    if (reading.board === null) throw new Error(`The board with a question does not ingest: ${reading.reason.invalidKeys.join(', ')}`);
    const draftOf = (ticketId: string) => reading.board?.page.tickets.find((ticket) => ticket.id === ticketId)?.draft;
    expect(draftOf(RECORDED_TICKET_IDS.withDocuments)).toEqual({
      stage: 'spec', waitsOnUser: 'answer', agent: null, waitingSince: reading.board.decisions[0]?.openedAt ?? ''
    });
    expect(draftOf(RECORDED_TICKET_IDS.withoutDocuments)).toEqual({
      stage: 'spec', waitsOnUser: null, agent: null, waitingSince: null
    });
  });

  test('keeps a spec agent\'s question with its lettered options, its document, its anchor and where its line stands on the head', async () => {
    const reading = new BoardStateIngestion().boardOf(RECORDED_BOOKSHOP_TRACKER_ID, await recordedQuestionBoardDocumentOf('ticket-documents-question-open'));
    const [question] = reading.board?.decisions ?? [];
    expect(question?.questions[0]?.options.map((option) => [option.letter, option.recommended])).toEqual([['a', true], ['b', false], ['c', false]]);
    expect([question?.document, question?.placement]).toEqual(['spec', { from: 3, to: 3 }]);
    expect(question?.anchor).toEqual({
      view:             'code',
      versionNumber:    1,
      lines:            { from: 3, to: 3 },
      columns:          null,
      sectionPath:      ['Search by author'],
      quote:            null,
      surroundingLines: { from: 1, to: 5 },
      diagram:          null,
    });
  });

  test('a decision no document agent asked names no document, anchor or placement', async () => {
    const reading = new BoardStateIngestion().boardOf(EXAMPLE_TRACKER_ID, await recordedDocument());
    const decision = reading.board?.decisions[0];
    expect([decision?.document, decision?.anchor, decision?.placement]).toEqual([null, null, null]);
  });

  test('reads the default instructions of the spec and plan agents as of every other role', async () => {
    const reading = new BoardStateIngestion().boardOf(RECORDED_BOOKSHOP_TRACKER_ID, await recordedSpecThenPlanBoardDocument());
    expect(reading.board?.limits.defaultInstructionsOfRole.planAgent).toEqual([{ kind: 'constitution' }, { kind: 'default-brief', role: 'planAgent' }]);
  });
});
