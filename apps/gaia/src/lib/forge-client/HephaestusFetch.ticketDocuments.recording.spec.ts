/**
 * The real-system spec of hephaestus-fetch against a ticket's documents, run only by
 * `GAIA_RECORDING_FORGE_PROGRAM=<program> bun run record hephaestus-fetch-ticket-documents`. It starts Example Bookshop under a scratch home
 * with two draft tickets and a stored pipeline in the spec-then-plan route, whose builder reads the plan only once User approved it. It
 * saves the first draft's spec through the commands endpoint, which opens the draft's documents; no message is sent, so no agent launches.
 * It records that save with the board's events up to the `documents` event, the documents and the board read after it, the second draft's
 * refusal as a ticket with no documents, and an unknown ticket's. Then the stopped board is given the spec agent's open question on a line
 * of the spec, as an earlier Hephaestus leaves it in the forge's own store, since the fake agent asks none: it records the board with that
 * question and the draft that waits on it, the spec's refused approval, the answer, an option with a note, and the documents and the board
 * read after it. The values the run draws are recorded as example values; the forge's install and code versions stamp it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join }                        from 'node:path';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test
} from 'bun:test';

import { recordAnswer, recordSystemVersion } from '../../testing/BoundaryRecordings.ts';
import {
  recordedFormOf,
  requestCallShapeOf,
  situationCallShapeOf,
  streamCallShapeOf,
  type RecordedStream,
  type TicketDocumentsSituation,
} from '../../testing/RecordedAnswers.ts';
import { createScratchForge, type ScratchForge } from '../../testing/ScratchForge.ts';
import { scratchRoot }                           from '../../testing/ScratchRoot.ts';
import { eventStreamParserOf }                   from '../event-stream/EventStreamParser.ts';
import { forgeEndpointPathOf }                   from './ForgeClient.ts';
import {
  realHephaestusFetch,
  type HephaestusAnswer,
  type HephaestusRequest,
  type HephaestusStream,
  type HephaestusStreamRequest,
} from './HephaestusFetch.ts';

const RECORDING_NAME = 'hephaestus-fetch-ticket-documents';
const SETUP_TIMEOUT_MILLISECONDS = 240_000;
const STEP_TIMEOUT_MILLISECONDS = 120_000;
const GENEROUS_BOUND_MILLISECONDS = 10_000;
const SUCCESS_STATUS = 200;
const NOT_FOUND_STATUS = 404;
const EVENTS_LOOKED_AT_MOST = 40;
const BOOKSHOP = {
  root:              '/Users/alexexample/development/example-bookshop',
  trackerId:         'example-bookshop-3e9a',
  hephaestusAddress: '127.0.0.1:4952',
  processId:         48_213,
} as const;
const PIPELINE_STORE_PATH = ['.forge', 'pipeline.json'] as const;
const PROGRESS_STORE_PATH = ['.forge', 'progress.json'] as const;
const CONFLICT_STATUS = 409;
/** The spec's line the agent's question changes, in the example spec's first version. */
const QUESTION_LINE = 3;
const QUESTION_NOTE = 'Keep the example search by title as it is.';
const UNKNOWN_TICKET_REFERENCE = '999';
/** A product owner's ticket in the spec-then-plan route: its Report and its Wanted. */
const DRAFT_TICKET_BODY = '## Report\nA shopper cannot find an example book by its author.\n\n## Wanted\nSearch finds a book by its author.\n';
const EXAMPLE_SPEC_MARKDOWN = [
  '# Search by author',
  '',
  'Search finds an example book by the name of its author.',
  '',
  '```mermaid',
  'flowchart LR',
  '  query[Search query] --> authors[Author index]',
  '  authors --> results[Results]',
  '```',
  '',
  '## Acceptance',
  '',
  'A1. A search for an author lists that author\'s example books.',
  '',
].join('\n');

interface KeptAnswer {
  readonly callShape: string;
  readonly answer:    HephaestusAnswer | RecordedStream;
}

let scratchForge: ScratchForge;
let repository = '';
let trackerIdDrawn = '';
let hephaestusUrl = '';
let bearerToken = '';
let specTicketId = '';
let ticketWithoutDocumentsId = '';
const keptAnswers: KeptAnswer[] = [];

function keep(situation: TicketDocumentsSituation, callShape: string, answer: HephaestusAnswer | RecordedStream): void {
  keptAnswers.push({ callShape: situationCallShapeOf(situation, callShape), answer });
}

function requestOf(method: HephaestusRequest['method'], path: string, jsonBody: string | null = null): HephaestusRequest {
  return {
    hephaestusUrl, method, path, bearerToken, jsonBody, byteBody: null, answerAs: 'text', timeoutMilliseconds: GENEROUS_BOUND_MILLISECONDS,
  };
}

async function keptRequest(situation: TicketDocumentsSituation, request: HephaestusRequest): Promise<HephaestusAnswer> {
  const answer = await realHephaestusFetch().request(request);
  keep(situation, requestCallShapeOf(request), answer);
  return answer;
}

function bodyOf(answer: HephaestusAnswer): Record<string, unknown> {
  if (answer.verdict !== 'answered') throw new Error(`The forge answered ${JSON.stringify(answer)}`);
  return JSON.parse(answer.bodyText) as Record<string, unknown>;
}

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function listOf(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value as Record<string, unknown>[] : [];
}

async function openedStream(streamRequest: HephaestusStreamRequest): Promise<HephaestusStream> {
  const opening = await realHephaestusFetch().openStream(streamRequest);
  if (opening.verdict !== 'streaming') throw new Error(`${streamRequest.path} answered ${JSON.stringify(opening)}`);
  return opening.stream;
}

/** Reads the stream until `isEnough` holds for the names of the whole events read so far, into `chunks`; the stream is left open. */
async function readUntil(stream: HephaestusStream, chunks: string[], isEnough: (eventNames: readonly string[]) => boolean): Promise<void> {
  const parser = eventStreamParserOf();
  const eventNames = parser.eventsOf(chunks.join('')).map((event) => event.eventName);
  while (!isEnough(eventNames)) {
    if (eventNames.length > EVENTS_LOOKED_AT_MOST) throw new Error(`The stream sent ${eventNames.length} events and not the ones awaited.`);
    const chunk = await stream.nextChunk();
    if (chunk.kind === 'ended') throw new Error(`The stream ended ${chunk.ending} before the events awaited: ${eventNames.join(', ')}`);
    chunks.push(chunk.text);
    eventNames.push(...parser.eventsOf(chunk.text).map((event) => event.eventName));
  }
}

function ticketIdOf(added: Record<string, unknown>): string {
  return String(recordOf(added['ticket'])['id'] ?? recordOf(recordOf(added['ticket'])['frontmatter'])['id'] ?? added['id']);
}

/** The pipeline `gate none` stored, put in the spec-then-plan route with the builder reading the plan only once User approved it. */
function storeTheSpecThenPlanRoute(): void {
  const pipelinePath = join(repository, ...PIPELINE_STORE_PATH);
  const pipeline = JSON.parse(readFileSync(pipelinePath, 'utf8')) as Record<string, unknown>;
  const agents = { builder: { documents: { plan: 'if-person-approved' } } };
  writeFileSync(pipelinePath, `${JSON.stringify({ ...pipeline, agents, ticketWriting: 'spec-then-plan' }, null, 2)}\n`);
}

/**
 * The spec agent's open question on the spec's third line, with its three options, the first recommended, as `document ask` opens it; the
 * fake agent asks none, so the stopped board is given it as the forge stores it.
 */
function leaveTheSpecAgentsOpenQuestion(): void {
  const progressPath = join(repository, ...PROGRESS_STORE_PATH);
  const progress = JSON.parse(readFileSync(progressPath, 'utf8')) as Record<string, unknown>;
  const question = {
    id:        'E1',
    kind:      'agent-question',
    ticketIds: [specTicketId],
    jobId:     null,
    askedBy:   'spec-agent',
    requestId: null,
    questions: [{
      question:    'Does a search by author also match a part of the author\'s name?',
      header:      'spec',
      multiSelect: false,
      options:     [
        {
          label: 'Whole names only', description: '', isRecommended: true, touches: ['apps/web/search.ts'], acceptanceEffect: 'A1 holds as written.'
        },
        {
          label: 'Any part of a name', description: '', isRecommended: false, acceptanceEffect: 'A1 needs a second item for a part of a name.'
        },
        { label: 'Leave it to the plan', description: '', isRecommended: false },
      ],
    }],
    context:  '',
    openedAt: String(progress['startedAt']),
    document: 'spec',
    anchor:   {
      view:             'code',
      versionNumber:    1,
      lines:            { from: QUESTION_LINE, to: QUESTION_LINE },
      sectionPath:      ['Search by author'],
      surroundingLines: { from: 1, to: QUESTION_LINE + 2 },
    },
  };
  writeFileSync(progressPath, `${JSON.stringify({ ...progress, decisions: [question], nextDecisionId: 2 }, null, 2)}\n`);
}

function followTheLiveHephaestus(): void {
  const hephaestus = scratchForge.registryEntryOf(trackerIdDrawn)?.['hephaestus'] as { url: string; processId: number; tokenPath: string } | undefined;
  if (hephaestus === undefined) throw new Error('the registry names no live Hephaestus');
  hephaestusUrl = hephaestus.url;
  bearerToken = readFileSync(hephaestus.tokenPath, 'utf8').trim();
  scratchForge.exampleValueFor({ drawn: new URL(hephaestus.url).host, example: BOOKSHOP.hephaestusAddress });
  scratchForge.exampleValueFor({ drawn: `"processId":${hephaestus.processId}`, example: `"processId":${BOOKSHOP.processId}` });
  scratchForge.exampleValueFor({ drawn: `process ${hephaestus.processId}`, example: `process ${BOOKSHOP.processId}` });
  scratchForge.exampleValueFor({ drawn: bearerToken, example: 'example-token' });
}

beforeAll(async () => {
  scratchForge = createScratchForge(RECORDING_NAME);
  repository = await scratchForge.createRepository('example-bookshop');
  scratchForge.exampleValueFor({ drawn: repository, example: BOOKSHOP.root });
  const initialised = await scratchForge.runForDocument(repository, ['init', '--project', 'Example Bookshop', '--no-hooks', '--json']);
  trackerIdDrawn = String(initialised['trackerId']);
  scratchForge.exampleValueFor({ drawn: trackerIdDrawn, example: BOOKSHOP.trackerId });
  const addTicket = (title: string) => scratchForge.runForDocument(repository, ['ticket', 'add', title, '--type', 'ticket', '--body', DRAFT_TICKET_BODY, '--json']);
  specTicketId = ticketIdOf(await addTicket('Example search by author'));
  ticketWithoutDocumentsId = ticketIdOf(await addTicket('Example wish list'));
  await scratchForge.runForDocument(repository, ['gate', 'none', '--json']);
  storeTheSpecThenPlanRoute();
  // A new board starts paused and launches nothing; the save sends no message, so no document agent is asked for either.
  await scratchForge.runForDocument(repository, ['start', '--json']);
  followTheLiveHephaestus();
  const { installVersion, codeVersion } = await scratchForge.runForDocument(repository, ['version', '--json']);
  recordSystemVersion(RECORDING_NAME, `install version ${String(installVersion)}, code ${String(codeVersion)}`);
}, SETUP_TIMEOUT_MILLISECONDS);

afterAll(async () => {
  const recorded = keptAnswers.splice(0).map(({ callShape, answer }) => {
    const recordedAnswer = recordedFormOf(answer);
    if (recordedAnswer.verdict === 'answered') return { callShape, answer: { ...recordedAnswer, bodyText: scratchForge.exampleTextOf(recordedAnswer.bodyText) } };
    if (recordedAnswer.verdict === 'streaming') {
      return { callShape, answer: { ...recordedAnswer, chunks: recordedAnswer.chunks.map((chunk) => scratchForge.exampleTextOf(chunk)) } };
    }
    return { callShape, answer: recordedAnswer };
  });
  const scratchPathsLeft = recorded.filter(({ answer }) => JSON.stringify(answer).includes(scratchRoot()));
  for (const { callShape, answer } of scratchPathsLeft.length === 0 ? recorded : []) recordAnswer(RECORDING_NAME, callShape, answer);
  await scratchForge.remove();
  if (scratchPathsLeft.length > 0) throw new Error(`A scratch path is left in ${scratchPathsLeft.map(({ callShape }) => callShape).join(', ')}: nothing is recorded.`);
}, SETUP_TIMEOUT_MILLISECONDS);

describe('Example Bookshop\'s ticket documents, read as the relay reads them', () => {
  test('opens a draft\'s documents with a save of its spec, sends the documents event, and serves the documents and the board after it', async () => {
    const eventsRequest: HephaestusStreamRequest = {
      hephaestusUrl, path: forgeEndpointPathOf('events'), bearerToken, lastEventId: null, timeoutMilliseconds: GENEROUS_BOUND_MILLISECONDS,
    };
    const events = await openedStream(eventsRequest);
    const chunks: string[] = [];
    try {
      await readUntil(events, chunks, (eventNames) => eventNames.includes('board'));
      const save = {
        kind: 'ticket-document-save', ticketReference: specTicketId, document: 'spec', baseVersion: null, markdown: EXAMPLE_SPEC_MARKDOWN
      };
      const saved = await keptRequest('ticket-documents-saved', requestOf('POST', forgeEndpointPathOf('commands'), JSON.stringify(save)));
      expect(saved).toMatchObject({ status: SUCCESS_STATUS });
      await readUntil(events, chunks, (eventNames) => eventNames.includes('documents'));
    } finally {
      events.close();
    }
    keep('ticket-documents-saved', streamCallShapeOf(eventsRequest), { verdict: 'streaming', chunks, ending: 'stays-open' });
    const documentsPath = forgeEndpointPathOf('ticketDocuments', { ticketId: specTicketId });
    const documents = bodyOf(await keptRequest('ticket-documents-saved', requestOf('GET', documentsPath)));
    const spec = listOf(documents['documents']).find((document) => document['document'] === 'spec');
    expect(spec).toMatchObject({ markdown: EXAMPLE_SPEC_MARKDOWN, head: { number: 1, author: 'person' } });
    const board = bodyOf(await keptRequest('ticket-documents-saved', requestOf('GET', forgeEndpointPathOf('board'))));
    expect(recordOf(recordOf(board['pipeline'])['pipeline'])['ticketWriting']).toBe('spec-then-plan');
    const ticketsWithDocuments = listOf(recordOf(board['page'])['tickets']).filter((ticket) => ticket['documents'] !== undefined);
    expect(ticketsWithDocuments.map((ticket) => ticket['id'])).toEqual([specTicketId]);
  }, STEP_TIMEOUT_MILLISECONDS);

  test('serves the spec agent\'s open question anchored on its line, refuses the spec\'s approval while it is open, and takes its answer', async () => {
    await scratchForge.runForDocument(repository, ['stop', '--now', '--json']);
    leaveTheSpecAgentsOpenQuestion();
    await scratchForge.runForDocument(repository, ['start', '--json']);
    followTheLiveHephaestus();
    const openBoard = bodyOf(await keptRequest('ticket-documents-question-open', requestOf('GET', forgeEndpointPathOf('board'))));
    expect(listOf(openBoard['decisions'])[0]).toMatchObject({ id: 'E1', document: 'spec', placement: { from: QUESTION_LINE, to: QUESTION_LINE } });
    const draft = listOf(recordOf(openBoard['page'])['tickets']).find((ticket) => ticket['id'] === specTicketId)?.['draft'];
    expect(draft).toMatchObject({ stage: 'spec', waitsOnUser: 'answer' });
    const approval = {
      kind: 'ticket-document-approve', ticketReference: specTicketId, document: 'spec', version: 1
    };
    const refused = await keptRequest('ticket-documents-question-open', requestOf('POST', forgeEndpointPathOf('commands'), JSON.stringify(approval)));
    expect(refused).toMatchObject({ status: CONFLICT_STATUS });
    expect(bodyOf(refused)).toMatchObject({ refusal: 'document-has-open-questions' });
    const answer = { kind: 'decision-answer', decisionId: 'E1', answer: { form: 'letters', choices: ['b'], note: QUESTION_NOTE } };
    const answered = await keptRequest('ticket-documents-question-answered', requestOf('POST', forgeEndpointPathOf('commands'), JSON.stringify(answer)));
    expect(answered).toMatchObject({ status: SUCCESS_STATUS });
    const documentsPath = forgeEndpointPathOf('ticketDocuments', { ticketId: specTicketId });
    const documents = bodyOf(await keptRequest('ticket-documents-question-answered', requestOf('GET', documentsPath)));
    const spec = listOf(documents['documents']).find((document) => document['document'] === 'spec');
    expect(listOf(spec?.['messages'])).toEqual([expect.objectContaining({ decisionId: 'E1', placement: { from: QUESTION_LINE, to: QUESTION_LINE } })]);
    const answeredBoard = bodyOf(await keptRequest('ticket-documents-question-answered', requestOf('GET', forgeEndpointPathOf('board'))));
    expect(listOf(answeredBoard['decisions'])).toEqual([]);
  }, STEP_TIMEOUT_MILLISECONDS);

  test('refuses the documents of a ticket that has none, and of a reference that names no ticket, each with its code and sentence', async () => {
    const absent = await keptRequest('ticket-documents-absent', requestOf('GET', forgeEndpointPathOf('ticketDocuments', { ticketId: ticketWithoutDocumentsId })));
    expect(absent).toMatchObject({ status: NOT_FOUND_STATUS });
    expect(bodyOf(absent)).toMatchObject({ refusal: 'ticket-has-no-documents', fields: expect.any(Object), text: expect.any(String) });
    const unknown = await keptRequest('ticket-documents-unknown-ticket', requestOf('GET', forgeEndpointPathOf('ticketDocuments', { ticketId: UNKNOWN_TICKET_REFERENCE })));
    expect(unknown).toMatchObject({ status: NOT_FOUND_STATUS });
    expect(bodyOf(unknown)).toMatchObject({ refusal: 'no-readable-ticket', fields: { reference: UNKNOWN_TICKET_REFERENCE }, text: expect.any(String) });
  }, STEP_TIMEOUT_MILLISECONDS);
});
