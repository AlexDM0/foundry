/**
 * The real-system spec of overseer-fetch against Example Storefront's board, run only by
 * `GAIA_RECORDING_FORGE_PROGRAM=<program> bun run record overseer-fetch-board`. It starts the forge under a scratch home in a scratch
 * repository with two apps, its fake agent playing every session, and brings the board to tickets in several statuses, an agent's question
 * with its recommendation escalated to User, an open incident and a defaulted one's notice, a pipeline applied over both apps with the
 * Assistant switched on (a board whose Assistant is off defaults every incident at once), and an update
 * of it whose entities draft holds a standing refusal with its fix, which Apply refuses; then it records each situation of
 * `BOARD_SITUATIONS` at the versioned path Gaia calls. The values the run
 * draws are recorded as example values; the forge's install and code versions stamp it.
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
  type BoardSituation,
  type RecordedStream,
} from '../../testing/RecordedAnswers.ts';
import { createScratchForge, type ScratchForge } from '../../testing/ScratchForge.ts';
import { scratchRoot }                           from '../../testing/ScratchRoot.ts';
import { eventStreamParserOf }                   from '../event-stream/EventStreamParser.ts';
import { forgeEndpointPathOf }                   from './ForgeClient.ts';
import {
  realOverseerFetch,
  type OverseerAnswer,
  type OverseerByteBody,
  type OverseerRequest,
  type OverseerStream,
  type OverseerStreamRequest,
} from './OverseerFetch.ts';

const RECORDING_NAME = 'overseer-fetch-board';
const SETUP_TIMEOUT_MILLISECONDS = 240_000;
const STEP_TIMEOUT_MILLISECONDS = 120_000;
const GENEROUS_BOUND_MILLISECONDS = 10_000;
const SUCCESS_STATUS = 200;
const BAD_REQUEST_STATUS = 400;
const UNAUTHORIZED_STATUS = 401;
const CONFLICT_STATUS = 409;
const TOO_LARGE_STATUS = 413;
const UNSUPPORTED_MEDIA_TYPE_STATUS = 415;
const INSTALL_HELD_STATUS = 423;
const STOREFRONT = {
  root:            '/Users/alexexample/development/example-storefront',
  trackerId:       'example-storefront-7c41',
  overseerAddress: '127.0.0.1:4951',
  processId:       48_107,
} as const;
/** Forge's test setting that keeps each fake agent's session working until it is stopped, so a conversation stays open while it is recorded. */
const FAKE_AGENT_KEEPS_WORKING_VARIABLE = 'FORGE_FAKE_AGENT_KEEPS_WORKING';
/** Room for the Assistant, both setups' pipeline agents, the product owner giving tickets an entity and the intake's product owner at once. */
const RAISED_CONCURRENCY_LIMIT = 6;
const EVENTS_LOOKED_AT_MOST = 60;
/** A one-pixel PNG, a picture the forge takes. */
const EXAMPLE_PICTURE = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
/** One byte over the forge's picture size limit (`PICTURE_SIZE_LIMIT_BYTES`), led by a PNG's signature. */
const OVER_THE_PICTURE_LIMIT_BYTES = 3_932_161;
const PNG_SIGNATURE = EXAMPLE_PICTURE.slice(0, 8);
const NOT_A_PICTURE = new TextEncoder().encode('Example notes, which are no picture.');
const UNKNOWN_TICKET_REFERENCE = '999';
const WRONG_TOKEN = 'example-token-of-another-overseer';
/** The brief and numbered acceptance a ticket needs before it is readied. */
const READY_TICKET_BODY = '## Brief\nPay for an example order in one step.\n\n## Acceptance\nA1. The example order is paid.\n';
const INSTALL_MANIFEST_PATH = ['.forge', 'version.json'] as const;
/** The forge's own route a verb calls after a write so a pass runs at once; it carries nothing a recording keeps. */
const NUDGE_PATH = '/api/nudge';
const PIPELINE_GATE_NAME = 'unit';
/** Two apps whose layout the pipeline agent reports, so pipeline setup reaches its entities step. */
const APP_FOLDERS = ['apps/web', 'apps/api'] as const;
/** The entity whose gate a profile runs. */
const PROFILED_ENTITY_KEY = 'web';
const EXAMPLE_GATE = { name: PIPELINE_GATE_NAME, run: 'echo Example gate passed' } as const;
/** The refusal Apply meets while an entity refusal stands. */
const ENTITY_REFUSALS_STAND = 'entity-refusals-stand';
const PROGRESS_STORE_PATH = ['.forge', 'progress.json'] as const;
/** A job of an earlier Overseer's Assistant, gone from this board, whose turn the left incidents went out in. */
const ENDED_ASSISTANT_TURN = { jobId: 'J90', chatSequence: 1 } as const;
/** A builder's question as Talos hands the forge an agent's question, its first option the one it recommends. */
const EXAMPLE_AGENT_QUESTION = {
  question:    'Which example payment step should the checkout page show first?',
  header:      'Payment step',
  multiSelect: false,
  options:     [
    {
      label: 'Card first', description: 'The card form opens at once.', isRecommended: true, touches: ['apps/web/checkout.ts'], tradeOff: 'One step fewer.'
    },
    { label: 'Choice first', description: 'The shopper picks a way to pay first.', isRecommended: false },
  ],
} as const;

interface KeptAnswer {
  readonly callShape: string;
  readonly answer:    OverseerAnswer | RecordedStream;
}

let scratchForge: ScratchForge;
let repository = '';
let overseerUrl = '';
let bearerToken = '';
let setupId = '';
let committedTicketId = '';
let updateDraftRevision = 0;
const keptAnswers: KeptAnswer[] = [];

function keep(situation: BoardSituation, callShape: string, answer: OverseerAnswer | RecordedStream): void {
  keptAnswers.push({ callShape: situationCallShapeOf(situation, callShape), answer });
}

type RequestOptions = Partial<Pick<OverseerRequest, 'bearerToken' | 'jsonBody' | 'byteBody' | 'answerAs'>>;

function requestOf(method: OverseerRequest['method'], path: string, options: RequestOptions = {}): OverseerRequest {
  return {
    overseerUrl,
    method,
    path,
    bearerToken:         options.bearerToken === undefined ? bearerToken : options.bearerToken,
    jsonBody:            options.jsonBody ?? null,
    byteBody:            options.byteBody ?? null,
    answerAs:            options.answerAs ?? 'text',
    timeoutMilliseconds: GENEROUS_BOUND_MILLISECONDS,
  };
}

function streamRequestOf(path: string, lastEventId: string | null = null): OverseerStreamRequest {
  return {
    overseerUrl, path, bearerToken, lastEventId, timeoutMilliseconds: GENEROUS_BOUND_MILLISECONDS,
  };
}

function bodyOf(answer: OverseerAnswer): Record<string, unknown> {
  if (answer.verdict !== 'answered') throw new Error(`The forge answered ${JSON.stringify(answer)}`);
  return JSON.parse(answer.bodyText) as Record<string, unknown>;
}

async function sendCommand(command: Record<string, unknown>): Promise<OverseerAnswer> {
  return realOverseerFetch().request(requestOf('POST', forgeEndpointPathOf('commands'), { jsonBody: JSON.stringify(command) }));
}

async function keepCommand(situation: BoardSituation, command: Record<string, unknown>): Promise<OverseerAnswer> {
  const commandRequest = requestOf('POST', forgeEndpointPathOf('commands'), { jsonBody: JSON.stringify(command) });
  const answer = await realOverseerFetch().request(commandRequest);
  keep(situation, requestCallShapeOf(commandRequest), answer);
  return answer;
}

async function boardDocument(): Promise<Record<string, unknown>> {
  return bodyOf(await realOverseerFetch().request(requestOf('GET', forgeEndpointPathOf('board'))));
}

async function uploaded(situation: BoardSituation, byteBody: OverseerByteBody): Promise<OverseerAnswer> {
  const uploadRequest = requestOf('POST', forgeEndpointPathOf('pictures'), { byteBody });
  const answer = await realOverseerFetch().request(uploadRequest);
  keep(situation, requestCallShapeOf(uploadRequest), answer);
  return answer;
}

async function openedStream(streamRequest: OverseerStreamRequest): Promise<OverseerStream> {
  const opening = await realOverseerFetch().openStream(streamRequest);
  if (opening.verdict !== 'streaming') throw new Error(`${streamRequest.path} answered ${JSON.stringify(opening)}`);
  return opening.stream;
}

/** Reads the stream until `isEnough` holds for the names of the whole events read so far; the chunks read, the stream left open. */
async function chunksUntil(stream: OverseerStream, isEnough: (eventNames: readonly string[]) => boolean): Promise<string[]> {
  const parser = eventStreamParserOf();
  const chunks: string[] = [];
  const eventNames: string[] = [];
  while (!isEnough(eventNames)) {
    if (eventNames.length > EVENTS_LOOKED_AT_MOST) throw new Error(`The stream sent ${eventNames.length} events and not the ones awaited.`);
    const chunk = await stream.nextChunk();
    if (chunk.kind === 'ended') throw new Error(`The stream ended ${chunk.ending} before the events awaited: ${eventNames.join(', ')}`);
    chunks.push(chunk.text);
    eventNames.push(...parser.eventsOf(chunk.text).map((event) => event.eventName));
  }
  return chunks;
}

/**
 * The chunks of a job's stream up to a history that holds an entry: the product owner shows at work once its session printed a line, which
 * can come before its first message is in its conversation, so an empty history waits for the stream's first message and is read again.
 */
async function historyWithItsFirstEntry(jobStreamRequest: OverseerStreamRequest): Promise<string[]> {
  const firstStream = await openedStream(jobStreamRequest);
  const firstChunks = await chunksUntil(firstStream, (eventNames) => eventNames.includes('history')).catch((thrown: unknown) => {
    firstStream.close();
    throw thrown;
  });
  const parser = eventStreamParserOf();
  const history = firstChunks.flatMap((chunk) => parser.eventsOf(chunk)).find((event) => event.eventName === 'history');
  if (history !== undefined && history.data !== '[]') {
    firstStream.close();
    return firstChunks;
  }
  await chunksUntil(firstStream, (eventNames) => eventNames.includes('message')).finally(() => firstStream.close());
  const secondStream = await openedStream(jobStreamRequest);
  return await chunksUntil(secondStream, (eventNames) => eventNames.includes('history')).finally(() => secondStream.close());
}

/** Waits on the board's event stream until the board document shows what `boardShows` asks, and answers that document. */
async function boardOnceItShows(wanted: string, boardShows: (board: Record<string, unknown>) => boolean): Promise<Record<string, unknown>> {
  const stream = await openedStream(streamRequestOf(forgeEndpointPathOf('events')));
  const parser = eventStreamParserOf();
  try {
    for (let eventsSeen = 0; eventsSeen <= EVENTS_LOOKED_AT_MOST;) {
      const board = await boardDocument();
      if (boardShows(board)) return board;
      const chunk = await stream.nextChunk();
      if (chunk.kind === 'ended') throw new Error(`The board's stream ended ${chunk.ending} before the board showed ${wanted}.`);
      eventsSeen += parser.eventsOf(chunk.text).length;
    }
  } finally {
    stream.close();
  }
  throw new Error(`The board did not show ${wanted} within ${EVENTS_LOOKED_AT_MOST} events.`);
}

function listOf(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value as Record<string, unknown>[] : [];
}

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

function standingEntityRefusalsOf(board: Record<string, unknown>): Record<string, unknown>[] {
  return listOf(recordOf(board['pipelineSetup'])['entityRefusals']);
}

function applyRefusalCodeOf(board: Record<string, unknown>): unknown {
  return recordOf(recordOf(board['pipelineSetup'])['applyRefusal'])['code'];
}

function appliedPipelineOf(board: Record<string, unknown>): Record<string, unknown> {
  return recordOf(board['pipeline']);
}

function setupOfAnswer(answer: OverseerAnswer): Record<string, unknown> {
  return recordOf(recordOf(bodyOf(answer)['result'])['setup']);
}

/**
 * The fake agent asks no question and leaves no incident, so the stopped board is given what an earlier Overseer whose Assistant's turn ended
 * leaves in the forge's own store: an incident of a merge's notes still to deliver, one delivered in that turn, and an agent's question routed to
 * the Assistant in that turn. The forge itself defaults the second, with its notice, and escalates the third into a question to User.
 */
function leaveIncidentsOfAnEndedAssistantTurn(): void {
  const progressPath = join(repository, ...PROGRESS_STORE_PATH);
  const progress = JSON.parse(readFileSync(progressPath, 'utf8')) as Record<string, unknown>;
  const openedAt = String(progress['startedAt']);
  const mergeNotesIncident = {
    kind:            'system-question',
    ticketIds:       [] as string[],
    jobId:           null,
    facts:           { notes: 'The example merge stopped: the example lockfile differs on the main line.', mergeJobId: 'J91' },
    defaultMove:     'incident-escalate',
    deliveredInTurn: null as typeof ENDED_ASSISTANT_TURN | null,
    openedAt,
  };
  const incidents = [
    { ...mergeNotesIncident, id: 'I1' },
    { ...mergeNotesIncident, id: 'I2', deliveredInTurn: ENDED_ASSISTANT_TURN },
    {
      ...mergeNotesIncident,
      id:              'I3',
      ticketIds:       [committedTicketId],
      facts:           { requestId: 'example-request-1', questions: JSON.stringify([EXAMPLE_AGENT_QUESTION]) },
      deliveredInTurn: ENDED_ASSISTANT_TURN,
    },
  ];
  writeFileSync(progressPath, `${JSON.stringify({ ...progress, incidents, nextIncidentId: incidents.length + 1 }, null, 2)}\n`);
}

interface LiveOverseer {
  readonly url:       string;
  readonly processId: number;
  readonly tokenPath: string;
}

/** Points the recording's requests at the Overseer the registry names now, with its token. */
function followTheLiveOverseerOf(trackerId: string): LiveOverseer {
  const overseer = scratchForge.registryEntryOf(trackerId)?.['overseer'] as LiveOverseer | undefined;
  if (overseer === undefined) throw new Error('the registry names no live Overseer');
  overseerUrl = overseer.url;
  bearerToken = readFileSync(overseer.tokenPath, 'utf8').trim();
  return overseer;
}

function noticeKindsOf(board: Record<string, unknown>): unknown[] {
  return listOf(board['notices']).map((notice) => notice['kind']);
}

async function commitTheApps(): Promise<void> {
  for (const appFolder of APP_FOLDERS) {
    const appPackage = { name: appFolder.replace('apps/', 'example-'), version: '1.0.0' };
    await Bun.write(join(repository, appFolder, 'package.json'), `${JSON.stringify(appPackage)}\n`);
  }
  const gitIdentity = ['-c', 'user.name=Alex Example', '-c', 'user.email=alex@example.com'];
  for (const gitArguments of [['add', '.'], [...gitIdentity, 'commit', '--quiet', '-m', 'Add the example apps']]) {
    const answer = await scratchForge.processRun.run({
      program: 'git', programArguments: gitArguments, workingDirectory: repository, timeoutMilliseconds: GENEROUS_BOUND_MILLISECONDS,
    });
    if (answer.verdict !== 'finished' || answer.exitCode !== 0) throw new Error(`git ${gitArguments.join(' ')} answered ${JSON.stringify(answer)}`);
  }
}

/** Edits the draft at the revision the previous edit left, and answers the revision this one leaves. */
async function draftRevisionAfterEditing(draftRevision: number, edits: readonly Record<string, unknown>[]): Promise<number> {
  const edited = await sendCommand({
    kind: 'pipeline-draft-edit', setupId, draftRevision, edits,
  });
  expect(edited).toMatchObject({ status: SUCCESS_STATUS });
  return Number(setupOfAnswer(edited)['draftRevision']);
}

/** The edits that set one app's entity with one gate in its build phase. */
function appEntityEditsOf(entityKey: string, home: string): Record<string, unknown>[] {
  return [
    { target: 'entity', entityKey, value: { kind: 'app', home: [home] } },
    { target: 'within-entity', entityKey, edit: { target: 'gate', name: PIPELINE_GATE_NAME, value: EXAMPLE_GATE } },
    { target: 'within-entity', entityKey, edit: { target: 'phase-order', phase: 'build', names: [PIPELINE_GATE_NAME] } },
  ];
}

/** Opens pipeline setup, has the layout of both apps found as the pipeline agent reports it, drafts an entity of each app with one gate and applies it. */
async function applyAPipelineOverTheApps(): Promise<void> {
  const opened = await sendCommand({ kind: 'pipeline-setup-start', billing: { mode: 'subscription' }, replacesUnreadablePipeline: false });
  const firstSetupId = String(setupOfAnswer(opened)['setupId']);
  setupId = firstSetupId;
  for (const appFolder of APP_FOLDERS) {
    const finding = {
      topic: 'layout', label: `${appFolder} is a stand-alone codebase`, value: appFolder, sourcePaths: [`${appFolder}/package.json`], script: null,
    };
    await scratchForge.runForDocument(repository, ['pipeline', 'finding', firstSetupId, '--json', '--', JSON.stringify(finding)]);
  }
  expect(await sendCommand({
    kind: 'pipeline-setup-step', setupId: firstSetupId, step: 'research', move: 'continue'
  })).toMatchObject({ status: SUCCESS_STATUS });
  const firstDraftRevision = 0;
  const draftRevisionToApply = await draftRevisionAfterEditing(firstDraftRevision, [
    ...appEntityEditsOf('web', '/apps/web'),
    ...appEntityEditsOf('api', '/apps/api'),
  ]);
  expect(await sendCommand({
    kind: 'pipeline-apply', setupId: firstSetupId, draftRevision: draftRevisionToApply, resumesBoard: false
  })).toMatchObject({ status: SUCCESS_STATUS });
  await boardOnceItShows('the applied pipeline', (board) => appliedPipelineOf(board)['readingVerdict'] === 'readable'
    && appliedPipelineOf(board)['application'] !== null && board['pipelineSetup'] === null);
}

/** Opens an update of the stored pipeline, whose draft the recording then edits. */
async function openAnUpdateOfThePipeline(): Promise<void> {
  const update = await sendCommand({ kind: 'pipeline-update-start' });
  expect(update).toMatchObject({ status: SUCCESS_STATUS });
  setupId = String(setupOfAnswer(update)['setupId']);
  updateDraftRevision = Number(setupOfAnswer(update)['draftRevision']);
}

/**
 * Moves the update's draft to the second app keeping its own home beside the first one's, which the entities draft keeps with its refusal
 * standing and the forge's fix of it, the second app giving the shared home up, and which Apply refuses while it stands.
 */
async function leaveTheEntitiesDraftRefused(): Promise<void> {
  updateDraftRevision = await draftRevisionAfterEditing(updateDraftRevision, [
    { target: 'entity', entityKey: 'api', value: { kind: 'app', home: ['/apps/api', '/apps/web'] } },
  ]);
  await boardOnceItShows('a standing entity refusal with its fix, which Apply refuses', (board) => standingEntityRefusalsOf(board)
    .some((refusal) => refusal['fix'] !== null) && applyRefusalCodeOf(board) === ENTITY_REFUSALS_STAND);
}

beforeAll(async () => {
  scratchForge = createScratchForge(RECORDING_NAME, { forgeVariables: { [FAKE_AGENT_KEEPS_WORKING_VARIABLE]: '1' } });
  repository = await scratchForge.createRepository('example-storefront');
  scratchForge.exampleValueFor({ drawn: repository, example: STOREFRONT.root });
  await commitTheApps();
  const initialised = await scratchForge.runForDocument(repository, ['init', '--project', 'Example Storefront', '--no-hooks', '--json']);
  const trackerIdDrawn = String(initialised['trackerId']);
  scratchForge.exampleValueFor({ drawn: trackerIdDrawn, example: STOREFRONT.trackerId });
  await scratchForge.runForDocument(repository, ['ticket', 'add', 'Search suggestions', '--type', 'ticket', '--json']);
  const committed = await scratchForge.runForDocument(repository, ['ticket', 'add', 'Example checkout page', '--type', 'ticket', '--body', READY_TICKET_BODY, '--json']);
  committedTicketId = String(recordOf(committed['ticket'])['id'] ?? recordOf(recordOf(committed['ticket'])['frontmatter'])['id'] ?? committed['id']);
  await scratchForge.runForDocument(repository, ['ticket', 'ready', committedTicketId, '--json']);
  // A new board starts paused and launches nothing, so the stop that follows interrupts no job. The Assistant's switch needs a stored pipeline.
  await scratchForge.runForDocument(repository, ['start', '--json']);
  followTheLiveOverseerOf(trackerIdDrawn);
  await applyAPipelineOverTheApps();
  expect(await sendCommand({ kind: 'pipeline-assistant-set', on: true })).toMatchObject({ status: SUCCESS_STATUS });
  await scratchForge.runForDocument(repository, ['stop', '--now', '--json']);
  leaveIncidentsOfAnEndedAssistantTurn();
  await scratchForge.runForDocument(repository, ['start', '--json']);
  const overseer = followTheLiveOverseerOf(trackerIdDrawn);
  scratchForge.exampleValueFor({ drawn: new URL(overseer.url).host, example: STOREFRONT.overseerAddress });
  scratchForge.exampleValueFor({ drawn: `"processId":${overseer.processId}`, example: `"processId":${STOREFRONT.processId}` });
  scratchForge.exampleValueFor({ drawn: `process ${overseer.processId}`, example: `process ${STOREFRONT.processId}` });
  scratchForge.exampleValueFor({ drawn: bearerToken, example: 'example-token' });
  expect(await sendCommand({ kind: 'concurrency-set', limit: RAISED_CONCURRENCY_LIMIT })).toMatchObject({ status: SUCCESS_STATUS });
  // A new board starts paused; a forge at work runs.
  expect(await sendCommand({ kind: 'overseer-resume' })).toMatchObject({ status: SUCCESS_STATUS });
  await boardOnceItShows('its first question, an escalated question and a defaulted incident\'s notice', (board) => listOf(board['openDecisionIds']).length > 0
    && listOf(board['escalatedDecisionIds']).length > 0 && noticeKindsOf(board).includes('incident-defaulted'));
  await openAnUpdateOfThePipeline();
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

describe('Example Storefront\'s board, read as the relay reads it', () => {
  test('starts a profile of the draft\'s gate, and streams its output lines', async () => {
    const started = await keepCommand('gate-profile-run', {
      kind: 'gate-profile-start', setupId, gateName: PIPELINE_GATE_NAME, phase: 'build', entity: PROFILED_ENTITY_KEY
    });
    expect(started).toMatchObject({ status: SUCCESS_STATUS });
    const board = await boardOnceItShows('a profile run', (shown) => listOf(shown['profileRuns']).length > 0);
    const profileRunId = String(listOf(board['profileRuns'])[0]?.['profileRunId'] ?? listOf(board['profileRuns'])[0]?.['id']);
    const profileStreamRequest = streamRequestOf(forgeEndpointPathOf('profileStream', { profileRunId }));
    const profileStream = await openedStream(profileStreamRequest);
    const chunks = await chunksUntil(profileStream, (eventNames) => eventNames.includes('line')).finally(() => profileStream.close());
    keep('gate-profile-run', streamCallShapeOf(profileStreamRequest), { verdict: 'streaming', chunks, ending: 'stays-open' });
  }, STEP_TIMEOUT_MILLISECONDS);

  test('answers its board with a recommended question, an open incident, a default\'s notice, an applied pipeline over entities and an update '
    + 'draft whose refusal with its fix Apply refuses, and 401 to another token', async () => {
    await leaveTheEntitiesDraftRefused();
    const boardRequest = requestOf('GET', forgeEndpointPathOf('board'));
    const answer = await realOverseerFetch().request(boardRequest);
    const board = bodyOf(answer);
    const optionsOfOpenQuestions = listOf(board['decisions'])
      .flatMap((decision) => listOf(decision['questions']).flatMap((question) => listOf(question['options'])));
    expect(optionsOfOpenQuestions.some((option) => option['recommended'] === true)).toBe(true);
    expect(listOf(board['escalatedDecisionIds']).length).toBeGreaterThan(0);
    expect(listOf(board['incidents']).length).toBeGreaterThan(0);
    expect(listOf(board['notices']).some((notice) => typeof notice['causeSentence'] === 'string')).toBe(true);
    expect(standingEntityRefusalsOf(board).some((refusal) => refusal['reason'] === 'equal-homes' && refusal['fix'] !== null)).toBe(true);
    expect(applyRefusalCodeOf(board)).toBe(ENTITY_REFUSALS_STAND);
    expect(Object.keys(recordOf(recordOf(board['pipelineSetup'])['draftEntities'])).length).toBeGreaterThan(0);
    const appliedPipeline = appliedPipelineOf(board);
    expect(appliedPipeline).toMatchObject({
      readingVerdict: 'readable', contentHash: expect.any(String), fileText: expect.any(String), application: expect.any(Object),
    });
    expect(Object.keys(recordOf(appliedPipeline['entityPipelines'])).sort()).toEqual(['api', 'web']);
    keep('board-at-work', requestCallShapeOf(boardRequest), answer);
    const wrongTokenRequest = requestOf('GET', forgeEndpointPathOf('board'), { bearerToken: WRONG_TOKEN });
    const wrongToken = await realOverseerFetch().request(wrongTokenRequest);
    expect(wrongToken).toMatchObject({ status: UNAUTHORIZED_STATUS });
    keep('board-token-rejected', requestCallShapeOf(wrongTokenRequest), wrongToken);
    const wrongTokenStreamRequest = { ...streamRequestOf(forgeEndpointPathOf('events')), bearerToken: WRONG_TOKEN };
    const wrongTokenStream = await realOverseerFetch().openStream(wrongTokenStreamRequest);
    expect(wrongTokenStream).toMatchObject({ status: UNAUTHORIZED_STATUS });
    if (wrongTokenStream.verdict !== 'streaming') keep('board-token-rejected', streamCallShapeOf(wrongTokenStreamRequest), wrongTokenStream);
  });

  test('streams its handshake and a whole board event, and replays from that event\'s id on a reconnect', async () => {
    const firstRequest = streamRequestOf(forgeEndpointPathOf('events'));
    const firstStream = await openedStream(firstRequest);
    const firstChunks = await chunksUntil(firstStream, (eventNames) => eventNames.includes('board')).finally(() => firstStream.close());
    expect(firstChunks.join('')).toStartWith('event: handshake\n');
    keep('board-at-work', streamCallShapeOf(firstRequest), { verdict: 'streaming', chunks: firstChunks, ending: 'stays-open' });
    const firstEventId = /\nid: ([^\n]+)\nevent: board\n/.exec(`\n${firstChunks.join('')}`)?.[1];
    if (firstEventId === undefined) throw new Error('The first board event carried no id.');
    // A change after the first event, so the reconnect has an event to replay.
    expect(await sendCommand({ kind: 'concurrency-set', limit: RAISED_CONCURRENCY_LIMIT - 1 })).toMatchObject({ status: SUCCESS_STATUS });
    const reconnectRequest = streamRequestOf(forgeEndpointPathOf('events'), firstEventId);
    const reconnected = await openedStream(reconnectRequest);
    const reconnectChunks = await chunksUntil(reconnected, (eventNames) => eventNames.includes('board')).finally(() => reconnected.close());
    keep('board-at-work', streamCallShapeOf(reconnectRequest), { verdict: 'streaming', chunks: reconnectChunks, ending: 'stays-open' });
  });

  test('applies a hold of a committed ticket, refuses one of an unknown ticket with its code, fields and sentence, and an unknown kind', async () => {
    const held = await keepCommand('board-command-applied', { kind: 'ticket-hold', ticketReference: committedTicketId, reason: 'Waits for the example design' });
    expect(bodyOf(held)).toMatchObject({ outcome: 'done' });
    const refused = await keepCommand('board-command-refused', { kind: 'ticket-hold', ticketReference: UNKNOWN_TICKET_REFERENCE, reason: 'Example' });
    expect(refused).toMatchObject({ status: CONFLICT_STATUS });
    expect(bodyOf(refused)).toMatchObject({ refusal: expect.any(String), fields: expect.any(Object), text: expect.any(String) });
    const unknownKind = await keepCommand('board-command-unknown-kind', { kind: 'example-unknown-kind' });
    expect(unknownKind).toMatchObject({ status: BAD_REQUEST_STATUS });
  });

  test('accepts a picture, and refuses one too large and one that is no picture', async () => {
    const accepted = bodyOf(await uploaded('picture-accepted', { bytes: EXAMPLE_PICTURE, mediaType: 'image/png' }));
    expect(accepted).toMatchObject({ pictureId: expect.any(String), mediaType: 'image/png' });
    const overTheLimit = new Uint8Array(OVER_THE_PICTURE_LIMIT_BYTES);
    overTheLimit.set(PNG_SIGNATURE);
    expect(await uploaded('picture-too-large', { bytes: overTheLimit, mediaType: 'image/png' })).toMatchObject({ status: TOO_LARGE_STATUS });
    expect(await uploaded('picture-not-a-picture', { bytes: NOT_A_PICTURE, mediaType: 'text/plain' })).toMatchObject({ status: UNSUPPORTED_MEDIA_TYPE_STATUS });
  });

  test('starts an intake with an uploaded picture, serves the picture back, and streams the product owner\'s conversation the fake agent plays', async () => {
    const uploadedPicture = bodyOf(await uploaded('intake-conversation', { bytes: EXAMPLE_PICTURE, mediaType: 'image/png' }));
    const pictures = [{ pictureId: uploadedPicture['pictureId'], name: 'example-sketch.png' }];
    const started = await keepCommand('intake-conversation', { kind: 'intake-start', text: 'Example: suggest searches as the shopper types.', pictures });
    expect(started).toMatchObject({ status: SUCCESS_STATUS });
    // An upload no command names is swept at the next pass, so the picture an intake names is the one read back.
    const pictureRequest = requestOf('GET', forgeEndpointPathOf('picture', { pictureId: String(uploadedPicture['pictureId']) }), { answerAs: 'bytes' });
    const picture = await realOverseerFetch().request(pictureRequest);
    expect(picture).toMatchObject({ status: SUCCESS_STATUS, contentType: 'image/png', bodyBytes: EXAMPLE_PICTURE });
    keep('picture-accepted', requestCallShapeOf(pictureRequest), picture);
    const intakeProductOwnerIsAtWork = (shown: Record<string, unknown>, job: Record<string, unknown>): boolean => job['role'] === 'product-owner'
      && job['lastLine'] !== null && job['id'] !== recordOf(shown['entityAssignment'])['jobId'];
    const board = await boardOnceItShows('the intake\'s product owner at work', (shown) => listOf(shown['jobs']).some((job) => intakeProductOwnerIsAtWork(shown, job)));
    const jobId = String(listOf(board['jobs']).find((job) => intakeProductOwnerIsAtWork(board, job))?.['id']);
    const jobStreamRequest = streamRequestOf(forgeEndpointPathOf('jobStream', { jobId }));
    const chunks = await historyWithItsFirstEntry(jobStreamRequest);
    keep('intake-conversation', streamCallShapeOf(jobStreamRequest), { verdict: 'streaming', chunks, ending: 'stays-open' });
  }, STEP_TIMEOUT_MILLISECONDS);

  test('answers 423 to a command while launches are held for an install change, and serves the board in that hold', async () => {
    const manifestPath = join(repository, ...INSTALL_MANIFEST_PATH);
    const manifestText = readFileSync(manifestPath, 'utf8');
    const { installVersion } = JSON.parse(manifestText) as { installVersion: number };
    writeFileSync(manifestPath, `${JSON.stringify({ ...JSON.parse(manifestText) as object, installVersion: installVersion + 1 })}\n`);
    try {
      await realOverseerFetch().request(requestOf('POST', NUDGE_PATH, { bearerToken: null }));
      await boardOnceItShows('launches held', (board) => recordOf(board['overseer'])['state'] === 'held-by-install-change');
      const held = await sendCommand({ kind: 'ticket-hold', ticketReference: UNKNOWN_TICKET_REFERENCE, reason: 'Example' });
      expect(held).toMatchObject({ status: INSTALL_HELD_STATUS });
      keep('board-install-held', requestCallShapeOf(requestOf('POST', forgeEndpointPathOf('commands'))), held);
      const boardRequest = requestOf('GET', forgeEndpointPathOf('board'));
      keep('board-install-held', requestCallShapeOf(boardRequest), await realOverseerFetch().request(boardRequest));
    } finally {
      writeFileSync(manifestPath, manifestText);
    }
  }, STEP_TIMEOUT_MILLISECONDS);
});
