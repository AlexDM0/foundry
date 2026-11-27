/**
 * The real-system suite of hephaestus-fetch against a forge, which the recording spec of `hephaestus-fetch-supported-forge` runs: a forge at the
 * one system version Gaia supports, recorded with `GAIA_RECORDING_FORGE_PROGRAM=<program> bun run record <name>` and the program of such a
 * forge. It starts that forge under a scratch home in scratch repositories and records `GET /api/versions` and each endpoint at the
 * versioned path Gaia calls: as Example Project, serving, a token it refuses, and stopped; as Example Storefront, each situation a running
 * forge can be brought into: serving, a token it refuses, a command it refuses or finds already done, the machine limit lowered, a board
 * file it cannot read, suspended so it accepts and never answers, a restart, killed under an open stream, and starting. Each forge runs on the
 * agent its board offers, which starts a setup record left at its billing step, since a forge with no agent chosen launches no job. The values the
 * run draws (paths, tracker ids, ports, process ids) are recorded as example values; the forge's install and code versions stamp the
 * recording. Test-only.
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

import { ApiPathUtil }                                         from '../lib/api-paths/ApiPathUtil.ts';
import { forgeEndpointVersionOf, type HephaestusEndpointName } from '../lib/forge-client/ForgeClient.ts';
import {
  realHephaestusFetch,
  type HephaestusAnswer,
  type HephaestusRequest,
  type HephaestusStream,
  type HephaestusStreamRequest,
} from '../lib/forge-client/HephaestusFetch.ts';
import { CONTRACT_VERSIONS } from '../shared/constants/ContractVersions.ts';

import { SUPPORTED_FORGE_VERSION }           from '../shared/constants/SupportedForgeVersions.ts';
import { recordAnswer, recordSystemVersion } from './BoundaryRecordings.ts';
import {
  requestCallShapeOf,
  situationCallShapeOf,
  streamCallShapeOf,
  type HephaestusSituation,
  type RecordedStreamAnswer,
} from './RecordedAnswers.ts';
import {
  agentAtTheFoundPlaceOf,
  createScratchForge,
  forgeProgramToRun,
  type ScratchForge,
} from './ScratchForge.ts';
import { scratchRoot } from './ScratchRoot.ts';

const SETUP_TIMEOUT_MILLISECONDS = 180_000;
const GENEROUS_BOUND_MILLISECONDS = 10_000;
const SUSPENDED_BOUND_MILLISECONDS = 1_000;
const WRONG_TOKEN = 'example-token-of-another-hephaestus';
const STOREFRONT = {
  root:              '/Users/alexexample/development/example-storefront',
  trackerId:         'example-storefront-7c41',
  hephaestusAddress: '127.0.0.1:4951',
  firstProcessId:    48_107,
} as const;
const EXAMPLE_PROJECT = {
  root:              '/Users/alexexample/development/example-project',
  trackerId:         '712f8bdb-e7cf-48bc-86a5-2616d2cf935f',
  hephaestusAddress: '127.0.0.1:54795',
  processId:         21_008,
} as const;
const EXAMPLE_TOKEN = 'example-token';
const UNAUTHORIZED_STATUS = 401;
const SUCCESS_STATUS = 200;
const RAISED_CONCURRENCY_LIMIT = 3;
const LOWERED_MACHINE_LIMIT = 4;
const MACHINE_LIMIT_ABOVE_ANY_CPU_COUNT = 64;
/** How often the starting Hephaestus is looked for, and how many starts are tried, before the starting window is given up on. */
const STARTING_LOOKS_PER_START = 20_000;
const STARTS_TRIED_FOR_THE_STARTING_WINDOW = 10;
const MONITOR_EVENT_PATTERN = /event: monitor\ndata: [^\n]*\n\n/g;
/** How often, and how many times, the registry is looked at for the successor a restart starts once its predecessor let go. */
const SUCCESSOR_LOOK_INTERVAL_MILLISECONDS = 100;
const SUCCESSOR_LOOKS_AT_MOST = 100;
const BOARD_FILE_PATH = ['.forge', 'progress.json'] as const;
/** The question Hephaestus's first pass opens on a board with no checks set. */
const FIRST_PASS_QUESTION_KIND = 'question';
const SETTLING_EVENTS_AT_MOST = 40;
const INTAKE_REQUEST = 'Example: suggest searches as the shopper types.';
const JOBS_AT_WORK_AFTER_AN_INTAKE = 1;
/** Forge's test setting that keeps each fake agent's session working until it is stopped, so a job stays at work while it is recorded. */
const FAKE_AGENT_KEEPS_WORKING_VARIABLE = 'FORGE_FAKE_AGENT_KEEPS_WORKING';
interface KeptAnswer {
  readonly callShape:    string;
  readonly answer:       HephaestusAnswer | RecordedStreamAnswer;
  /** The forge that answered, whose drawn values the answer's example text replaces. */
  readonly scratchForge: ScratchForge;
}

/** The path Gaia calls an endpoint at: the version forge's registry serves the supported forge version. */
function pathOf(endpointName: HephaestusEndpointName, endpoint: string): string {
  return ApiPathUtil.versionedPathOf(endpoint, forgeEndpointVersionOf(endpointName, SUPPORTED_FORGE_VERSION));
}

const PATHS = {
  identity:      pathOf('identity', 'identity'),
  summary:       pathOf('summary', 'summary'),
  monitor:       pathOf('monitor', 'monitor'),
  monitorEvents: pathOf('monitorEvents', 'monitor/events'),
  commands:      pathOf('commands', 'commands'),
  board:         pathOf('board', 'board'),
} as const;

/**
 * A forge with no agent chosen launches no job, and with no pipeline stored only a setup record takes one: the setup is started with the
 * agent the board offers and no billing, so the record stands at its billing step and no pipeline agent launches beside the intake's
 * product owner.
 */
async function startASetupWithTheAgent(hephaestusUrl: string, bearerToken: string): Promise<void> {
  const requestOf = (method: HephaestusRequest['method'], path: string, jsonBody: string | null): HephaestusRequest => ({
    hephaestusUrl, method, path, bearerToken, jsonBody, byteBody: null, answerAs: 'text', timeoutMilliseconds: GENEROUS_BOUND_MILLISECONDS,
  });
  const bodyOf = (answer: HephaestusAnswer): Record<string, unknown> => {
    if (answer.verdict !== 'answered' || answer.status !== SUCCESS_STATUS) throw new Error(`The forge answered ${JSON.stringify(answer)}`);
    return JSON.parse(answer.bodyText) as Record<string, unknown>;
  };
  const board = bodyOf(await realHephaestusFetch().request(requestOf('GET', PATHS.board, null)));
  const setupStart = { kind: 'pipeline-setup-start', agent: agentAtTheFoundPlaceOf(board), replacesUnreadablePipeline: false };
  bodyOf(await realHephaestusFetch().request(requestOf('POST', PATHS.commands, JSON.stringify(setupStart))));
}

export function describeSupportedForgeRecording(recordingName: string): void {
  const monitorVersion = CONTRACT_VERSIONS.forgeMonitor;
  const controlVersion = CONTRACT_VERSIONS.forgeControl;
  let scratchForge: ScratchForge;
  let repository = '';
  let hephaestusUrl = '';
  let bearerToken = '';
  let hephaestusProcessId = 0;
  let suspendedProcessId: number | null = null;
  let processIdsSeen = 0;
  let trackerIdDrawn = '';
  let tokenPath = '';
  const createdForges: ScratchForge[] = [];
  const keptAnswers: KeptAnswer[] = [];

  function keep(situation: HephaestusSituation, callShape: string, answer: HephaestusAnswer | RecordedStreamAnswer): void {
    keptAnswers.push({ callShape: situationCallShapeOf(situation, callShape), answer, scratchForge });
  }

  function requestOf(method: HephaestusRequest['method'], path: string, token: string | null, jsonBody: string | null = null): HephaestusRequest {
    return {
      hephaestusUrl, method, path, bearerToken: token, jsonBody, byteBody: null, answerAs: 'text', timeoutMilliseconds: GENEROUS_BOUND_MILLISECONDS,
    };
  }

  function streamRequestOf(token: string, timeoutMilliseconds = GENEROUS_BOUND_MILLISECONDS): HephaestusStreamRequest {
    return {
      hephaestusUrl, path: PATHS.monitorEvents, bearerToken: token, lastEventId: null, timeoutMilliseconds,
    };
  }

  /** Keeps what the forge answers at `/api/versions` in a situation, which Gaia asks before anything else. */
  async function keepVersions(situation: HephaestusSituation, timeoutMilliseconds = GENEROUS_BOUND_MILLISECONDS): Promise<HephaestusAnswer> {
    const versionsRequest = { ...requestOf('GET', ApiPathUtil.VERSIONS_PATH, null), timeoutMilliseconds };
    const answer = await realHephaestusFetch().request(versionsRequest);
    keep(situation, requestCallShapeOf(versionsRequest), answer);
    return answer;
  }

  /** Stamps the recording with the install and code versions the forge's identity answer names. */
  function stampWithTheForgeIn(identityAnswer: HephaestusAnswer): void {
    const identity = identityAnswer.verdict === 'answered' ? JSON.parse(identityAnswer.bodyText) as Record<string, unknown> : {};
    recordSystemVersion(recordingName, `install version ${String(identity['installVersion'])}, code ${String(identity['codeVersion'])}`);
  }

  async function sendCommand(command: Record<string, unknown>): Promise<HephaestusAnswer> {
    return realHephaestusFetch().request(requestOf('POST', PATHS.commands, bearerToken, JSON.stringify(command)));
  }

  /** Reads Hephaestus the registry names now: its address, process and token, each run-drawn value given its example. */
  function followTheLiveHephaestus(): void {
    const hephaestus = scratchForge.registryEntryOf(trackerIdDrawn)?.['hephaestus'] as { url: string; processId: number; tokenPath: string } | undefined;
    if (hephaestus === undefined) throw new Error('the registry names no live Hephaestus');
    ({ url: hephaestusUrl, processId: hephaestusProcessId, tokenPath } = hephaestus);
    bearerToken       = readFileSync(tokenPath, 'utf8').trim();
    scratchForge.exampleValueFor({ drawn: new URL(hephaestus.url).host, example: STOREFRONT.hephaestusAddress });
    const exampleProcessId = STOREFRONT.firstProcessId + processIdsSeen;
    processIdsSeen += 1;
    scratchForge.exampleValueFor({ drawn: `"processId":${hephaestus.processId}`, example: `"processId":${exampleProcessId}` });
    scratchForge.exampleValueFor({ drawn: `process ${hephaestus.processId}`, example: `process ${exampleProcessId}` });
  }

  /** The chunks of a stream read until it holds `wholeEvents` monitor events, or until it ends; the stream is left open. */
  async function chunksUntil(stream: HephaestusStream, wholeEvents: number): Promise<{ readonly chunks: string[]; readonly ending: 'closed' | 'broken' | null }> {
    const chunks: string[] = [];
    while ((chunks.join('').match(MONITOR_EVENT_PATTERN) ?? []).length < wholeEvents) {
      const chunk = await stream.nextChunk();
      if (chunk.kind === 'ended') return { chunks, ending: chunk.ending };
      chunks.push(chunk.text);
    }
    return { chunks, ending: null };
  }

  async function chunksUntilTheEnd(stream: HephaestusStream, chunks: string[]): Promise<'closed' | 'broken'> {
    for (;;) {
      const chunk = await stream.nextChunk();
      if (chunk.kind === 'ended') return chunk.ending;
      chunks.push(chunk.text);
    }
  }

  async function openedStream(token: string, streamUrl: string = hephaestusUrl): Promise<HephaestusStream> {
    const opening = await realHephaestusFetch().openStream({ ...streamRequestOf(token), hephaestusUrl: streamUrl });
    if (opening.verdict !== 'streaming') throw new Error(`the monitor stream answered ${JSON.stringify(opening)}`);
    return opening.stream;
  }

  function snapshotsIn(chunks: readonly string[]): Record<string, unknown>[] {
    return (chunks.join('').match(MONITOR_EVENT_PATTERN) ?? []).map((event) => JSON.parse(event.slice(event.indexOf('data: ') + 'data: '.length)) as Record<string, unknown>);
  }

  /**
   * Waits on the stream until Hephaestus's first pass has opened its question and the board holds `jobsAtWork` jobs. A new board's
   * Assistant is off, so only a job User asked for is at work on it.
   */
  async function boardHasSettled(jobsAtWork: number, streamUrl: string = hephaestusUrl, token: string = bearerToken): Promise<void> {
    const stream = await openedStream(token, streamUrl);
    try {
      for (let event = 1; event <= SETTLING_EVENTS_AT_MOST; event += 1) {
        const { chunks } = await chunksUntil(stream, 1);
        const settled = (snapshot: Record<string, unknown>): boolean => (snapshot['attention'] as { kind: string }[]).some((entry) => entry.kind === FIRST_PASS_QUESTION_KIND)
          && (snapshot['jobs'] as unknown[]).length === jobsAtWork;
        if (snapshotsIn(chunks).some(settled)) return;
      }
      throw new Error(`The board did not settle within ${SETTLING_EVENTS_AT_MOST} monitor events.`);
    } finally {
      stream.close();
    }
  }

  /** A start asked before the successor registered itself would start a Hephaestus of its own, so the registry is waited on first. */
  async function successorHasTakenTheBoardFrom(predecessorProcessId: number): Promise<void> {
    for (let look = 0; look < SUCCESSOR_LOOKS_AT_MOST; look += 1) {
      const hephaestus = scratchForge.registryEntryOf(trackerIdDrawn)?.['hephaestus'] as { processId: number } | null | undefined;
      if (hephaestus !== undefined && hephaestus !== null && hephaestus.processId !== predecessorProcessId) return;
      await Bun.sleep(SUCCESSOR_LOOK_INTERVAL_MILLISECONDS);
    }
    throw new Error(`No successor took the board within ${SUCCESSOR_LOOKS_AT_MOST} looks at the registry.`);
  }

  function exampleAnswerOf({ answer, scratchForge: answeringForge }: KeptAnswer): HephaestusAnswer | RecordedStreamAnswer {
    if (answer.verdict === 'answered') return { ...answer, bodyText: answeringForge.exampleTextOf(answer.bodyText) };
    if (answer.verdict === 'streaming') return { ...answer, chunks: answer.chunks.map((chunk) => answeringForge.exampleTextOf(chunk)) };
    return answer;
  }

  /** Starts Example Storefront at work on a scratch forge of its own, and follows its Hephaestus. */
  async function startStorefront(): Promise<void> {
    scratchForge = createScratchForge(recordingName, { forgeVariables: { [FAKE_AGENT_KEEPS_WORKING_VARIABLE]: '1' } });
    createdForges.push(scratchForge);
    processIdsSeen = 0;
    repository     = await scratchForge.createRepository('example-storefront');
    scratchForge.exampleValueFor({ drawn: repository, example: STOREFRONT.root });
    const initialised = await scratchForge.runForDocument(repository, ['init', '--project', 'Example Storefront', '--no-hooks', '--json']);
    trackerIdDrawn = String(initialised['trackerId']);
    scratchForge.exampleValueFor({ drawn: trackerIdDrawn, example: STOREFRONT.trackerId });
    await scratchForge.runForDocument(repository, ['ticket', 'add', 'Search suggestions', '--type', 'ticket', '--json']);
    await scratchForge.runForDocument(repository, ['start', '--json']);
    followTheLiveHephaestus();
    await startASetupWithTheAgent(hephaestusUrl, bearerToken);
    // A new board starts paused; a forge at work runs, here the product owner of an intake User started.
    expect(await sendCommand({ kind: 'hephaestus-unpause' })).toMatchObject({ verdict: 'answered', status: 200 });
    expect(await sendCommand({ kind: 'intake-start', text: INTAKE_REQUEST, pictures: [] })).toMatchObject({ verdict: 'answered', status: 200 });
    await boardHasSettled(JOBS_AT_WORK_AFTER_AN_INTAKE);
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

  describe('Example Project, a second forge', () => {
    let projectRepository = '';
    let projectHephaestusUrl = '';

    function projectRequestOf(method: HephaestusRequest['method'], path: string, token: string | null, jsonBody: string | null = null): HephaestusRequest {
      return {
        hephaestusUrl:       projectHephaestusUrl,
        method,
        path,
        bearerToken:         token,
        jsonBody,
        byteBody:            null,
        answerAs:            'text',
        timeoutMilliseconds: GENEROUS_BOUND_MILLISECONDS,
      };
    }

    async function keepProjectAnswer(situation: HephaestusSituation, request: HephaestusRequest): Promise<HephaestusAnswer> {
      const answer = await realHephaestusFetch().request(request);
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
      const hephaestus = scratchForge.registryEntryOf(projectTrackerId)?.['hephaestus'] as { url: string; processId: number; tokenPath: string } | undefined;
      if (hephaestus === undefined) throw new Error('the registry names no live Hephaestus of Example Project');
      projectHephaestusUrl = hephaestus.url;
      const projectToken = readFileSync(hephaestus.tokenPath, 'utf8').trim();
      await startASetupWithTheAgent(projectHephaestusUrl, projectToken);
      // Its summary is recorded once the first pass opened its question and took up the intake User started, on a board still paused.
      const intake = projectRequestOf('POST', PATHS.commands, projectToken, JSON.stringify({ kind: 'intake-start', text: INTAKE_REQUEST, pictures: [] }));
      expect(await realHephaestusFetch().request(intake)).toMatchObject({ verdict: 'answered', status: SUCCESS_STATUS });
      await boardHasSettled(JOBS_AT_WORK_AFTER_AN_INTAKE, projectHephaestusUrl, projectToken);
      scratchForge.exampleValueFor({ drawn: new URL(hephaestus.url).host, example: EXAMPLE_PROJECT.hephaestusAddress });
      scratchForge.exampleValueFor({ drawn: `"processId":${hephaestus.processId}`, example: `"processId":${EXAMPLE_PROJECT.processId}` });
    }, SETUP_TIMEOUT_MILLISECONDS);

    test('answers its versions, its identity and its board summary while it serves', async () => {
      for (const path of [ApiPathUtil.VERSIONS_PATH, PATHS.identity, PATHS.summary]) {
        const servingRequest = projectRequestOf('GET', path, null);
        expect(await keepProjectAnswer('serving', servingRequest)).toMatchObject({ verdict: 'answered', status: SUCCESS_STATUS });
      }
    });

    test('answers 401 to a command asked with another Hephaestus\'s token', async () => {
      const refusedRequest = projectRequestOf('POST', PATHS.commands, WRONG_TOKEN, JSON.stringify({ kind: 'hephaestus-pause' }));
      expect(await keepProjectAnswer('token-rejected', refusedRequest)).toMatchObject({ verdict: 'answered', status: UNAUTHORIZED_STATUS });
    });

    test('answers unreachable for every request and the monitor stream once it has stopped', async () => {
      await scratchForge.runForDocument(projectRepository, ['stop', '--now', '--json']);
      const requests = [
        projectRequestOf('GET', ApiPathUtil.VERSIONS_PATH, null),
        projectRequestOf('GET', PATHS.identity, null),
        projectRequestOf('GET', PATHS.summary, null),
        projectRequestOf('GET', PATHS.monitor, EXAMPLE_TOKEN),
        projectRequestOf('POST', PATHS.commands, EXAMPLE_TOKEN, JSON.stringify({ kind: 'hephaestus-pause' })),
      ];
      for (const stoppedRequest of requests) expect(await keepProjectAnswer('stopped', stoppedRequest)).toEqual({ verdict: 'unreachable' });
      const streamRequest = {
        hephaestusUrl: projectHephaestusUrl, path: PATHS.monitorEvents, bearerToken: EXAMPLE_TOKEN, lastEventId: null, timeoutMilliseconds: GENEROUS_BOUND_MILLISECONDS
      };
      const streamAnswer = await realHephaestusFetch().openStream(streamRequest);
      expect(streamAnswer).toEqual({ verdict: 'unreachable' });
      if (streamAnswer.verdict !== 'streaming') keep('stopped', streamCallShapeOf(streamRequest), streamAnswer);
    }, SETUP_TIMEOUT_MILLISECONDS);
  });

  describe('Example Storefront, a forge at work', () => {
    test(`answers its versions, and its identity with monitor contract ${monitorVersion}, control contract ${controlVersion} and every other at 1`, async () => {
      expect(await keepVersions('serving-every-contract')).toMatchObject({ verdict: 'answered', status: SUCCESS_STATUS });
      const identityRequest = requestOf('GET', PATHS.identity, null);
      const answer = await realHephaestusFetch().request(identityRequest);
      expect(answer).toMatchObject({ verdict: 'answered', status: 200 });
      expect(answer.verdict === 'answered' ? JSON.parse(answer.bodyText) as unknown : null).toMatchObject({
        identityVersion: 1,
        contracts:       { summary: 3, monitor: monitorVersion, control: controlVersion }
      });
      stampWithTheForgeIn(answer);
      keep('serving-every-contract', requestCallShapeOf(identityRequest), answer);
    });

    test(`answers its monitor snapshot at monitor version ${monitorVersion}`, async () => {
      const monitorRequest = requestOf('GET', PATHS.monitor, bearerToken);
      const monitorAnswer  = await realHephaestusFetch().request(monitorRequest);
      expect(monitorAnswer).toMatchObject({ verdict: 'answered', status: 200 });
      expect(monitorAnswer.verdict === 'answered' ? JSON.parse(monitorAnswer.bodyText) as unknown : null).toMatchObject({ monitorVersion });
      keep('serving-every-contract', requestCallShapeOf(monitorRequest), monitorAnswer);
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

    test('answers 401 to the monitor and its stream asked with another Hephaestus\'s token', async () => {
      const monitorRequest = requestOf('GET', PATHS.monitor, WRONG_TOKEN);
      const monitorAnswer  = await realHephaestusFetch().request(monitorRequest);
      expect(monitorAnswer).toMatchObject({ verdict: 'answered', status: 401 });
      keep('token-rejected', requestCallShapeOf(monitorRequest), monitorAnswer);
      const streamAnswer = await realHephaestusFetch().openStream(streamRequestOf(WRONG_TOKEN));
      expect(streamAnswer).toMatchObject({ verdict: 'answered', status: 401 });
      if (streamAnswer.verdict !== 'streaming') keep('token-rejected', streamCallShapeOf(streamRequestOf(WRONG_TOKEN)), streamAnswer);
    });

    test('refuses a machine limit above the CPU count in its own words', async () => {
      const answer = await sendCommand({ kind: 'machine-agent-limit-set', limit: MACHINE_LIMIT_ABOVE_ANY_CPU_COUNT });
      expect(answer).toMatchObject({ verdict: 'answered', status: 409 });
      keep('command-refused', requestCallShapeOf(requestOf('POST', PATHS.commands, bearerToken)), answer);
    });

    test('answers nothing-to-do to a machine limit it already holds, and streams the lowered limit', async () => {
      const monitorAnswer = await realHephaestusFetch().request(requestOf('GET', PATHS.monitor, bearerToken));
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
      writeFileSync(boardFilePath, '{"version": 3, "trackerId": ');
      try {
        for (const unreadableRequest of [requestOf('GET', PATHS.summary, null), requestOf('GET', PATHS.monitor, bearerToken)]) {
          const answer = await realHephaestusFetch().request(unreadableRequest);
          expect(answer).toMatchObject({ verdict: 'answered', status: 500 });
          keep('board-unreadable', requestCallShapeOf(unreadableRequest), answer);
        }
        const streamAnswer = await realHephaestusFetch().openStream(streamRequestOf(bearerToken));
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
      suspendedProcessId = hephaestusProcessId;
      process.kill(hephaestusProcessId, 'SIGSTOP');
      try {
        expect(await keepVersions('not-answering', SUSPENDED_BOUND_MILLISECONDS)).toEqual({ verdict: 'timed-out' });
        const identityRequest = { ...requestOf('GET', PATHS.identity, null), timeoutMilliseconds: SUSPENDED_BOUND_MILLISECONDS };
        const identityAnswer = await realHephaestusFetch().request(identityRequest);
        expect(identityAnswer).toEqual({ verdict: 'timed-out' });
        keep('not-answering', requestCallShapeOf(identityRequest), identityAnswer);
        const streamAnswer = await realHephaestusFetch().openStream(streamRequestOf(bearerToken, SUSPENDED_BOUND_MILLISECONDS));
        expect(streamAnswer).toEqual({ verdict: 'timed-out' });
        if (streamAnswer.verdict !== 'streaming') keep('not-answering', streamCallShapeOf(streamRequestOf(bearerToken)), streamAnswer);
      } finally {
        process.kill(hephaestusProcessId, 'SIGCONT');
        suspendedProcessId = null;
      }
    });

    test('ends an open stream at a restart, and its successor serves', async () => {
      const stream = await openedStream(bearerToken);
      const { chunks } = await chunksUntil(stream, 1);
      expect(await sendCommand({ kind: 'hephaestus-restart', now: false })).toMatchObject({ verdict: 'answered', status: 200 });
      const ending = await chunksUntilTheEnd(stream, chunks);
      keep('restart', streamCallShapeOf(streamRequestOf(bearerToken)), { verdict: 'streaming', chunks, ending });
      expect(snapshotsIn(chunks).length).toBeGreaterThanOrEqual(1);
      await successorHasTakenTheBoardFrom(hephaestusProcessId);
      const restarted = await scratchForge.runForDocument(repository, ['start', '--json']);
      expect(restarted).toMatchObject({ started: false });
      followTheLiveHephaestus();
    }, SETUP_TIMEOUT_MILLISECONDS);

    test('breaks an open stream when its Hephaestus is killed', async () => {
      const stream = await openedStream(bearerToken);
      const { chunks } = await chunksUntil(stream, 1);
      process.kill(hephaestusProcessId, 'SIGKILL');
      const ending = await chunksUntilTheEnd(stream, chunks);
      keep('connection-broken', streamCallShapeOf(streamRequestOf(bearerToken)), { verdict: 'streaming', chunks, ending });
    });

    test('answers its versions and 503 starting to its identity while its Hephaestus starts, and to its monitor until it took its generation', async () => {
      const { port } = new URL(hephaestusUrl);
      const caught: { versions: HephaestusAnswer | null; identity: HephaestusAnswer | null; monitor: HephaestusAnswer | null; stream: HephaestusAnswer | null } = {
        versions: null, identity: null, monitor: null, stream: null,
      };
      for (let start = 0; start < STARTS_TRIED_FOR_THE_STARTING_WINDOW && (caught.identity === null || caught.monitor === null); start += 1) {
        const programArguments = ['start', '--foreground', '--port', port];
        const owned = scratchForge.processRun.startOwned({ program: forgeProgramToRun(recordingName), programArguments, workingDirectory: repository });
        if (owned.verdict !== 'started') throw new Error(`start --foreground answered ${JSON.stringify(owned)}`);
        for (let look = 0; look < STARTING_LOOKS_PER_START; look += 1) {
          const answer = await realHephaestusFetch().request({ ...requestOf('GET', PATHS.identity, null), timeoutMilliseconds: SUSPENDED_BOUND_MILLISECONDS });
          if (answer.verdict !== 'answered') continue;
          if (answer.status !== 503) break;
          if (caught.identity === null) caught.versions = await realHephaestusFetch().request(requestOf('GET', ApiPathUtil.VERSIONS_PATH, null));
          caught.identity ??= answer;
        }
        for (let look = 0; look < STARTING_LOOKS_PER_START && caught.monitor === null; look += 1) {
          const startingToken = readFileSync(tokenPath, 'utf8').trim();
          const [monitorAnswer, streamAnswer] = await Promise.all([
            realHephaestusFetch().request(requestOf('GET', PATHS.monitor, startingToken)),
            realHephaestusFetch().openStream(streamRequestOf(startingToken)),
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
