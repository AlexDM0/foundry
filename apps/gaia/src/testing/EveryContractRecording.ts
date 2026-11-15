/**
 * The real-system suite of overseer-fetch against a forge that serves every contract (F1 to F7) at one monitor contract, which a recording
 * spec runs: `GAIA_RECORDING_FORGE_PROGRAM=<program> bun run record <name>` with the program of such a forge. It starts that
 * forge under a scratch home in a scratch repository as Example Storefront, and records what the boundary answers in each situation a
 * running forge can be brought into: serving, a token it refuses, a command it refuses or finds already done, the machine limit lowered,
 * a board file it cannot read, suspended so it accepts and never answers, a Baton pass, killed under an open stream, and starting. From
 * control contract 2 it also records the states of Flint's brain that the brain's commands bring it into. The values the run draws (paths,
 * tracker id, port, process ids) are recorded as the Storefront's example values; the forge's install version stamps the recording.
 * Test-only.
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
import { FLINT_BRAIN_CONTRACT_VERSIONS } from 'overseer-contracts/OverseerContractVersions';

import {
  realOverseerFetch,
  type OverseerAnswer,
  type OverseerRequest,
  type OverseerStream,
  type OverseerStreamRequest,
} from '../lib/forge-client/OverseerFetch.ts';

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

interface KeptAnswer {
  readonly callShape: string;
  readonly answer:    OverseerAnswer | RecordedStreamAnswer;
}

export interface EveryContractRecording {
  readonly recordingName:  string;
  /** The monitor contract the forge recorded from serves: the identity names it and every snapshot carries it. */
  readonly monitorVersion: number;
  /** The control contract the forge recorded from serves, which the identity names. */
  readonly controlVersion: number;
}

export function describeEveryContractRecording({ recordingName, monitorVersion, controlVersion }: EveryContractRecording): void {
  let scratchForge: ScratchForge;
  let repository = '';
  let overseerUrl = '';
  let bearerToken = '';
  let overseerProcessId = 0;
  let suspendedProcessId: number | null = null;
  let processIdsSeen = 0;
  let trackerIdDrawn = '';
  let tokenPath = '';
  const keptAnswers: KeptAnswer[] = [];

  function keep(situation: OverseerSituation | FlintBrainSituation, callShape: string, answer: OverseerAnswer | RecordedStreamAnswer): void {
    keptAnswers.push({ callShape: situationCallShapeOf(situation, callShape), answer });
  }

  function requestOf(method: OverseerRequest['method'], path: string, token: string | null, jsonBody: string | null = null): OverseerRequest {
    return {
      overseerUrl, method, path, bearerToken: token, jsonBody, timeoutMilliseconds: GENEROUS_BOUND_MILLISECONDS,
    };
  }

  function streamRequestOf(token: string, timeoutMilliseconds = GENEROUS_BOUND_MILLISECONDS): OverseerStreamRequest {
    return {
      overseerUrl, path: '/api/monitor/events', bearerToken: token, timeoutMilliseconds,
    };
  }

  async function sendCommand(command: Record<string, unknown>): Promise<OverseerAnswer> {
    return realOverseerFetch().request(requestOf('POST', '/api/commands', bearerToken, JSON.stringify(command)));
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

  /** Reads the stream until a snapshot shows Flint's brain in `state`, and keeps what the stream, the monitor and the identity answer then. */
  async function keepTheBrainOnceItIs(situation: FlintBrainSituation, state: string): Promise<void> {
    const stream = await openedStream(bearerToken);
    const chunks: string[] = [];
    try {
      const brainIsInState = (snapshot: Record<string, unknown>): boolean => (snapshot['flintBrain'] as { state?: unknown } | null)?.state === state;
      for (let event = 1; !snapshotsIn(chunks).some(brainIsInState); event += 1) {
        if (event > SETTLING_EVENTS_AT_MOST) throw new Error(`Flint's brain was not ${state} within ${SETTLING_EVENTS_AT_MOST} monitor events.`);
        const { chunks: eventChunks, ending } = await chunksUntil(stream, 1);
        chunks.push(...eventChunks);
        if (ending !== null) throw new Error(`The monitor stream ended ${ending} before Flint's brain was ${state}.`);
      }
    } finally {
      stream.close();
    }
    keep(situation, streamCallShapeOf(streamRequestOf(bearerToken)), { verdict: 'streaming', chunks, ending: 'stays-open' });
    const monitorRequest = requestOf('GET', '/api/monitor', bearerToken);
    keep(situation, requestCallShapeOf(monitorRequest), await realOverseerFetch().request(monitorRequest));
    const identityRequest = requestOf('GET', '/api/identity', null);
    keep(situation, requestCallShapeOf(identityRequest), await realOverseerFetch().request(identityRequest));
  }

  function exampleAnswerOf(answer: OverseerAnswer | RecordedStreamAnswer): OverseerAnswer | RecordedStreamAnswer {
    if (answer.verdict === 'answered') return { ...answer, bodyText: scratchForge.exampleTextOf(answer.bodyText) };
    if (answer.verdict === 'streaming') return { ...answer, chunks: answer.chunks.map((chunk) => scratchForge.exampleTextOf(chunk)) };
    return answer;
  }

  beforeAll(async () => {
    scratchForge = createScratchForge(recordingName);
    repository   = await scratchForge.createRepository('example-storefront');
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
  }, SETUP_TIMEOUT_MILLISECONDS);

  afterAll(async () => {
    if (suspendedProcessId !== null) process.kill(suspendedProcessId, 'SIGCONT');
    const recorded = keptAnswers.splice(0).map(({ callShape, answer }) => ({ callShape, answer: exampleAnswerOf(answer) }));
    const scratchPathsLeft = recorded.filter(({ answer }) => JSON.stringify(answer).includes(scratchRoot()));
    for (const { callShape, answer } of scratchPathsLeft.length === 0 ? recorded : []) recordAnswer(recordingName, callShape, answer);
    await scratchForge.remove();
    if (scratchPathsLeft.length > 0) throw new Error(`A scratch path is left in ${scratchPathsLeft.map(({ callShape }) => callShape).join(', ')}: nothing is recorded.`);
  }, SETUP_TIMEOUT_MILLISECONDS);

  describe('a forge that serves every contract', () => {
    test(`answers its identity with identityVersion 1, monitor contract ${monitorVersion}, control contract ${controlVersion} and every other contract at 1`, async () => {
      const identityRequest = requestOf('GET', '/api/identity', null);
      const answer = await realOverseerFetch().request(identityRequest);
      expect(answer).toMatchObject({ verdict: 'answered', status: 200 });
      const identity = answer.verdict === 'answered' ? JSON.parse(answer.bodyText) as Record<string, unknown> : {};
      expect(identity).toMatchObject({
        identityVersion: 1,
        contracts:       {
          summary: 1, monitor: monitorVersion, control: controlVersion, embed: 1
        }
      });
      recordSystemVersion(recordingName, `install version ${String(identity['installVersion'])}, code ${String(identity['codeVersion'])}`);
      keep('serving-every-contract', requestCallShapeOf(identityRequest), answer);
    });

    test(`answers its monitor snapshot at monitor version ${monitorVersion} and a session code`, async () => {
      const monitorRequest = requestOf('GET', '/api/monitor', bearerToken);
      const monitorAnswer  = await realOverseerFetch().request(monitorRequest);
      expect(monitorAnswer).toMatchObject({ verdict: 'answered', status: 200 });
      expect(monitorAnswer.verdict === 'answered' ? JSON.parse(monitorAnswer.bodyText) as unknown : null).toMatchObject({ monitorVersion });
      keep('serving-every-contract', requestCallShapeOf(monitorRequest), monitorAnswer);
      const sessionCodeRequest = requestOf('POST', '/api/session-codes', bearerToken);
      const sessionCodeAnswer  = await realOverseerFetch().request(sessionCodeRequest);
      expect(sessionCodeAnswer).toMatchObject({ verdict: 'answered', status: 200 });
      keep('serving-every-contract', requestCallShapeOf(sessionCodeRequest), sessionCodeAnswer);
    });

    test('streams a whole snapshot on connect and another after a command changed it, and answers the command done', async () => {
      const stream = await openedStream(bearerToken);
      const first  = await chunksUntil(stream, 1);
      const commandAnswer = await sendCommand({ kind: 'concurrency-set', limit: RAISED_CONCURRENCY_LIMIT });
      expect(commandAnswer).toMatchObject({ verdict: 'answered', status: 200 });
      keep('serving-every-contract', requestCallShapeOf(requestOf('POST', '/api/commands', bearerToken)), commandAnswer);
      const second = await chunksUntil(stream, 1);
      stream.close();
      const chunks = [...first.chunks, ...second.chunks];
      expect(snapshotsIn(chunks).map((snapshot) => (snapshot['concurrency'] as { limit: number }).limit)).toEqual([expect.any(Number), RAISED_CONCURRENCY_LIMIT]);
      keep('serving-every-contract', streamCallShapeOf(streamRequestOf(bearerToken)), { verdict: 'streaming', chunks, ending: 'stays-open' });
    });

    test('answers 401 to the monitor and its stream asked with another Overseer\'s token', async () => {
      const monitorRequest = requestOf('GET', '/api/monitor', WRONG_TOKEN);
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
      keep('command-refused', requestCallShapeOf(requestOf('POST', '/api/commands', bearerToken)), answer);
    });

    test('answers nothing-to-do to a machine limit it already holds, and streams the lowered limit', async () => {
      const monitorAnswer = await realOverseerFetch().request(requestOf('GET', '/api/monitor', bearerToken));
      const cpuCount = monitorAnswer.verdict === 'answered' ? (JSON.parse(monitorAnswer.bodyText) as { concurrency: { machineLimit: number } }).concurrency.machineLimit : 0;
      expect(await sendCommand({ kind: 'machine-agent-limit-set', limit: LOWERED_MACHINE_LIMIT })).toMatchObject({ verdict: 'answered', status: 200 });
      const repeated = await sendCommand({ kind: 'machine-agent-limit-set', limit: LOWERED_MACHINE_LIMIT });
      expect(repeated.verdict === 'answered' ? JSON.parse(repeated.bodyText) as unknown : repeated).toMatchObject({ outcome: 'nothing-to-do' });
      keep('nothing-to-change', requestCallShapeOf(requestOf('POST', '/api/commands', bearerToken)), repeated);
      const stream = await openedStream(bearerToken);
      const { chunks } = await chunksUntil(stream, 1);
      stream.close();
      expect(snapshotsIn(chunks)).toEqual([expect.objectContaining({ concurrency: expect.objectContaining({ machineLimit: LOWERED_MACHINE_LIMIT }) })]);
      keep('machine-limit-lowered', streamCallShapeOf(streamRequestOf(bearerToken)), { verdict: 'streaming', chunks, ending: 'stays-open' });
      // The situations after this one are recorded at the machine's own limit, its CPU count, again.
      expect(await sendCommand({ kind: 'machine-agent-limit-set', limit: cpuCount })).toMatchObject({ verdict: 'answered', status: 200 });
    });

    describe.if(controlVersion >= FLINT_BRAIN_CONTRACT_VERSIONS.control)('Flint\'s brain', () => {
      const commandShape = (): string => requestCallShapeOf(requestOf('POST', '/api/commands', bearerToken));

      test('answers a start of the brain done, and serves the brain running', async () => {
        const answer = await sendCommand({ kind: 'flint-brain-start' });
        expect(answer.verdict === 'answered' ? JSON.parse(answer.bodyText) as unknown : answer).toMatchObject({ outcome: 'done' });
        keep('brain-running', commandShape(), answer);
        await keepTheBrainOnceItIs('brain-running', 'running');
      }, FLINT_BRAIN_TIMEOUT_MILLISECONDS);

      test('answers a stop of the running brain done, and serves the brain ended', async () => {
        const answer = await sendCommand({ kind: 'flint-brain-stop' });
        expect(answer.verdict === 'answered' ? JSON.parse(answer.bodyText) as unknown : answer).toMatchObject({ outcome: 'done' });
        keep('brain-ended', commandShape(), answer);
        await keepTheBrainOnceItIs('brain-ended', 'ended');
      }, FLINT_BRAIN_TIMEOUT_MILLISECONDS);

      // The forge's requirements name no way to hold a scratch forge's usage limit or to run it without Flint, so these refuse to record.
      test('refuses a start while the usage limit holds, and serves the brain refused', () => {
        throw new Error('No requirement of the forge says how a scratch forge holds its usage limit: `brain-refused` stays authored.');
      });

      test('refuses a start without Flint, and serves no brain', () => {
        throw new Error('No requirement of the forge says how a scratch forge runs without Flint: `no-flint` stays authored.');
      });
    });

    test('answers its refusal to the summary and the monitor while its board file cannot be read, and what its stream answers then', async () => {
      const boardFilePath = join(repository, ...BOARD_FILE_PATH);
      const boardFile = readFileSync(boardFilePath, 'utf8');
      writeFileSync(boardFilePath, '{"version": 2, "trackerId": ');
      try {
        for (const unreadableRequest of [requestOf('GET', '/api/summary', null), requestOf('GET', '/api/monitor', bearerToken)]) {
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
        const identityRequest = { ...requestOf('GET', '/api/identity', null), timeoutMilliseconds: SUSPENDED_BOUND_MILLISECONDS };
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

    test('answers 503 starting to its identity while its Overseer starts, and to its monitor until it took its generation', async () => {
      const { port } = new URL(overseerUrl);
      const caught: { identity: OverseerAnswer | null; monitor: OverseerAnswer | null; stream: OverseerAnswer | null } = { identity: null, monitor: null, stream: null };
      for (let start = 0; start < STARTS_TRIED_FOR_THE_STARTING_WINDOW && (caught.identity === null || caught.monitor === null); start += 1) {
        const programArguments = ['oversee', '--port', port];
        const owned = scratchForge.processRun.startOwned({ program: forgeProgramToRun(recordingName), programArguments, workingDirectory: repository });
        if (owned.verdict !== 'started') throw new Error(`oversee answered ${JSON.stringify(owned)}`);
        for (let look = 0; look < STARTING_LOOKS_PER_START; look += 1) {
          const answer = await realOverseerFetch().request({ ...requestOf('GET', '/api/identity', null), timeoutMilliseconds: SUSPENDED_BOUND_MILLISECONDS });
          if (answer.verdict !== 'answered') continue;
          if (answer.status !== 503) break;
          caught.identity ??= answer;
        }
        for (let look = 0; look < STARTING_LOOKS_PER_START && caught.monitor === null; look += 1) {
          const startingToken = readFileSync(tokenPath, 'utf8').trim();
          const [monitorAnswer, streamAnswer] = await Promise.all([
            realOverseerFetch().request(requestOf('GET', '/api/monitor', startingToken)),
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
      keep('starting', requestCallShapeOf(requestOf('GET', '/api/identity', null)), caught.identity);
      if (caught.monitor !== null) keep('starting', requestCallShapeOf(requestOf('GET', '/api/monitor', bearerToken)), caught.monitor);
      if (caught.stream !== null) keep('starting', streamCallShapeOf(streamRequestOf(bearerToken)), caught.stream);
      console.log(`The starting window gave: ${JSON.stringify(caught)}`);
    }, SETUP_TIMEOUT_MILLISECONDS);
  });
}
