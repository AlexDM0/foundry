/**
 * The real-system spec of overseer-fetch, run only by `GAIA_RECORDING_FORGE_PROGRAM=<program> bun run record overseer-fetch` with the
 * program of a forge checkout. It starts that forge under a scratch home in a scratch repository and records what the boundary answers for
 * each call shape a forge serves today: the identity and the summary, a token the forge refuses, and every call shape once the forge has
 * stopped; the forge's install version stamps the recording. Local servers prove the rest of the boundary against the real `fetch`: the
 * bearer and the body it sends, a bound that runs out, and a stream read until it ends, breaks or is closed.
 */
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test
} from 'bun:test';

import { environmentCopy, forgeProgramToRecordFrom } from '../../services/Environment.ts';
import { recordAnswer, recordSystemVersion }         from '../../testing/BoundaryRecordings.ts';
import {
  requestCallShapeOf,
  situationCallShapeOf,
  streamCallShapeOf,
  type OverseerSituation,
} from '../../testing/RecordedAnswers.ts';
import { createScratchDirectory, removeScratchPath } from '../../testing/ScratchRoot.ts';
import { realProcessRun }                            from '../process-run/ProcessRun.ts';

import {
  realOverseerFetch,
  type OverseerAnswer,
  type OverseerRequest,
  type OverseerStream,
  type OverseerStreamAnswer,
  type OverseerStreamRequest,
} from './OverseerFetch.ts';

const RECORDING_NAME = 'overseer-fetch';
/** Makes the scratch board's Overseer launch the forge's scripted fake agent in place of a vendor's CLI, so it spends no subscription. */
const FORGE_FAKE_AGENT_VARIABLE = 'FORGE_FAKE_AGENT';
const FORGE_RUN_TIMEOUT_MILLISECONDS = 60_000;
const FORGE_SETUP_TIMEOUT_MILLISECONDS = 120_000;
const GENEROUS_BOUND_MILLISECONDS = 10_000;
const SHORT_BOUND_MILLISECONDS = 200;
const WRONG_TOKEN = 'example-token-of-another-overseer';
const EXAMPLE_TOKEN = 'example-token';
const UNAUTHORIZED_STATUS = 401;
const SUCCESS_STATUS = 200;

const scratchDirectories: string[] = [];

function scratchDirectory(prefix: string): string {
  const directory = createScratchDirectory(prefix);
  scratchDirectories.push(directory);
  return directory;
}

function forgeProgramToRun(): string {
  const forgeProgram = forgeProgramToRecordFrom();
  if (forgeProgram === null) throw new Error(`Name the forge program to record from: GAIA_RECORDING_FORGE_PROGRAM=<path> bun run record ${RECORDING_NAME}.`);
  return forgeProgram;
}

function requestOf(overseerUrl: string, method: OverseerRequest['method'], path: string, bearerToken: string | null, jsonBody: string | null = null): OverseerRequest {
  return {
    overseerUrl, method, path, bearerToken, jsonBody, timeoutMilliseconds: GENEROUS_BOUND_MILLISECONDS,
  };
}

function streamRequestOf(overseerUrl: string, path: string, bearerToken: string | null, timeoutMilliseconds = GENEROUS_BOUND_MILLISECONDS): OverseerStreamRequest {
  return {
    overseerUrl, path, bearerToken, timeoutMilliseconds,
  };
}

function recordRequestAnswer(situation: OverseerSituation, overseerRequest: OverseerRequest, answer: OverseerAnswer): void {
  recordAnswer(RECORDING_NAME, situationCallShapeOf(situation, requestCallShapeOf(overseerRequest)), answer);
}

function parsedBodyOf(answer: OverseerAnswer): unknown {
  if (answer.verdict !== 'answered') throw new Error(`The forge answered ${JSON.stringify(answer)}`);
  return JSON.parse(answer.bodyText) as unknown;
}

function streamOf(answer: OverseerStreamAnswer): OverseerStream {
  if (answer.verdict !== 'streaming') throw new Error(`The stream answered ${JSON.stringify(answer)}`);
  return answer.stream;
}

async function textUntilTheEndOf(stream: OverseerStream): Promise<{ readonly text: string; readonly ending: string }> {
  let text  = '';
  let chunk = await stream.nextChunk();
  while (chunk.kind === 'text') {
    text += chunk.text;
    chunk = await stream.nextChunk();
  }
  return { text, ending: chunk.ending };
}

describe('a real forge', () => {
  let forgeHome  = '';
  let repository = '';
  let overseerUrl = '';
  let forgeIsRunning = false;

  async function runForge(programArguments: readonly string[]) {
    const forgeEnvironment = () => ({ ...environmentCopy(), HOME: forgeHome, [FORGE_FAKE_AGENT_VARIABLE]: '1' });
    const answer = await realProcessRun(forgeEnvironment).run({
      program: forgeProgramToRun(), programArguments, workingDirectory: repository, timeoutMilliseconds: FORGE_RUN_TIMEOUT_MILLISECONDS
    });
    if (answer.verdict !== 'finished' || answer.exitCode !== 0) throw new Error(`forge ${programArguments.join(' ')} answered ${JSON.stringify(answer)}`);
    return answer.standardOutput;
  }

  beforeAll(async () => {
    forgeHome  = scratchDirectory('forge-home');
    repository = scratchDirectory('forge-repository');
    await runForge(['init', '--project', 'Example Project', '--no-hooks']);
    // `forge start` (F8) does not exist yet. Port 0 keeps the scratch Overseer off every port a real board derives from its tracker id.
    const started = JSON.parse(await runForge(['oversee', '--detach', '--port', '0', '--json'])) as { url: string };
    overseerUrl    = started.url;
    forgeIsRunning = true;
  }, FORGE_SETUP_TIMEOUT_MILLISECONDS);

  afterAll(async () => {
    if (forgeIsRunning) await runForge(['oversee', 'stop', '--now', '--json']);
    for (const directory of scratchDirectories.splice(0)) removeScratchPath(directory);
  }, FORGE_SETUP_TIMEOUT_MILLISECONDS);

  describe('while it serves', () => {
    test('answers its identity, without a contracts key', async () => {
      const identityRequest = requestOf(overseerUrl, 'GET', '/api/identity', null);
      const answer = await realOverseerFetch().request(identityRequest);
      expect(answer).toMatchObject({ verdict: 'answered', status: SUCCESS_STATUS });
      expect(parsedBodyOf(answer)).toMatchObject({ application: 'forge', project: 'Example Project' });
      expect(parsedBodyOf(answer)).not.toHaveProperty('contracts');
      recordRequestAnswer('serving', identityRequest, answer);
      const { installVersion } = parsedBodyOf(answer) as { installVersion: unknown };
      recordSystemVersion(RECORDING_NAME, `install version ${String(installVersion)}`);
    });

    test('answers its board summary at summary version 1', async () => {
      const summaryRequest = requestOf(overseerUrl, 'GET', '/api/summary', null);
      const answer = await realOverseerFetch().request(summaryRequest);
      expect(answer).toMatchObject({ verdict: 'answered', status: SUCCESS_STATUS });
      expect(parsedBodyOf(answer)).toMatchObject({ summaryVersion: 1, project: 'Example Project' });
      recordRequestAnswer('serving', summaryRequest, answer);
    });

    test('answers 401 to a session code asked with another Overseer\'s token', async () => {
      const sessionCodeRequest = requestOf(overseerUrl, 'POST', '/api/session-codes', WRONG_TOKEN);
      const answer = await realOverseerFetch().request(sessionCodeRequest);
      expect(answer).toEqual({ verdict: 'answered', status: UNAUTHORIZED_STATUS, bodyText: '{"refusal":"unauthorized"}' });
      recordRequestAnswer('token-rejected', sessionCodeRequest, answer);
    });

    test('answers 401 to a command sent with another Overseer\'s token', async () => {
      const commandRequest = requestOf(overseerUrl, 'POST', '/api/commands', WRONG_TOKEN, JSON.stringify({ kind: 'overseer-pause' }));
      const answer = await realOverseerFetch().request(commandRequest);
      expect(answer).toEqual({ verdict: 'answered', status: UNAUTHORIZED_STATUS, bodyText: '{"refusal":"unauthorized"}' });
      recordRequestAnswer('token-rejected', commandRequest, answer);
    });
  });

  describe('once it has stopped', () => {
    beforeAll(async () => {
      await runForge(['oversee', 'stop', '--now', '--json']);
      forgeIsRunning = false;
    }, FORGE_SETUP_TIMEOUT_MILLISECONDS);

    test('answers unreachable for every request a forge serves', async () => {
      const requests = [
        requestOf(overseerUrl, 'GET', '/api/identity', null),
        requestOf(overseerUrl, 'GET', '/api/summary', null),
        requestOf(overseerUrl, 'GET', '/api/monitor', EXAMPLE_TOKEN),
        requestOf(overseerUrl, 'POST', '/api/session-codes', EXAMPLE_TOKEN),
        requestOf(overseerUrl, 'POST', '/api/commands', EXAMPLE_TOKEN, JSON.stringify({ kind: 'overseer-pause' })),
      ];
      for (const stoppedRequest of requests) {
        const answer = await realOverseerFetch().request(stoppedRequest);
        expect(answer).toEqual({ verdict: 'unreachable' });
        recordRequestAnswer('stopped', stoppedRequest, answer);
      }
    });

    test('answers unreachable for the monitor stream', async () => {
      const monitorStreamRequest = streamRequestOf(overseerUrl, '/api/monitor/events', EXAMPLE_TOKEN);
      const answer = await realOverseerFetch().openStream(monitorStreamRequest);
      expect(answer).toEqual({ verdict: 'unreachable' });
      recordAnswer(RECORDING_NAME, situationCallShapeOf('stopped', streamCallShapeOf(monitorStreamRequest)), answer);
    });
  });
});

describe('a request', () => {
  test('sends the token as a bearer, and a JSON body with its content type', async () => {
    const seen: { authorization: string | null; contentType: string | null; body: string }[] = [];
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port:     0,
      fetch:    async (request) => {
        seen.push({ authorization: request.headers.get('Authorization'), contentType: request.headers.get('Content-Type'), body: await request.text() });
        return Response.json({ outcome: 'done' });
      },
    });
    try {
      const answer = await realOverseerFetch().request(requestOf(server.url.href, 'POST', '/api/commands', EXAMPLE_TOKEN, '{"kind":"overseer-pause"}'));
      expect(answer).toEqual({ verdict: 'answered', status: SUCCESS_STATUS, bodyText: '{"outcome":"done"}' });
      expect(seen).toEqual([{ authorization: `Bearer ${EXAMPLE_TOKEN}`, contentType: 'application/json', body: '{"kind":"overseer-pause"}' }]);
    } finally {
      await server.stop(true);
    }
  });

  test('sends no authorization without a token', async () => {
    const authorizations: (string | null)[] = [];
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port:     0,
      fetch:    (request) => {
        authorizations.push(request.headers.get('Authorization'));
        return Response.json({ application: 'forge' });
      },
    });
    try {
      await realOverseerFetch().request(requestOf(server.url.href, 'GET', '/api/identity', null));
      expect(authorizations).toEqual([null]);
    } finally {
      await server.stop(true);
    }
  });

  test('answers timed-out for an Overseer that accepts the connection and never answers', async () => {
    const silentListener = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data: () => undefined } });
    try {
      const identityRequest = requestOf(`http://127.0.0.1:${silentListener.port}/`, 'GET', '/api/identity', null);
      const answer = await realOverseerFetch().request({ ...identityRequest, timeoutMilliseconds: SHORT_BOUND_MILLISECONDS });
      expect(answer).toEqual({ verdict: 'timed-out' });
    } finally {
      silentListener.stop(true);
    }
  });
});

describe('a stream', () => {
  const encoder = new TextEncoder();

  test('hands on the text as it arrives, a character cut between two chunks included, and ends closed when the Overseer ends it', async () => {
    const wholeText = 'event: monitor\ndata: {"project":"Café"}\n\n';
    const bytes     = encoder.encode(wholeText);
    const cutInsideTheCharacter = bytes.indexOf(0xC3) + 1;
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port:     0,
      fetch:    () => new Response(new ReadableStream({
        start: (controller) => {
          controller.enqueue(bytes.slice(0, cutInsideTheCharacter));
          controller.enqueue(bytes.slice(cutInsideTheCharacter));
          controller.close();
        },
      }), { headers: { 'Content-Type': 'text/event-stream' } }),
    });
    try {
      const stream = streamOf(await realOverseerFetch().openStream(streamRequestOf(server.url.href, '/api/monitor/events', EXAMPLE_TOKEN)));
      expect(await textUntilTheEndOf(stream)).toEqual({ text: wholeText, ending: 'closed' });
      expect(await stream.nextChunk()).toEqual({ kind: 'ended', ending: 'closed' });
    } finally {
      await server.stop(true);
    }
  });

  test('answers a head other than an event stream with its status and body', async () => {
    const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => Response.json({ refusal: 'unauthorized' }, { status: UNAUTHORIZED_STATUS }) });
    try {
      expect(await realOverseerFetch().openStream(streamRequestOf(server.url.href, '/api/monitor/events', WRONG_TOKEN)))
        .toEqual({ verdict: 'answered', status: UNAUTHORIZED_STATUS, bodyText: '{"refusal":"unauthorized"}' });
    } finally {
      await server.stop(true);
    }
  });

  test('ends closed when it is closed while the Overseer holds it open', async () => {
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port:     0,
      fetch:    () => new Response(
        new ReadableStream({ start: (controller) => controller.enqueue(encoder.encode(': ping\n\n')) }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
    });
    try {
      const stream = streamOf(await realOverseerFetch().openStream(streamRequestOf(server.url.href, '/api/monitor/events', EXAMPLE_TOKEN)));
      expect(await stream.nextChunk()).toEqual({ kind: 'text', text: ': ping\n\n' });
      const pendingChunk = stream.nextChunk();
      stream.close();
      expect(await pendingChunk).toEqual({ kind: 'ended', ending: 'closed' });
    } finally {
      await server.stop(true);
    }
  });

  test('ends broken when the connection breaks inside the stream', async () => {
    const head = 'HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nTransfer-Encoding: chunked\r\n\r\n';
    const breakingListener = Bun.listen({
      hostname: '127.0.0.1',
      port:     0,
      socket:   {
        data: (socket) => {
          socket.write(`${head}7\r\nevent: \r\n`);
          socket.end();
        },
      },
    });
    try {
      const stream = streamOf(await realOverseerFetch().openStream(streamRequestOf(`http://127.0.0.1:${breakingListener.port}/`, '/api/monitor/events', EXAMPLE_TOKEN)));
      expect(await textUntilTheEndOf(stream)).toEqual({ text: 'event: ', ending: 'broken' });
    } finally {
      breakingListener.stop(true);
    }
  });

  test('answers timed-out when no head arrives within the bound', async () => {
    const silentListener = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data: () => undefined } });
    try {
      const silentAddress = `http://127.0.0.1:${silentListener.port}/`;
      const answer = await realOverseerFetch().openStream(streamRequestOf(silentAddress, '/api/monitor/events', EXAMPLE_TOKEN, SHORT_BOUND_MILLISECONDS));
      expect(answer).toEqual({ verdict: 'timed-out' });
    } finally {
      silentListener.stop(true);
    }
  });
});
