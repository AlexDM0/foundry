/**
 * Hephaestus's connection to Talos against Talos's own socket server: a `done` settles only the frame of its own id, since another
 * frame's `done` would report the wrong verdict; a silent Talos answers `no-answer` after the bound rather than hang a pass; and a close
 * settles each waiting frame and listener once.
 */
import { afterEach, beforeEach, expect } from 'bun:test';

import type { DoneFrame, ReceivedClientFrame, StateFrame } from '../../lib/talos/@types/TalosFrame.ts';
import { type TalosSocketOptions, listenOnTalosSocket }    from '../../lib/talos/TalosSocketServer.ts';
import { TALOS_PROTOCOL_VERSION }                          from '../../lib/talos/constants/TalosProtocol.ts';
import { useRecordedLocalEndpoint }                        from '../../testing/RecordedLocalEndpoint.ts';
import { createScratchDirectory, removeScratchDirectory }  from '../../testing/ScratchWorkspace.ts';
import { testWhenRecorded }                                from '../../testing/ToolGuard.ts';
import { waitUntil }                                       from '../../testing/WaitUntil.ts';
import { type TalosConnection, connectToTalos }            from './TalosConnection.ts';

const EXAMPLE_SECRET = 'example-secret';
const FRAME_TIMEOUT_MILLISECONDS = 20;
/** Long enough that no case waits it out: a case that needs an answer gets one at once. */
const ANSWERING_FRAME_TIMEOUT_MILLISECONDS = 60_000;
const RENEWER = {
  processId: 4242, startStamp: '1', bootIdentity: 'example-boot', generation: 1
};
const WELCOME = {
  kind: 'welcome', protocolVersion: TALOS_PROTOCOL_VERSION, codeVersion: 'code-example', startNumber: 1, talos: null, leaseStanding: 'unheld',
} as const;
const STATE: StateFrame = {
  kind: 'state', childId: 'jobs/J-1#1', state: 'running', end: null, recognisedEnding: null
};

let monitorFolder = '';
let lastInstance = 0;
const recordedEndpoint = useRecordedLocalEndpoint();

beforeEach(() => {
  monitorFolder = createScratchDirectory('talos-connection');
});

afterEach(() => {
  removeScratchDirectory(monitorFolder);
});

function nextEndpoint(): string {
  lastInstance += 1;
  return recordedEndpoint.endpoint.endpointOf({
    monitorFolder, trackerId: 'tracker-example', name: 'talos', instance: lastInstance
  });
}

interface ServedTalos {
  readonly endpoint:   string;
  readonly framesSeen: ReceivedClientFrame[];
  readonly broadcast:  (frame: StateFrame) => void;
  readonly close:      () => void;
}

async function servedTalos(onClientFrame: TalosSocketOptions['onClientFrame']): Promise<ServedTalos> {
  const endpoint = nextEndpoint();
  const framesSeen: ReceivedClientFrame[] = [];
  const listening = await listenOnTalosSocket({
    serverOf:          recordedEndpoint.endpoint.serverOf,
    endpoint,
    secret:            EXAMPLE_SECRET,
    isQuitting:        () => false,
    welcomeOf:         () => WELCOME,
    onVersionMismatch: () => undefined,
    onClientFrame:     (frame) => {
      framesSeen.push(frame);
      return onClientFrame(frame);
    },
  });
  if (listening.verdict !== 'listening') throw new Error(`the Talos endpoint cannot listen: ${listening.reason}`);
  return {
    endpoint, framesSeen, broadcast: listening.server.broadcast, close: listening.server.close
  };
}

async function welcomedConnectionTo(endpoint: string, frameTimeoutMilliseconds: number): Promise<TalosConnection> {
  const outcome = await connectToTalos({
    endpoint, secret: EXAMPLE_SECRET, localEndpoint: recordedEndpoint.endpoint, frameTimeoutMilliseconds
  });
  if (outcome.verdict !== 'welcomed') throw new Error(`Talos did not welcome the connection: ${outcome.verdict}`);
  return outcome.connection;
}

function doneOf(frame: ReceivedClientFrame): DoneFrame {
  return { kind: 'done', frameId: frame.frameId, verdict: 'done' };
}

testWhenRecorded(['local-endpoint-recording'], 'a done settles only the frame of its own id, also when it comes before an earlier frame\'s', async () => {
  const heldAnswers: { frame: ReceivedClientFrame; answer: (done: DoneFrame) => void }[] = [];
  const served = await servedTalos((frame) => new Promise<DoneFrame>((answer) => heldAnswers.push({ frame, answer })));
  const connection = await welcomedConnectionTo(served.endpoint, ANSWERING_FRAME_TIMEOUT_MILLISECONDS);

  const firstAnswers: (DoneFrame | 'no-answer')[] = [];
  const firstSent = connection.send({ kind: 'lease-renewal', renewer: RENEWER }).then((answer) => firstAnswers.push(answer));
  const secondSent = connection.send({ kind: 'stop-lines' });
  await waitUntil(() => heldAnswers.length === 2, 'Talos holding both frames');
  const [first, second] = heldAnswers;
  if (first === undefined || second === undefined) throw new Error('Talos holds fewer than two frames');
  second.answer({
    kind: 'done', frameId: second.frame.frameId, verdict: 'refused', reason: 'quitting'
  });

  expect(await secondSent).toEqual({
    kind: 'done', frameId: 2, verdict: 'refused', reason: 'quitting'
  });
  expect(firstAnswers).toEqual([]);
  first.answer(doneOf(first.frame));
  await firstSent;
  expect(firstAnswers).toEqual([{ kind: 'done', frameId: 1, verdict: 'done' }]);
  expect(served.framesSeen.map((frame) => frame.kind)).toEqual(['lease-renewal', 'stop-lines']);
  connection.close();
  served.close();
});

testWhenRecorded(['local-endpoint-recording'], 'a frame Talos holds past the bound answers no-answer', async () => {
  const served = await servedTalos(() => new Promise<DoneFrame>(() => undefined));
  const connection = await welcomedConnectionTo(served.endpoint, FRAME_TIMEOUT_MILLISECONDS);

  expect(await connection.send({ kind: 'stop-lines' })).toBe('no-answer');
  connection.close();
  served.close();
});

testWhenRecorded(['local-endpoint-recording'], 'a state frame reaches every state listener', async () => {
  const served = await servedTalos((frame) => Promise.resolve(doneOf(frame)));
  const connection = await welcomedConnectionTo(served.endpoint, ANSWERING_FRAME_TIMEOUT_MILLISECONDS);
  const firstListenerFrames: StateFrame[] = [];
  const secondListenerFrames: StateFrame[] = [];
  connection.onState((frame) => firstListenerFrames.push(frame));
  connection.onState((frame) => secondListenerFrames.push(frame));

  served.broadcast(STATE);
  await waitUntil(() => secondListenerFrames.length === 1, 'the state frame reaching the listeners');

  expect(firstListenerFrames).toEqual([STATE]);
  expect(secondListenerFrames).toEqual([STATE]);
  connection.close();
  served.close();
});

testWhenRecorded(['local-endpoint-recording'], 'a close settles a waiting frame once with no-answer and calls its listeners once, however often it closes', async () => {
  const served = await servedTalos(() => new Promise<DoneFrame>(() => undefined));
  const connection = await welcomedConnectionTo(served.endpoint, ANSWERING_FRAME_TIMEOUT_MILLISECONDS);
  let closeCalls = 0;
  connection.onClose(() => {
    closeCalls += 1;
  });
  const waiting = connection.send({ kind: 'stop-lines' });
  await waitUntil(() => served.framesSeen.length === 1, 'Talos holding the frame');

  connection.close();
  connection.close();

  expect(await waiting).toBe('no-answer');
  expect(await connection.send({ kind: 'stop-lines' })).toBe('no-answer');
  expect(closeCalls).toBe(1);
  served.close();
});

testWhenRecorded(['local-endpoint-recording'], 'Talos closing the connection settles a waiting frame with no-answer and calls the close listeners', async () => {
  const served = await servedTalos(() => new Promise<DoneFrame>(() => undefined));
  const connection = await welcomedConnectionTo(served.endpoint, ANSWERING_FRAME_TIMEOUT_MILLISECONDS);
  let closed = false;
  connection.onClose(() => {
    closed = true;
  });
  const waiting = connection.send({ kind: 'stop-lines' });
  await waitUntil(() => served.framesSeen.length === 1, 'Talos holding the frame');

  served.close();

  expect(await waiting).toBe('no-answer');
  await waitUntil(() => closed, 'the close listener called');
});

testWhenRecorded(['local-endpoint-recording'], 'a wrong secret is refused, a Talos of another version answers its version, and an absent one is silent', async () => {
  const served = await servedTalos((frame) => Promise.resolve(doneOf(frame)));
  expect(await connectToTalos({
    endpoint: served.endpoint, secret: 'another-secret', localEndpoint: recordedEndpoint.endpoint, frameTimeoutMilliseconds: ANSWERING_FRAME_TIMEOUT_MILLISECONDS,
  })).toEqual({ verdict: 'refused', reason: 'secret' });
  served.close();

  const otherVersionEndpoint = nextEndpoint();
  const otherVersion = recordedEndpoint.endpoint.serverOf((socket) => {
    socket.setEncoding('utf8');
    socket.on('data', () => socket.end(`${JSON.stringify({ kind: 'version-mismatch', protocolVersion: TALOS_PROTOCOL_VERSION + 1 })}\n`));
  });
  await new Promise<void>((resolve) => otherVersion.listen(otherVersionEndpoint, resolve));
  expect(await connectToTalos({
    endpoint: otherVersionEndpoint, secret: EXAMPLE_SECRET, localEndpoint: recordedEndpoint.endpoint, frameTimeoutMilliseconds: ANSWERING_FRAME_TIMEOUT_MILLISECONDS,
  })).toEqual({ verdict: 'version-mismatch', protocolVersion: TALOS_PROTOCOL_VERSION + 1 });
  otherVersion.close();

  expect(await connectToTalos({
    endpoint: nextEndpoint(), secret: EXAMPLE_SECRET, localEndpoint: recordedEndpoint.endpoint, frameTimeoutMilliseconds: ANSWERING_FRAME_TIMEOUT_MILLISECONDS,
  })).toEqual({ verdict: 'silent' });
});
