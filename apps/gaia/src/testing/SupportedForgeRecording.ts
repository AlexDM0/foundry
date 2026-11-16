/**
 * The real-system suites of overseer-fetch against a forge, which two recording specs run: `overseer-fetch-supported-forge`, a forge at the
 * one system version Gaia supports, and `overseer-fetch-flint-brain`, the same forge running Flint's brain, each recorded with
 * `GAIA_RECORDING_FORGE_PROGRAM=<program> bun run record <name>` and the program of such a forge. Each starts that forge under a scratch
 * home in scratch repositories and records `GET /api/versions` and each endpoint at the versioned path Gaia calls. The supported forge: as
 * Example Project, serving, a token it refuses, and stopped; as Example Storefront, each situation a running forge can be brought into:
 * serving, a token it refuses, a command it refuses or finds already done, the machine limit lowered, a board file it cannot read,
 * suspended so it accepts and never answers, a Baton pass, killed under an open stream, and starting. The brain: Example Storefront in the
 * states of Flint's brain that the brain's commands bring it into, its fake agent playing the brain's session so no model is called:
 * running after one ask as the Bridge sends it, ended by a stop, refused while the Overseer is paused, and absent on a forge run with its
 * test setting `FORGE_WITHOUT_FLINT_BRAIN`. The values the run draws (paths, tracker ids, ports, process ids) are
 * recorded as example values; the forge's install and code versions stamp the recording. Test-only.
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

import { ApiPathUtil }                                       from '../lib/api-paths/ApiPathUtil.ts';
import { forgeEndpointVersionOf, type OverseerEndpointName } from '../lib/forge-client/ForgeClient.ts';
import {
  realOverseerFetch,
  type OverseerAnswer,
  type OverseerRequest,
  type OverseerStream,
  type OverseerStreamRequest,
} from '../lib/forge-client/OverseerFetch.ts';
import { CONTRACT_VERSIONS } from '../shared/constants/ContractVersions.ts';

import { recordAnswer, recordSystemVersion } from './BoundaryRecordings.ts';
import {
  requestCallShapeOf,
  situationCallShapeOf,
  streamCallShapeOf,
  type FlintBrainSituation,
  type OverseerSituation,
  type RecordedStreamAnswer,
} from './RecordedAnswers.ts';
import { createScratchForge, forgeProgramToRun, type ScratchForge } from './ScratchForge.ts';
import { scratchRoot }                                              from './ScratchRoot.ts';

const SETUP_TIMEOUT_MILLISECONDS = 180_000;
const GENEROUS_BOUND_MILLISECONDS = 10_000;
const SUSPENDED_BOUND_MILLISECONDS = 1_000;
const WRONG_TOKEN = 'example-token-of-another-overseer';
const STOREFRONT = {
  root:            '/Users/alexexample/development/example-storefront',
  trackerId:       'example-storefront-7c41',
  overseerAddress: '127.0.0.1:4951',
  firstProcessId:  48_107,
} as const;
const EXAMPLE_PROJECT = {
  root:            '/Users/alexexample/development/example-project',
  trackerId:       '712f8bdb-e7cf-48bc-86a5-2616d2cf935f',
  overseerAddress: '127.0.0.1:54795',
  processId:       21_008,
} as const;
const EXAMPLE_TOKEN = 'example-token';
const UNAUTHORIZED_STATUS = 401;
const SUCCESS_STATUS = 200;
const CONFLICT_STATUS = 409;
const RAISED_CONCURRENCY_LIMIT = 3;
const LOWERED_MACHINE_LIMIT = 4;
const MACHINE_LIMIT_ABOVE_ANY_CPU_COUNT = 64;
/** How often the starting Overseer is looked for, and how many starts are tried, before the starting window is given up on. */
const STARTING_LOOKS_PER_START = 20_000;
const STARTS_TRIED_FOR_THE_STARTING_WINDOW = 10;
const MONITOR_EVENT_PATTERN = /event: monitor\ndata: [^\n]*\n\n/g;
const BOARD_FILE_PATH = ['.forge', 'progress.json'] as const;
/** The draft ticket, and the question the Overseer's first pass opens on a board with no checks set. */
const SETTLED_ATTENTION_ENTRIES = 2;
const SETTLING_EVENTS_AT_MOST = 40;
/** A brain the forge starts ends by itself after at most two minutes (G3), so its states are looked for within that and a margin. */
const FLINT_BRAIN_TIMEOUT_MILLISECONDS = 180_000;
/** Forge's test setting that keeps each fake agent's session working until it is stopped, so a job stays at work while it is recorded. */
const FAKE_AGENT_KEEPS_WORKING_VARIABLE = 'FORGE_FAKE_AGENT_KEEPS_WORKING';
/** Forge's test setting for a forge that cannot run Flint's brain confined: no brain in its snapshot, and a start refused `no-flint`. */
const FLINT_BRAIN_WITHHELD_VARIABLE = 'FORGE_WITHOUT_FLINT_BRAIN';
/** The Bridge's own route for its digest; Gaia never calls it, so no answer of it is recorded. */
const FLINT_BRAIN_ASK_PATH = '/api/flint-brain/ask';
/** A digest as the Bridge's Flint sends it from Agents at work, its moves including the one the forge's fake brain answers. */
const FLINT_BRAIN_DIGEST = {
  habitatKind:       'chat',
  description:       'Agents at work on Example Storefront',
  suggestions:       [],
  recentCues:        [],
  newCues:           ['agent-started'],
  content:           { facts: { agentsRunning: 1 } },
  lastIntent:        null,
  isAsleep:          false,
  visitTargetKind:   null,
  copyIsOffered:     false,
  quietMilliseconds: 0,
  intents:           ['wander', 'wave', 'happy'],
  emotes:            ['happy'],
} as const;

/** The keys of Flint's brain in a monitor snapshot that the recording waits on. */
interface FlintBrainReading {
  readonly state:        string;
  readonly recentMoves?: readonly unknown[];
}

interface KeptAnswer {
  readonly callShape:    string;
  readonly answer:       OverseerAnswer | RecordedStreamAnswer;
  /** The forge that answered, whose drawn values the answer's example text replaces. */
  readonly scratchForge: ScratchForge;
}

/** The path Gaia calls an endpoint at: the version forge's registry serves the supported forge version. */
function pathOf(endpointName: OverseerEndpointName, endpoint: string): string {
  return ApiPathUtil.versionedPathOf(endpoint, forgeEndpointVersionOf(endpointName));
}

const PATHS = {
  identity:      pathOf('identity', 'identity'),
  summary:       pathOf('summary', 'summary'),
  monitor:       pathOf('monitor', 'monitor'),
  monitorEvents: pathOf('monitorEvents', 'monitor/events'),
  commands:      pathOf('commands', 'commands'),
  sessionCodes:  pathOf('sessionCodes', 'session-codes'),
} as const;

/** `supported-forge`: every situation but Flint's brain's; `flint-brain`: the brain's states only. */
export type ForgeRecordingPart = 'supported-forge' | 'flint-brain';

export function describeSupportedForgeRecording(recordingName: string, recordingPart: ForgeRecordingPart): void {
  const monitorVersion = CONTRACT_VERSIONS.forgeMonitor;
  const controlVersion = CONTRACT_VERSIONS.forgeControl;
  let scratchForge: ScratchForge;
  let repository = '';
  let overseerUrl = '';
  let bearerToken = '';
  let overseerProcessId = 0;
  let suspendedProcessId: number | null = null;
  let processIdsSeen = 0;
  let trackerIdDrawn = '';
  let tokenPath = '';
  const createdForges: ScratchForge[] = [];
  const keptAnswers: KeptAnswer[] = [];

  function keep(situation: OverseerSituation | FlintBrainSituation, callShape: string, answer: OverseerAnswer | RecordedStreamAnswer): void {
    keptAnswers.push({ callShape: situationCallShapeOf(situation, callShape), answer, scratchForge });
  }

  function requestOf(method: OverseerRequest['method'], path: string, token: string | null, jsonBody: string | null = null): OverseerRequest {
    return {
      overseerUrl, method, path, bearerToken: token, jsonBody, timeoutMilliseconds: GENEROUS_BOUND_MILLISECONDS,
    };
  }

  function streamRequestOf(token: string, timeoutMilliseconds = GENEROUS_BOUND_MILLISECONDS): OverseerStreamRequest {
    return {
      overseerUrl, path: PATHS.monitorEvents, bearerToken: token, timeoutMilliseconds,
    };
  }

  /** Keeps what the forge answers at `/api/versions` in a situation, which Gaia asks before anything else. */
  async function keepVersions(situation: OverseerSituation | FlintBrainSituation, timeoutMilliseconds = GENEROUS_BOUND_MILLISECONDS): Promise<OverseerAnswer> {
    const versionsRequest = { ...requestOf('GET', ApiPathUtil.VERSIONS_PATH, null), timeoutMilliseconds };
    const answer = await realOverseerFetch().request(versionsRequest);
    keep(situation, requestCallShapeOf(versionsRequest), answer);
    return answer;
  }

  /** Stamps the recording with the install and code versions the forge's identity answer names. */
  function stampWithTheForgeIn(identityAnswer: OverseerAnswer): void {
    const identity = identityAnswer.verdict === 'answered' ? JSON.parse(identityAnswer.bodyText) as Record<string, unknown> : {};
    recordSystemVersion(recordingName, `install version ${String(identity['installVersion'])}, code ${String(identity['codeVersion'])}`);
  }

  async function sendCommand(command: Record<string, unknown>): Promise<OverseerAnswer> {
    return realOverseerFetch().request(requestOf('POST', PATHS.commands, bearerToken, JSON.stringify(command)));
  }

  /** Reads the Overseer the registry names now: its address, process and token, each run-drawn value given its example. */
  function followTheLiveOverseer(): void {
    const overseer = scratchForge.registryEntryOf(trackerIdDrawn)?.['overseer'] as { url: string; processId: number; tokenPath: string } | undefined;
    if (overseer === undefined) throw new Error('the registry names no live Overseer');
    ({ url: overseerUrl, processId: overseerProcessId, tokenPath } = overseer);
    bearerToken       = readFileSync(tokenPath, 'utf8').trim();
    scratchForge.exampleValueFor({ drawn: new URL(overseer.url).host, example: STOREFRONT.overseerAddress });
    const exampleProcessId = STOREFRONT.firstProcessId + processIdsSeen;
    processIdsSeen += 1;
    scratchForge.exampleValueFor({ drawn: `"processId":${overseer.processId}`, example: `"processId":${exampleProcessId}` });
    scratchForge.exampleValueFor({ drawn: `process ${overseer.processId}`, example: `process ${exampleProcessId}` });
  }

  /** The chunks of a stream read until it holds `wholeEvents` monitor events, or until it ends; the stream is left open. */
  async function chunksUntil(stream: OverseerStream, wholeEvents: number): Promise<{ readonly chunks: string[]; readonly ending: 'closed' | 'broken' | null }> {
    const chunks: string[] = [];
    while ((chunks.join('').match(MONITOR_EVENT_PATTERN) ?? []).length < wholeEvents) {
      const chunk = await stream.nextChunk();
      if (chunk.kind === 'ended') return { chunks, ending: chunk.ending };
      chunks.push(chunk.text);
    }
    return { chunks, ending: null };
  }

  async function chunksUntilTheEnd(stream: OverseerStream, chunks: string[]): Promise<'closed' | 'broken'> {
    for (;;) {
      const chunk = await stream.nextChunk();
      if (chunk.kind === 'ended') return chunk.ending;
      chunks.push(chunk.text);
    }
  }

  async function openedStream(token: string): Promise<OverseerStream> {
    const opening = await realOverseerFetch().openStream(streamRequestOf(token));
    if (opening.verdict !== 'streaming') throw new Error(`the monitor stream answered ${JSON.stringify(opening)}`);
    return opening.stream;
  }

  function snapshotsIn(chunks: readonly string[]): Record<string, unknown>[] {
    return (chunks.join('').match(MONITOR_EVENT_PATTERN) ?? []).map((event) => JSON.parse(event.slice(event.indexOf('data: ') + 'data: '.length)) as Record<string, unknown>);
  }

  /** Waits on the stream until the Overseer's first pass has opened its question and its Assistant's job beside the draft ticket. */
  async function boardHasSettled(): Promise<void> {
    const stream = await openedStream(bearerToken);
    try {
      for (let event = 1; event <= SETTLING_EVENTS_AT_MOST; event += 1) {
        const { chunks } = await chunksUntil(stream, 1);
        const settled = (snapshot: Record<string, unknown>): boolean => (snapshot['attention'] as unknown[]).length >= SETTLED_ATTENTION_ENTRIES
          && (snapshot['jobs'] as unknown[]).length > 0;
        if (snapshotsIn(chunks).some(settled)) return;
      }
      throw new Error(`The board did not settle within ${SETTLING_EVENTS_AT_MOST} monitor events.`);
    } finally {
      stream.close();
    }
  }

  /** Reads the stream until a snapshot's Flint's brain is as `brainIsAsWanted` says, worded by `wantedState`, and answers its chunks. */
  async function chunksOnceTheBrainIs(wantedState: string, brainIsAsWanted: (brain: FlintBrainReading | null) => boolean): Promise<string[]> {
    const stream = await openedStream(bearerToken);
    const chunks: string[] = [];
    try {
      const snapshotShowsTheBrain = (snapshot: Record<string, unknown>): boolean => brainIsAsWanted(snapshot['flintBrain'] as FlintBrainReading | null);
      for (let event = 1; !snapshotsIn(chunks).some(snapshotShowsTheBrain); event += 1) {
        if (event > SETTLING_EVENTS_AT_MOST) throw new Error(`Flint's brain was not ${wantedState} within ${SETTLING_EVENTS_AT_MOST} monitor events.`);
        const { chunks: eventChunks, ending } = await chunksUntil(stream, 1);
        chunks.push(...eventChunks);
        if (ending !== null) throw new Error(`The monitor stream ended ${ending} before Flint's brain was ${wantedState}.`);
      }
    } finally {
      stream.close();
    }
    return chunks;
  }

  /** Waits until a snapshot's Flint's brain is as `brainIsAsWanted` says, and keeps what the stream, the monitor and the identity answer then. */
  async function keepTheBrainOnceItIs(situation: FlintBrainSituation, wantedState: string, brainIsAsWanted: (brain: FlintBrainReading | null) => boolean): Promise<void> {
    const chunks = await chunksOnceTheBrainIs(wantedState, brainIsAsWanted);
    keep(situation, streamCallShapeOf(streamRequestOf(bearerToken)), { verdict: 'streaming', chunks, ending: 'stays-open' });
    const monitorRequest = requestOf('GET', PATHS.monitor, bearerToken);
    keep(situation, requestCallShapeOf(monitorRequest), await realOverseerFetch().request(monitorRequest));
    const identityRequest = requestOf('GET', PATHS.identity, null);
    const identityAnswer = await realOverseerFetch().request(identityRequest);
    keep(situation, requestCallShapeOf(identityRequest), identityAnswer);
    stampWithTheForgeIn(identityAnswer);
    await keepVersions(situation);
  }

  function exampleAnswerOf({ answer, scratchForge: answeringForge }: KeptAnswer): OverseerAnswer | RecordedStreamAnswer {
    if (answer.verdict === 'answered') return { ...answer, bodyText: answeringForge.exampleTextOf(answer.bodyText) };
    if (answer.verdict === 'streaming') return { ...answer, chunks: answer.chunks.map((chunk) => answeringForge.exampleTextOf(chunk)) };
    return answer;
  }

  /** Starts Example Storefront at work on a scratch forge of its own, with forge's own settings `forgeVariables`, and follows its Overseer. */
  async function startStorefront(forgeVariables: Readonly<Record<string, string>> = {}): Promise<void> {
    scratchForge = createScratchForge(recordingName, { forgeVariables: { [FAKE_AGENT_KEEPS_WORKING_VARIABLE]: '1', ...forgeVariables } });
    createdForges.push(scratchForge);
    processIdsSeen = 0;
    repository     = await scratchForge.createRepository('example-storefront');
    scratchForge.exampleValueFor({ drawn: repository, example: STOREFRONT.root });
    const initialised = await scratchForge.runForDocument(repository, ['init', '--project', 'Example Storefront', '--no-hooks', '--json']);
    trackerIdDrawn = String(initialised['trackerId']);
    scratchForge.exampleValueFor({ drawn: trackerIdDrawn, example: STOREFRONT.trackerId });
    await scratchForge.runForDocument(repository, ['ticket', 'add', 'Search suggestions', '--type', 'ticket', '--json']);
    await scratchForge.runForDocument(repository, ['start', '--json']);
    followTheLiveOverseer();
    // A new board starts paused; a forge at work runs.
    expect(await sendCommand({ kind: 'overseer-resume' })).toMatchObject({ verdict: 'answered', status: 200 });
    await boardHasSettled();
  }

  beforeAll(() => startStorefront(), SETUP_TIMEOUT_MILLISECONDS);

  afterAll(async () => {
    if (suspendedProcessId !== null) process.kill(suspendedProcessId, 'SIGCONT');
    const recorded = keptAnswers.splice(0).map((keptAnswer) => ({ callShape: keptAnswer.callShape, answer: exampleAnswerOf(keptAnswer) }));
    const scratchPathsLeft = recorded.filter(({ answer }) => JSON.stringify(answer).includes(scratchRoot()));
    for (const { callShape, answer } of scratchPathsLeft.length === 0 ? recorded : []) recordAnswer(recordingName, callShape, answer);
    for (const createdForge of createdForges.splice(0)) await createdForge.remove();
    if (scratchPathsLeft.length > 0) throw new Error(`A scratch path is left in ${scratchPathsLeft.map(({ callShape }) => callShape).join(', ')}: nothing is recorded.`);
  }, SETUP_TIMEOUT_MILLISECONDS);

  if (recordingPart === 'flint-brain') {
    describe('Example Storefront running Flint\'s brain', () => {
      const commandShape = (): string => requestCallShapeOf(requestOf('POST', PATHS.commands, bearerToken));
      const outcomeOf = (answer: OverseerAnswer): unknown => (answer.verdict === 'answered' ? JSON.parse(answer.bodyText) as unknown : answer);

      test('answers a start of the brain done, and serves the brain running with the move it chose for the Bridge\'s digest', async () => {
        const answer = await sendCommand({ kind: 'flint-brain-start' });
        expect(outcomeOf(answer)).toMatchObject({ outcome: 'done' });
        keep('brain-running', commandShape(), answer);
        await chunksOnceTheBrainIs('running', (brain) => brain?.state === 'running');
        const asked = await realOverseerFetch().request(requestOf('POST', FLINT_BRAIN_ASK_PATH, bearerToken, JSON.stringify(FLINT_BRAIN_DIGEST)));
        expect(outcomeOf(asked)).toMatchObject({ intent: expect.any(String) });
        await keepTheBrainOnceItIs('brain-running', 'running with a move', (brain) => brain?.state === 'running' && (brain.recentMoves?.length ?? 0) > 0);
      }, FLINT_BRAIN_TIMEOUT_MILLISECONDS);

      test('answers a stop of the running brain done, and serves the brain ended', async () => {
        const answer = await sendCommand({ kind: 'flint-brain-stop' });
        expect(outcomeOf(answer)).toMatchObject({ outcome: 'done' });
        keep('brain-ended', commandShape(), answer);
        await keepTheBrainOnceItIs('brain-ended', 'ended', (brain) => brain?.state === 'ended');
      }, FLINT_BRAIN_TIMEOUT_MILLISECONDS);

      test('refuses a start while its Overseer is paused, and serves the brain refused', async () => {
        expect(await sendCommand({ kind: 'overseer-pause' })).toMatchObject({ verdict: 'answered', status: SUCCESS_STATUS });
        try {
          const answer = await sendCommand({ kind: 'flint-brain-start' });
          expect(answer).toMatchObject({ verdict: 'answered', status: CONFLICT_STATUS });
          expect(outcomeOf(answer)).toMatchObject({ refusal: 'overseer-paused' });
          keep('brain-refused', commandShape(), answer);
          await keepTheBrainOnceItIs('brain-refused', 'refused', (brain) => brain?.state === 'refused');
        } finally {
          await sendCommand({ kind: 'overseer-resume' });
        }
      }, FLINT_BRAIN_TIMEOUT_MILLISECONDS);

      test('refuses a start on a forge that runs no brain, and serves no brain', async () => {
        await startStorefront({ [FLINT_BRAIN_WITHHELD_VARIABLE]: '1' });
        const answer = await sendCommand({ kind: 'flint-brain-start' });
        expect(answer).toMatchObject({ verdict: 'answered', status: CONFLICT_STATUS });
        expect(outcomeOf(answer)).toMatchObject({ refusal: 'no-flint' });
        keep('no-flint', commandShape(), answer);
        await keepTheBrainOnceItIs('no-flint', 'absent', (brain) => brain === null);
      }, SETUP_TIMEOUT_MILLISECONDS);
    });
    return;
  }

  describe('Example Project, a second forge', () => {
    let projectRepository = '';
    let projectOverseerUrl = '';

    function projectRequestOf(method: OverseerRequest['method'], path: string, token: string | null, jsonBody: string | null = null): OverseerRequest {
      return {
        overseerUrl: projectOverseerUrl, method, path, bearerToken: token, jsonBody, timeoutMilliseconds: GENEROUS_BOUND_MILLISECONDS,
      };
    }

    async function keepProjectAnswer(situation: OverseerSituation, request: OverseerRequest): Promise<OverseerAnswer> {
      const answer = await realOverseerFetch().request(request);
      keep(situation, requestCallShapeOf(request), answer);
      return answer;
    }

    beforeAll(async () => {
      projectRepository = await scratchForge.createRepository('example-project');
      scratchForge.exampleValueFor({ drawn: projectRepository, example: EXAMPLE_PROJECT.root });
      const initialised = await scratchForge.runForDocument(projectRepository, ['init', '--project', 'Example Project', '--no-hooks', '--json']);
      const projectTrackerId = String(initialised['trackerId']);
      scratchForge.exampleValueFor({ drawn: projectTrackerId, example: EXAMPLE_PROJECT.trackerId });
      await scratchForge.runForDocument(projectRepository, ['start', '--json']);
      const overseer = scratchForge.registryEntryOf(projectTrackerId)?.['overseer'] as { url: string; processId: number } | undefined;
      if (overseer === undefined) throw new Error('the registry names no live Overseer of Example Project');
      projectOverseerUrl = overseer.url;
      scratchForge.exampleValueFor({ drawn: new URL(overseer.url).host, example: EXAMPLE_PROJECT.overseerAddress });
      scratchForge.exampleValueFor({ drawn: `"processId":${overseer.processId}`, example: `"processId":${EXAMPLE_PROJECT.processId}` });
    }, SETUP_TIMEOUT_MILLISECONDS);

    test('answers its versions, its identity and its board summary while it serves', async () => {
      for (const path of [ApiPathUtil.VERSIONS_PATH, PATHS.identity, PATHS.summary]) {
        const servingRequest = projectRequestOf('GET', path, null);
        expect(await keepProjectAnswer('serving', servingRequest)).toMatchObject({ verdict: 'answered', status: SUCCESS_STATUS });
      }
    });

    test('answers 401 to a session code and a command asked with another Overseer\'s token', async () => {
      const commandBody = JSON.stringify({ kind: 'overseer-pause' });
      for (const refusedRequest of [projectRequestOf('POST', PATHS.sessionCodes, WRONG_TOKEN), projectRequestOf('POST', PATHS.commands, WRONG_TOKEN, commandBody)]) {
        expect(await keepProjectAnswer('token-rejected', refusedRequest)).toMatchObject({ verdict: 'answered', status: UNAUTHORIZED_STATUS });
      }
    });

    test('answers unreachable for every request and the monitor stream once it has stopped', async () => {
      await scratchForge.runForDocument(projectRepository, ['stop', '--now', '--json']);
      const requests = [
        projectRequestOf('GET', ApiPathUtil.VERSIONS_PATH, null),
        projectRequestOf('GET', PATHS.identity, null),
        projectRequestOf('GET', PATHS.summary, null),
        projectRequestOf('GET', PATHS.monitor, EXAMPLE_TOKEN),
        projectRequestOf('POST', PATHS.sessionCodes, EXAMPLE_TOKEN),
        projectRequestOf('POST', PATHS.commands, EXAMPLE_TOKEN, JSON.stringify({ kind: 'overseer-pause' })),
      ];
      for (const stoppedRequest of requests) expect(await keepProjectAnswer('stopped', stoppedRequest)).toEqual({ verdict: 'unreachable' });
      const streamRequest = {
        overseerUrl: projectOverseerUrl, path: PATHS.monitorEvents, bearerToken: EXAMPLE_TOKEN, timeoutMilliseconds: GENEROUS_BOUND_MILLISECONDS
      };
      const streamAnswer = await realOverseerFetch().openStream(streamRequest);
      expect(streamAnswer).toEqual({ verdict: 'unreachable' });
      if (streamAnswer.verdict !== 'streaming') keep('stopped', streamCallShapeOf(streamRequest), streamAnswer);
    }, SETUP_TIMEOUT_MILLISECONDS);
  });

  describe('Example Storefront, a forge at work', () => {
    test(`answers its versions, and its identity with monitor contract ${monitorVersion}, control contract ${controlVersion} and every other at 1`, async () => {
      expect(await keepVersions('serving-every-contract')).toMatchObject({ verdict: 'answered', status: SUCCESS_STATUS });
      const identityRequest = requestOf('GET', PATHS.identity, null);
      const answer = await realOverseerFetch().request(identityRequest);
      expect(answer).toMatchObject({ verdict: 'answered', status: 200 });
      expect(answer.verdict === 'answered' ? JSON.parse(answer.bodyText) as unknown : null).toMatchObject({
        identityVersion: 1,
        contracts:       {
          summary: 1, monitor: monitorVersion, control: controlVersion, embed: 1
        }
      });
      stampWithTheForgeIn(answer);
      keep('serving-every-contract', requestCallShapeOf(identityRequest), answer);
    });

    test(`answers its monitor snapshot at monitor version ${monitorVersion} and a session code`, async () => {
      const monitorRequest = requestOf('GET', PATHS.monitor, bearerToken);
      const monitorAnswer  = await realOverseerFetch().request(monitorRequest);
      expect(monitorAnswer).toMatchObject({ verdict: 'answered', status: 200 });
      expect(monitorAnswer.verdict === 'answered' ? JSON.parse(monitorAnswer.bodyText) as unknown : null).toMatchObject({ monitorVersion });
      keep('serving-every-contract', requestCallShapeOf(monitorRequest), monitorAnswer);
      const sessionCodeRequest = requestOf('POST', PATHS.sessionCodes, bearerToken);
      const sessionCodeAnswer  = await realOverseerFetch().request(sessionCodeRequest);
      expect(sessionCodeAnswer).toMatchObject({ verdict: 'answered', status: 200 });
      keep('serving-every-contract', requestCallShapeOf(sessionCodeRequest), sessionCodeAnswer);
    });

    test('streams a whole snapshot on connect and another after a command changed it, and answers the command done', async () => {
      const stream = await openedStream(bearerToken);
      const first  = await chunksUntil(stream, 1);
      const commandAnswer = await sendCommand({ kind: 'concurrency-set', limit: RAISED_CONCURRENCY_LIMIT });
      expect(commandAnswer).toMatchObject({ verdict: 'answered', status: 200 });
      keep('serving-every-contract', requestCallShapeOf(requestOf('POST', PATHS.commands, bearerToken)), commandAnswer);
      const second = await chunksUntil(stream, 1);
      stream.close();
      const chunks = [...first.chunks, ...second.chunks];
      expect(snapshotsIn(chunks).map((snapshot) => (snapshot['concurrency'] as { limit: number }).limit)).toEqual([expect.any(Number), RAISED_CONCURRENCY_LIMIT]);
      keep('serving-every-contract', streamCallShapeOf(streamRequestOf(bearerToken)), { verdict: 'streaming', chunks, ending: 'stays-open' });
    });

    test('answers 401 to the monitor and its stream asked with another Overseer\'s token', async () => {
      const monitorRequest = requestOf('GET', PATHS.monitor, WRONG_TOKEN);
      const monitorAnswer  = await realOverseerFetch().request(monitorRequest);
      expect(monitorAnswer).toMatchObject({ verdict: 'answered', status: 401 });
      keep('token-rejected', requestCallShapeOf(monitorRequest), monitorAnswer);
      const streamAnswer = await realOverseerFetch().openStream(streamRequestOf(WRONG_TOKEN));
      expect(streamAnswer).toMatchObject({ verdict: 'answered', status: 401 });
      if (streamAnswer.verdict !== 'streaming') keep('token-rejected', streamCallShapeOf(streamRequestOf(WRONG_TOKEN)), streamAnswer);
    });

    test('refuses a machine limit above the CPU count in its own words', async () => {
      const answer = await sendCommand({ kind: 'machine-agent-limit-set', limit: MACHINE_LIMIT_ABOVE_ANY_CPU_COUNT });
      expect(answer).toMatchObject({ verdict: 'answered', status: 409 });
      keep('command-refused', requestCallShapeOf(requestOf('POST', PATHS.commands, bearerToken)), answer);
    });

    test('answers nothing-to-do to a machine limit it already holds, and streams the lowered limit', async () => {
      const monitorAnswer = await realOverseerFetch().request(requestOf('GET', PATHS.monitor, bearerToken));
      const cpuCount = monitorAnswer.verdict === 'answered' ? (JSON.parse(monitorAnswer.bodyText) as { concurrency: { machineLimit: number } }).concurrency.machineLimit : 0;
      expect(await sendCommand({ kind: 'machine-agent-limit-set', limit: LOWERED_MACHINE_LIMIT })).toMatchObject({ verdict: 'answered', status: 200 });
      const repeated = await sendCommand({ kind: 'machine-agent-limit-set', limit: LOWERED_MACHINE_LIMIT });
      expect(repeated.verdict === 'answered' ? JSON.parse(repeated.bodyText) as unknown : repeated).toMatchObject({ outcome: 'nothing-to-do' });
      keep('nothing-to-change', requestCallShapeOf(requestOf('POST', PATHS.commands, bearerToken)), repeated);
      const stream = await openedStream(bearerToken);
      const { chunks } = await chunksUntil(stream, 1);
      stream.close();
      expect(snapshotsIn(chunks)).toEqual([expect.objectContaining({ concurrency: expect.objectContaining({ machineLimit: LOWERED_MACHINE_LIMIT }) })]);
      keep('machine-limit-lowered', streamCallShapeOf(streamRequestOf(bearerToken)), { verdict: 'streaming', chunks, ending: 'stays-open' });
      // The situations after this one are recorded at the machine's own limit, its CPU count, again.
      expect(await sendCommand({ kind: 'machine-agent-limit-set', limit: cpuCount })).toMatchObject({ verdict: 'answered', status: 200 });
    });

    test('answers its refusal to the summary and the monitor while its board file cannot be read, and what its stream answers then', async () => {
      const boardFilePath = join(repository, ...BOARD_FILE_PATH);
      const boardFile = readFileSync(boardFilePath, 'utf8');
      writeFileSync(boardFilePath, '{"version": 2, "trackerId": ');
      try {
        for (const unreadableRequest of [requestOf('GET', PATHS.summary, null), requestOf('GET', PATHS.monitor, bearerToken)]) {
          const answer = await realOverseerFetch().request(unreadableRequest);
          expect(answer).toMatchObject({ verdict: 'answered', status: 500 });
          keep('board-unreadable', requestCallShapeOf(unreadableRequest), answer);
        }
        const streamAnswer = await realOverseerFetch().openStream(streamRequestOf(bearerToken));
        if (streamAnswer.verdict === 'streaming') {
          const { chunks } = await chunksUntil(streamAnswer.stream, 1);
          streamAnswer.stream.close();
          keep('board-unreadable', streamCallShapeOf(streamRequestOf(bearerToken)), { verdict: 'streaming', chunks, ending: 'stays-open' });
        } else {
          keep('board-unreadable', streamCallShapeOf(streamRequestOf(bearerToken)), streamAnswer);
        }
      } finally {
        writeFileSync(boardFilePath, boardFile);
      }
    });

    test('accepts and never answers while it is suspended', async () => {
      suspendedProcessId = overseerProcessId;
      process.kill(overseerProcessId, 'SIGSTOP');
      try {
        expect(await keepVersions('not-answering', SUSPENDED_BOUND_MILLISECONDS)).toEqual({ verdict: 'timed-out' });
        const identityRequest = { ...requestOf('GET', PATHS.identity, null), timeoutMilliseconds: SUSPENDED_BOUND_MILLISECONDS };
        const identityAnswer = await realOverseerFetch().request(identityRequest);
        expect(identityAnswer).toEqual({ verdict: 'timed-out' });
        keep('not-answering', requestCallShapeOf(identityRequest), identityAnswer);
        const streamAnswer = await realOverseerFetch().openStream(streamRequestOf(bearerToken, SUSPENDED_BOUND_MILLISECONDS));
        expect(streamAnswer).toEqual({ verdict: 'timed-out' });
        if (streamAnswer.verdict !== 'streaming') keep('not-answering', streamCallShapeOf(streamRequestOf(bearerToken)), streamAnswer);
      } finally {
        process.kill(overseerProcessId, 'SIGCONT');
        suspendedProcessId = null;
      }
    });

    test('ends an open stream at a Baton pass, and its successor serves', async () => {
      const stream = await openedStream(bearerToken);
      const { chunks } = await chunksUntil(stream, 1);
      expect(await sendCommand({ kind: 'overseer-restart', now: false })).toMatchObject({ verdict: 'answered', status: 200 });
      const ending = await chunksUntilTheEnd(stream, chunks);
      keep('baton-pass', streamCallShapeOf(streamRequestOf(bearerToken)), { verdict: 'streaming', chunks, ending });
      expect(snapshotsIn(chunks).length).toBeGreaterThanOrEqual(1);
      const restarted = await scratchForge.runForDocument(repository, ['start', '--json']);
      expect(restarted).toMatchObject({ started: false });
      followTheLiveOverseer();
    }, SETUP_TIMEOUT_MILLISECONDS);

    test('breaks an open stream when its Overseer is killed', async () => {
      const stream = await openedStream(bearerToken);
      const { chunks } = await chunksUntil(stream, 1);
      process.kill(overseerProcessId, 'SIGKILL');
      const ending = await chunksUntilTheEnd(stream, chunks);
      keep('connection-broken', streamCallShapeOf(streamRequestOf(bearerToken)), { verdict: 'streaming', chunks, ending });
    });

    test('answers its versions and 503 starting to its identity while its Overseer starts, and to its monitor until it took its generation', async () => {
      const { port } = new URL(overseerUrl);
      const caught: { versions: OverseerAnswer | null; identity: OverseerAnswer | null; monitor: OverseerAnswer | null; stream: OverseerAnswer | null } = {
        versions: null, identity: null, monitor: null, stream: null,
      };
      for (let start = 0; start < STARTS_TRIED_FOR_THE_STARTING_WINDOW && (caught.identity === null || caught.monitor === null); start += 1) {
        const programArguments = ['oversee', '--port', port];
        const owned = scratchForge.processRun.startOwned({ program: forgeProgramToRun(recordingName), programArguments, workingDirectory: repository });
        if (owned.verdict !== 'started') throw new Error(`oversee answered ${JSON.stringify(owned)}`);
        for (let look = 0; look < STARTING_LOOKS_PER_START; look += 1) {
          const answer = await realOverseerFetch().request({ ...requestOf('GET', PATHS.identity, null), timeoutMilliseconds: SUSPENDED_BOUND_MILLISECONDS });
          if (answer.verdict !== 'answered') continue;
          if (answer.status !== 503) break;
          if (caught.identity === null) caught.versions = await realOverseerFetch().request(requestOf('GET', ApiPathUtil.VERSIONS_PATH, null));
          caught.identity ??= answer;
        }
        for (let look = 0; look < STARTING_LOOKS_PER_START && caught.monitor === null; look += 1) {
          const startingToken = readFileSync(tokenPath, 'utf8').trim();
          const [monitorAnswer, streamAnswer] = await Promise.all([
            realOverseerFetch().request(requestOf('GET', PATHS.monitor, startingToken)),
            realOverseerFetch().openStream(streamRequestOf(startingToken)),
          ]);
          if (streamAnswer.verdict === 'streaming') streamAnswer.stream.close();
          else if (streamAnswer.verdict === 'answered' && streamAnswer.status === 404) caught.stream ??= streamAnswer;
          if (monitorAnswer.verdict === 'answered' && monitorAnswer.status === 503) caught.monitor ??= monitorAnswer;
          if (monitorAnswer.verdict === 'answered' && monitorAnswer.status === 200) break;
        }
        await scratchForge.run(repository, ['stop', '--now', '--json']);
        owned.child.stop();
        await owned.child.exited;
      }
      if (caught.identity === null) throw new Error(`No identity answered 503 within ${STARTS_TRIED_FOR_THE_STARTING_WINDOW} starts.`);
      keep('starting', requestCallShapeOf(requestOf('GET', PATHS.identity, null)), caught.identity);
      if (caught.versions !== null) keep('starting', requestCallShapeOf(requestOf('GET', ApiPathUtil.VERSIONS_PATH, null)), caught.versions);
      if (caught.monitor !== null) keep('starting', requestCallShapeOf(requestOf('GET', PATHS.monitor, bearerToken)), caught.monitor);
      if (caught.stream !== null) keep('starting', streamCallShapeOf(streamRequestOf(bearerToken)), caught.stream);
      console.log(`The starting window gave: ${JSON.stringify(caught)}`);
    }, SETUP_TIMEOUT_MILLISECONDS);
  });
}
