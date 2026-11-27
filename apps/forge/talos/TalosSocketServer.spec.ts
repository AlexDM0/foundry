/**
 * Talos's endpoint over the recorded endpoint, so no socket is made. What matters: an unterminated first line past
 * `TALOS_CLIENT_LINE_LIMIT_CHARACTERS` is refused `malformed` before any secret is checked, since an unbounded buffer lets anyone who can open
 * the endpoint grow Talos's memory; each frozen answer to a first line, the secret checked before the version so nobody without it can make
 * Talos quit; one `done` per client frame; and a frame sent as the first line is no `hello`.
 */
import { afterEach, beforeEach, expect } from 'bun:test';

import type { ReceivedClientFrame }                                   from '../src/domain/talos/@types/TalosFrame.ts';
import { endpointFolderOf }                                           from '../src/domain/talos/TalosFiles.ts';
import { TALOS_CLIENT_LINE_LIMIT_CHARACTERS, TALOS_PROTOCOL_VERSION } from '../src/domain/talos/constants/TalosProtocol.ts';
import { useRecordedLocalEndpoint }                                   from '../src/testing/RecordedLocalEndpoint.ts';
import { createScratchDirectory, removeScratchDirectory }             from '../src/testing/ScratchWorkspace.ts';
import { testWhenRecorded }                                           from '../src/testing/ToolGuard.ts';
import { waitUntil }                                                  from '../src/testing/WaitUntil.ts';
import { type TalosSocketOptions, listenOnTalosSocket }               from './TalosSocketServer.ts';

const EXAMPLE_SECRET = 'example-secret';
const CHUNK_CHARACTERS = 1_048_576;
const WELCOME = {
  kind: 'welcome', protocolVersion: TALOS_PROTOCOL_VERSION, codeVersion: 'code-example', startNumber: 1, talos: null, leaseStanding: 'unheld',
} as const;

let monitorFolder = '';
const recordedEndpoint = useRecordedLocalEndpoint();

beforeEach(() => {
  monitorFolder = createScratchDirectory('talos-socket-server');
});

afterEach(() => {
  removeScratchDirectory(monitorFolder);
});

interface ServedEndpoint {
  readonly endpoint:          string;
  readonly framesTaken:       ReceivedClientFrame[];
  readonly versionMismatches: () => number;
  readonly close:             () => void;
}

async function servedEndpoint(optionChanges: Partial<TalosSocketOptions> = {}): Promise<ServedEndpoint> {
  const endpoint = recordedEndpoint.endpoint.endpointOf({
    socketFolder: endpointFolderOf(monitorFolder), scope: 'tracker-example', name: 'talos', instance: 1
  });
  const framesTaken: ReceivedClientFrame[] = [];
  let versionMismatches = 0;
  const listening = await listenOnTalosSocket({
    serverOf:          recordedEndpoint.endpoint.serverOf,
    endpoint,
    secret:            EXAMPLE_SECRET,
    isQuitting:        () => false,
    welcomeOf:         () => WELCOME,
    onVersionMismatch: () => {
      versionMismatches += 1;
    },
    onClientFrame: (frame) => {
      framesTaken.push(frame);
      return Promise.resolve({ kind: 'done', frameId: frame.frameId, verdict: 'done' });
    },
    ...optionChanges,
  });
  if (listening.verdict !== 'listening') throw new Error(`the Talos endpoint cannot listen: ${listening.systemError}`);
  return {
    endpoint, framesTaken, versionMismatches: () => versionMismatches, close: listening.server.close,
  };
}

interface Exchange {
  readonly write:    (text: string) => void;
  readonly frames:   () => readonly unknown[];
  readonly isClosed: () => boolean;
}

function exchangeWith(endpoint: string): Exchange {
  const client = recordedEndpoint.endpoint.connectionTo(endpoint);
  let received = '';
  let closed = false;
  const writes: string[] = [];
  let connected = false;
  client.setEncoding('utf8');
  client.on('data', (chunk: string) => {
    received += chunk;
  });
  client.on('close', () => {
    closed = true;
  });
  client.once('connect', () => {
    connected = true;
    for (const text of writes) client.write(text);
  });
  return {
    write: (text) => {
      if (connected) client.write(text);
      else writes.push(text);
    },
    frames:   () => received.split('\n').filter((line) => line !== '').map((line): unknown => JSON.parse(line)),
    isClosed: () => closed,
  };
}

function helloLineOf(requiredProtocolVersion: number, secret: string): string {
  return `${JSON.stringify({ kind: 'hello', requiredProtocolVersion, secret })}\n`;
}

testWhenRecorded(['local-endpoint-recording'], 'an unterminated first line past the limit is refused malformed before any secret is checked', async () => {
  const served = await servedEndpoint();
  const exchange = exchangeWith(served.endpoint);
  const chunk = 'x'.repeat(CHUNK_CHARACTERS);
  for (let written = 0; written <= TALOS_CLIENT_LINE_LIMIT_CHARACTERS; written += CHUNK_CHARACTERS) exchange.write(chunk);

  await waitUntil(exchange.isClosed, 'Talos closing the client');

  expect(exchange.frames()).toEqual([{ kind: 'refused', reason: 'malformed' }]);
  expect(served.framesTaken).toEqual([]);
  served.close();
});

testWhenRecorded(['local-endpoint-recording'], 'each first line gets its frozen answer, the secret checked before the version', async () => {
  const served = await servedEndpoint();
  const cases = [
    { line: 'not a frame\n', answer: { kind: 'refused', reason: 'malformed' } },
    { line: helloLineOf(TALOS_PROTOCOL_VERSION + 1, 'another-secret'), answer: { kind: 'refused', reason: 'secret' } },
    { line: helloLineOf(TALOS_PROTOCOL_VERSION + 1, EXAMPLE_SECRET), answer: { kind: 'version-mismatch', protocolVersion: TALOS_PROTOCOL_VERSION } },
  ];
  for (const { line, answer } of cases) {
    const exchange = exchangeWith(served.endpoint);
    exchange.write(line);
    await waitUntil(exchange.isClosed, `Talos closing the client after ${line.trim()}`);
    expect(exchange.frames()).toEqual([answer]);
  }
  expect(served.versionMismatches()).toBe(1);
  served.close();
});

testWhenRecorded(['local-endpoint-recording'], 'a hello while Talos quits is refused quitting, and a hello of its version is welcomed', async () => {
  let quitting = true;
  const served = await servedEndpoint({ isQuitting: () => quitting });
  const refused = exchangeWith(served.endpoint);
  refused.write(helloLineOf(TALOS_PROTOCOL_VERSION + 1, EXAMPLE_SECRET));
  await waitUntil(refused.isClosed, 'Talos closing the client while it quits');
  expect(refused.frames()).toEqual([{ kind: 'refused', reason: 'quitting' }]);
  expect(served.versionMismatches()).toBe(0);

  quitting = false;
  const welcomed = exchangeWith(served.endpoint);
  welcomed.write(helloLineOf(TALOS_PROTOCOL_VERSION, EXAMPLE_SECRET));
  await waitUntil(() => welcomed.frames().length === 1, 'the welcome');
  expect(welcomed.frames()).toEqual([WELCOME]);
  expect(welcomed.isClosed()).toBe(false);
  served.close();
});

testWhenRecorded(['local-endpoint-recording'], 'every client frame is answered by exactly one done of its frameId, and a line that is no frame by nothing', async () => {
  const served = await servedEndpoint();
  const exchange = exchangeWith(served.endpoint);
  exchange.write(helloLineOf(TALOS_PROTOCOL_VERSION, EXAMPLE_SECRET));
  exchange.write(`${JSON.stringify({ kind: 'stop-lines', frameId: 1 })}\n`);
  exchange.write('not a frame\n');
  exchange.write(`${JSON.stringify({
    kind: 'stop', frameId: 2, childId: 'jobs/J-1/gate-1#1', graceMilliseconds: 0
  })}\n`);
  exchange.write(`${JSON.stringify({ kind: 'quit', frameId: 3, reason: 'restart' })}\n`);

  await waitUntil(() => exchange.frames().length === 4, 'the welcome and three answers');

  expect(exchange.frames()).toEqual([
    WELCOME,
    { kind: 'done', frameId: 1, verdict: 'done' },
    { kind: 'done', frameId: 2, verdict: 'done' },
    { kind: 'done', frameId: 3, verdict: 'done' },
  ]);
  expect(served.framesTaken.map((frame) => frame.kind)).toEqual(['stop-lines', 'stop', 'quit']);
  served.close();
});

testWhenRecorded(['local-endpoint-recording'], 'a client frame sent as the first line is no hello', async () => {
  const served = await servedEndpoint();
  const exchange = exchangeWith(served.endpoint);
  exchange.write(`${JSON.stringify({ kind: 'stop-lines', frameId: 1 })}\n`);

  await waitUntil(exchange.isClosed, 'Talos closing the client');

  expect(exchange.frames()).toEqual([{ kind: 'refused', reason: 'malformed' }]);
  expect(served.framesTaken).toEqual([]);
  served.close();
});
