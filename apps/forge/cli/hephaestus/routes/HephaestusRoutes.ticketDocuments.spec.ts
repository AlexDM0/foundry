/**
 * A ticket's documents as the routes read them from a stored board. What matters: a reference that names no ticket, and a ticket with no
 * documents record, each answer 404 worded, and one whose record cannot be read answers that, never that it has none; a ticket whose record
 * holds a saved spec answers 200 with that version's text and the effect readings the source holds for that ticket alone; and a save
 * through the command route changes the ticket's fingerprint, so the next publish sends `documents` for it before `board`; and an effect
 * read through the command route asks the serving pass's readings, and is refused while no pass serves.
 */
import { readdirSync, rmSync } from 'node:fs';
import { join }                from 'node:path';
import {
  afterEach,
  beforeEach,
  expect,
  test
} from 'bun:test';
import type { ForgeTicketDocumentsDocument } from 'forge-contracts/TicketDocumentsDocument';

import { EventBroker, type HephaestusEvent }                             from '../../../src/services/hephaestus/EventBroker.ts';
import type { HephaestusRoutes }                                         from '../../../src/services/hephaestus/HephaestusServer.ts';
import { TicketDocumentsAssembly }                                       from '../../../src/services/hephaestus/TicketDocumentsAssembly.ts';
import type { BoardStore }                                               from '../../../src/services/store/BoardStore.ts';
import { localStoreLayoutOf }                                            from '../../../src/services/tracker/LocalStoreLayout.ts';
import { requireWorkspace }                                              from '../../../src/services/tracker/Workspace.ts';
import type { EffectReading, EffectReadingRequest, EffectReadingSource } from '../../../src/shared/@types/EffectReading.ts';
import { useRecordedGit }                                                from '../../../src/testing/RecordedGit.ts';
import { removeScratchDirectory }                                        from '../../../src/testing/ScratchWorkspace.ts';
import { talosChildReadingsWith }                                        from '../../../src/testing/TalosChildReadings.ts';
import { describeWhenGitIsRecorded }                                     from '../../../src/testing/ToolGuard.ts';
import { boardStoreIn }                                                  from '../../BoardStoreOf.ts';
import { createArgumentParser }                                          from '../../arguments/ArgumentParser.ts';
import { createCapturedCommandContext }                                  from '../../testing/CapturedCommandContext.ts';
import { createInitializedRecordedGitRepository }                        from '../../testing/InitializedScratchRepository.ts';
import { hephaestusRoutesOf }                                            from './HephaestusRoutes.ts';

const FROZEN_NOW = new Date('2026-11-24T10:00:00+01:00');

const SPEC_TEXT = '## Outcome\n\nThe basket shows its items.\n\n## Acceptance\n\nA1. The basket shows two items.\n';

const recordedGit = useRecordedGit();
let repositoryDirectory = '';

beforeEach(async () => {
  repositoryDirectory = await createInitializedRecordedGitRepository('ticket-documents-route', ['--project', 'Example Agency'], () => FROZEN_NOW, recordedGit);
});

afterEach(() => {
  removeScratchDirectory(repositoryDirectory);
});

function neverCalled(): never {
  throw new Error('The ticket documents route reads nothing of this.');
}

function effectReadingOf(ticketId: string): EffectReading {
  return {
    ticketId,
    document:             'spec',
    versionNumber:        1,
    state:                'read',
    durationMilliseconds: 1400,
    references:           [{ reference: 1, lines: { from: 3, to: 3 }, quote: 'The basket shows its items.' }],
    entries:              [{
      reference: 1, path: 'src/pages/Basket.tsx', change: 'adds', detail: 'A new page.', unresolvedReason: null, candidates: []
    }],
  };
}

/** Holds a reading for the given ticket and one for a ticket the route never asks about. */
function effectReadingsHolding(ticketId: string): EffectReadingSource {
  const readings = [effectReadingOf(ticketId), effectReadingOf('999')];
  return {
    readingsOf: (asked) => readings.filter((reading) => reading.ticketId === asked),
    request:    neverCalled,
    onChanged:  () => () => undefined,
  };
}

/** Keeps every reading asked of it, and holds none. */
function effectReadingsAsked(requests: EffectReadingRequest[]): EffectReadingSource {
  return {
    readingsOf: () => [],
    request:    (request) => { requests.push(request); },
    onChanged:  () => () => undefined,
  };
}

function routesOf(effectReadings?: EffectReadingSource | null): { routes: HephaestusRoutes; boardStore: BoardStore } {
  const context    = createCapturedCommandContext({ currentDirectory: repositoryDirectory, now: () => FROZEN_NOW });
  const workspace  = requireWorkspace(repositoryDirectory);
  const boardStore = boardStoreIn(context, workspace);
  const routes = hephaestusRoutesOf({
    commandArguments: createArgumentParser([]),
    context,
    workspace,
    boardStore,
    boardChildren:    talosChildReadingsWith(context.platformPorts),
    token:            () => null,
    started:          () => true,
    broker:           () => null,
    monitorStream:    () => null,
    monitorFacts:     () => null,
    wake:             () => undefined,
    launchesHeld:     () => false,
    onRuntimeCommand: () => Promise.resolve('done'),
    notices:          () => [],
    hephaestus:       () => ({
      state: 'serving', url: null, generation: 3, codeVersion: 'code-example', installVersion: 1, restartWarning: null
    }),
    ...(effectReadings === undefined ? {} : { effectReadings: () => effectReadings }),
  });
  return { routes, boardStore };
}

/** Files ticket 1 and opens its documents record, as a draft in the spec-then-plan route has; answers its id. */
async function ticketWithOpenRecord(routes: HephaestusRoutes, boardStore: BoardStore): Promise<string> {
  const filed = await routes.command({
    kind: 'ticket-add', title: 'Example ticket', type: 'ticket', dependsOn: [], epics: [], network: [], introducedBy: null, foundInReview: null, bodyText: null
  });
  expect(filed.status).toBe(200);
  const ticketId = boardStore.reads.listTickets().tickets[0]?.frontmatter.id ?? '';
  await boardStore.transactions.transact({
    at:     FROZEN_NOW.toISOString(),
    mutate: (transaction) => transaction.board.ticketDocuments().open(ticketId, FROZEN_NOW.toISOString()),
  });
  return ticketId;
}

async function savedSpec(routes: HephaestusRoutes): Promise<void> {
  const saved = await routes.command({
    kind: 'ticket-document-save', ticketReference: '1', document: 'spec', baseVersion: null, markdown: SPEC_TEXT
  });
  expect(saved.status).toBe(200);
}

describeWhenGitIsRecorded('a ticket\'s documents at the route', () => {
  test('a reference that names no ticket answers 404 no-readable-ticket', () => {
    const { routes } = routesOf();

    expect(routes.ticketDocuments('42')).toEqual({ status: 404, body: { refusal: 'no-readable-ticket', fields: { reference: '42' }, text: expect.any(String) } });
  });

  test('a ticket with no documents record answers 404 ticket-has-no-documents', async () => {
    const { routes, boardStore } = routesOf();
    await routes.command({
      kind: 'ticket-add', title: 'Example ticket', type: 'ticket', dependsOn: [], epics: [], network: [], introducedBy: null, foundInReview: null, bodyText: null
    });
    const ticketId = boardStore.reads.listTickets().tickets[0]?.frontmatter.id ?? '';

    expect(routes.ticketDocuments('1')).toEqual({ status: 404, body: { refusal: 'ticket-has-no-documents', fields: { ticketId }, text: expect.any(String) } });
  });

  test('a ticket whose documents record cannot be read answers 404 unreadable-file-in-the-way, never as a ticket with no documents', async () => {
    const { routes, boardStore } = routesOf();
    const ticketId = await ticketWithOpenRecord(routes, boardStore);
    await savedSpec(routes);
    const recordFolder = join(localStoreLayoutOf(requireWorkspace(repositoryDirectory)).ticketDocumentRecordsFolder, ticketId);
    for (const fileName of readdirSync(recordFolder).filter((name) => name.endsWith('.md'))) rmSync(join(recordFolder, fileName));

    const fields = expect.objectContaining({ record: 'ticket-documents' });
    expect(routes.ticketDocuments('1')).toEqual({ status: 404, body: { refusal: 'unreadable-file-in-the-way', fields, text: expect.any(String) } });
  });

  test('a ticket whose record holds a saved spec answers 200 with its text and the effect readings of that ticket alone', async () => {
    const { routes: commandRoutes, boardStore } = routesOf();
    const ticketId = await ticketWithOpenRecord(commandRoutes, boardStore);
    await savedSpec(commandRoutes);
    const { routes } = routesOf(effectReadingsHolding(ticketId));

    const answer = routes.ticketDocuments('1');

    expect(answer.status).toBe(200);
    const document = answer.body as ForgeTicketDocumentsDocument;
    expect(document.ticketId).toBe(ticketId);
    const spec = document.documents.find((candidate) => candidate.document === 'spec');
    expect([spec?.standing, spec?.markdown, spec?.head?.number, spec?.head?.author]).toEqual(['drafting', SPEC_TEXT, 1, 'person']);
    expect(document.effectReadings.map((reading) => [reading.document, reading.versionNumber, reading.state])).toEqual([['spec', 1, 'read']]);
  });

  test('a save through the command route changes the ticket\'s fingerprint, so the next publish sends documents before board', async () => {
    const { routes, boardStore } = routesOf();
    const ticketId = await ticketWithOpenRecord(routes, boardStore);
    const fingerprintsNow = () => TicketDocumentsAssembly.fingerprintsOf(boardStore.reads.requireBoard().ticketDocumentListing.records);
    const broker = EventBroker.createEventBroker(3);
    const events: HephaestusEvent[] = [];
    broker.subscribe((event) => events.push(event));
    const stateNow = () => routes.state() as Parameters<typeof broker.publishState>[0];
    broker.publishState(stateNow(), fingerprintsNow());

    await savedSpec(routes);
    broker.publishState(stateNow(), fingerprintsNow());

    expect(events.map((event) => [event.kind, event.kind === 'documents' ? event.data : null])).toEqual([
      ['board', null],
      ['documents', { ticketId }],
      ['board', null],
    ]);
  });

  test('an effect read through the command route asks the serving pass\'s readings for the person', async () => {
    const asked: EffectReadingRequest[] = [];
    const { routes, boardStore } = routesOf(effectReadingsAsked(asked));
    const ticketId = await ticketWithOpenRecord(routes, boardStore);
    await savedSpec(routes);

    const answer = await routes.command({
      kind: 'ticket-document-effect-read', ticketReference: '1', document: 'spec', version: 1
    });

    expect(answer.status).toBe(200);
    expect(asked).toEqual([{
      ticketId, document: 'spec', versionNumber: 1, requestedByAgent: false
    }]);
  });

  test('an effect read while no pass serves is refused as runtime only', async () => {
    const { routes, boardStore } = routesOf(null);
    await ticketWithOpenRecord(routes, boardStore);
    await savedSpec(routes);

    const answer = await routes.command({
      kind: 'ticket-document-effect-read', ticketReference: '1', document: 'spec', version: 1
    });

    expect(answer.status).toBe(409);
    expect(answer.body).toMatchObject({ refusal: 'hephaestus-control-is-runtime-only' });
  });
});
