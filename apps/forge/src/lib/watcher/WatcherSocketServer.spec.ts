/**
 * The Watcher socket's line buffer and a line whose handling throws, over the recorded endpoint, so no socket is made. What matters: a
 * client that never ends its line is refused `protocol` once the line passes `WATCHER_CLIENT_LINE_LIMIT_CHARACTERS`, before any secret is
 * checked, since an unbounded buffer lets anyone who can open the endpoint grow the Watcher's memory until it fails; and a line whose
 * handling throws, such as an event log the disk refused, drops its connection unanswered and hands the cause to the Watcher, which fails
 * with it, since a throw out of the socket's listener would end the Watcher with no word of why.
 */
import { afterEach, beforeEach, expect } from 'bun:test';

import { useRecordedLocalEndpoint }                                       from '../../testing/RecordedLocalEndpoint.ts';
import { createScratchDirectory, removeScratchDirectory }                 from '../../testing/ScratchWorkspace.ts';
import { testWhenRecorded }                                               from '../../testing/ToolGuard.ts';
import { waitUntil }                                                      from '../../testing/WaitUntil.ts';
import { type WatcherSocketOptions, listenOnWatcherSocket }               from './WatcherSocketServer.ts';
import { WATCHER_CLIENT_LINE_LIMIT_CHARACTERS, WATCHER_PROTOCOL_VERSION } from './constants/WatcherProtocol.ts';

const EXAMPLE_WATCHER_SECRET = 'example-secret';
const CHUNK_CHARACTERS = 1_048_576;

let monitorFolder = '';
const recordedEndpoint = useRecordedLocalEndpoint();

beforeEach(() => {
  monitorFolder = createScratchDirectory('watcher-socket-server');
});

afterEach(() => {
  removeScratchDirectory(monitorFolder);
});

interface ServedSocket {
  readonly socketPath:    string;
  readonly clientLines:   () => number;
  readonly failureCauses: unknown[];
  readonly close:         () => void;
}

async function servedSocket(optionChanges: Partial<WatcherSocketOptions>): Promise<ServedSocket> {
  const { endpoint } = recordedEndpoint;
  const socketPath = endpoint.endpointOf({
    monitorFolder, trackerId: 'tracker-example', name: 'J-1', instance: 1
  });
  let clientLines = 0;
  const failureCauses: unknown[] = [];
  const listening = await listenOnWatcherSocket({
    endpoint,
    socketPath,
    watcherSecret:  EXAMPLE_WATCHER_SECRET,
    acceptedKinds:  ['write'],
    welcomeOf:      () => ({ watcherCodeVersion: 'code-example', jobId: 'J-1', state: 'idle' }),
    durableEntries: () => [],
    onClientLine:   () => {
      clientLines += 1;
    },
    onActingFrame:     () => undefined,
    onHandlingFailure: (cause) => failureCauses.push(cause),
    ...optionChanges,
  });
  if (listening.verdict !== 'listening') throw new Error(`the Watcher socket cannot listen: ${listening.reason}`);
  return {
    socketPath, clientLines: () => clientLines, failureCauses, close: listening.server.close,
  };
}

testWhenRecorded(['local-endpoint-recording'], 'a client whose unterminated line passes the limit is refused protocol before any secret is checked', async () => {
  const served = await servedSocket({});
  const client = recordedEndpoint.endpoint.connectionTo(served.socketPath);
  let received = '';
  let closed = false;
  client.setEncoding('utf8');
  client.on('data', (chunk: string) => {
    received += chunk;
  });
  client.on('close', () => {
    closed = true;
  });
  const chunk = 'x'.repeat(CHUNK_CHARACTERS);
  client.once('connect', () => {
    for (let written = 0; written <= WATCHER_CLIENT_LINE_LIMIT_CHARACTERS; written += CHUNK_CHARACTERS) client.write(chunk);
  });

  await waitUntil(() => closed, 'the Watcher closing the client');

  expect(received).toBe(`${JSON.stringify({ kind: 'refused', reason: 'protocol' })}\n`);
  expect(served.clientLines()).toBe(0);
  served.close();
});

testWhenRecorded(['local-endpoint-recording'], 'a line whose handling throws drops its connection unanswered and hands the cause to the Watcher', async () => {
  const diskFailure = new Error('ENOSPC: example disk failure');
  const served = await servedSocket({
    durableEntries: () => {
      throw diskFailure;
    },
  });
  const client = recordedEndpoint.endpoint.connectionTo(served.socketPath);
  let received = '';
  let closed = false;
  client.setEncoding('utf8');
  client.on('data', (chunk: string) => {
    received += chunk;
  });
  client.on('close', () => {
    closed = true;
  });
  const hello = {
    kind: 'hello', protocolVersion: WATCHER_PROTOCOL_VERSION, sinceSequence: 0, watcherSecret: EXAMPLE_WATCHER_SECRET
  };
  client.once('connect', () => client.write(`${JSON.stringify(hello)}\n`));

  await waitUntil(() => closed, 'the Watcher dropping the client');

  expect(received).toBe('');
  expect(served.failureCauses).toEqual([diskFailure]);
  served.close();
});
