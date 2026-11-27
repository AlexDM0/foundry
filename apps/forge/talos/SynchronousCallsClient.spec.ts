/**
 * The main thread's proxy over a fake transport. What matters: each answer settles the promise of its own `callId`, whatever order answers
 * come in; a `failed` answer rejects only its own call; calls are posted in the order they are made, each with a new `callId`; and a thread
 * that died rejects every pending call and every later one, since Talos ends on a failed call and would otherwise wait for ever.
 */
import { expect, test } from 'bun:test';

import type { SynchronousCallAnswer, SynchronousCallRequest }                                 from './@types/SynchronousCall.ts';
import { createSynchronousCalls, SynchronousCallFailedError, type SynchronousCallsTransport } from './SynchronousCallsClient.ts';

const EXAMPLE_IDENTITY = { processId: 4242, startStamp: '1800000000', bootIdentity: 'example-boot' };

interface FakeTransport {
  readonly transport: SynchronousCallsTransport;
  readonly posted:    SynchronousCallRequest[];
  readonly answer:    (answer: SynchronousCallAnswer) => void;
  readonly die:       (reason: string) => void;
}

function fakeTransport(): FakeTransport {
  const posted: SynchronousCallRequest[] = [];
  const listeners: Array<(answer: SynchronousCallAnswer) => void> = [];
  const failureListeners: Array<(reason: string) => void> = [];
  return {
    transport: {
      post: (request) => {
        posted.push(request);
      },
      onAnswer: (listener) => {
        listeners.push(listener);
      },
      onFailure: (listener) => {
        failureListeners.push(listener);
      },
    },
    posted,
    answer: (answer) => {
      for (const listener of listeners) listener(answer);
    },
    die: (reason) => {
      for (const listener of failureListeners) listener(reason);
    },
  };
}

function callIdOf(request: SynchronousCallRequest | undefined): number {
  if (request === undefined) throw new Error('no request was posted');
  return request.callId;
}

test('an answer settles the promise of its own callId, also when answers arrive out of order', async () => {
  const { transport, posted, answer } = fakeTransport();
  const calls = createSynchronousCalls(transport);
  const identity = calls.identityOf(EXAMPLE_IDENTITY.processId);
  const record = calls.writeRecord('/scratch/example/child-1.json', '{}\n', true);
  answer({ callId: callIdOf(posted[1]), verdict: 'done', value: 'created' });
  answer({ callId: callIdOf(posted[0]), verdict: 'done', value: EXAMPLE_IDENTITY });
  expect(await record).toBe('created');
  expect(await identity).toEqual(EXAMPLE_IDENTITY);
});

test('a failed answer rejects only its own call', async () => {
  const { transport, posted, answer } = fakeTransport();
  const calls = createSynchronousCalls(transport);
  const failing = calls.appendText('/scratch/example/talos-1.log', 'a line\n');
  const passing = calls.identityOf(EXAMPLE_IDENTITY.processId);
  answer({ callId: callIdOf(posted[0]), verdict: 'failed', reason: 'EACCES: permission denied' });
  answer({ callId: callIdOf(posted[1]), verdict: 'done', value: null });
  const failure: unknown = await failing.catch((error: unknown) => error);
  expect(failure).toBeInstanceOf(SynchronousCallFailedError);
  expect(failure).toMatchObject({ call: 'append-text', reason: 'EACCES: permission denied' });
  expect(await passing).toBeNull();
});

test('calls made in order are posted in order, each with a new callId, and answered in that order', async () => {
  const { transport, posted, answer } = fakeTransport();
  const calls = createSynchronousCalls(transport);
  const settledCalls: string[] = [];
  const opened = calls.openEventLog('/scratch/example/events-1.ndjson').then(() => settledCalls.push('open-event-log'));
  const appended = calls.appendEvent('/scratch/example/events-1.ndjson', {
    sequence: 1, origin: 'agent', line: '{}', at: '2026-11-18T00:00:00.000Z'
  }).then(() => settledCalls.push('append-event'));
  const closed = calls.syncAndCloseEventLog('/scratch/example/events-1.ndjson').then(() => settledCalls.push('sync-and-close-event-log'));
  expect(posted.map((request) => request.call)).toEqual(['open-event-log', 'append-event', 'sync-and-close-event-log']);
  expect(new Set(posted.map((request) => request.callId)).size).toBe(posted.length);
  for (const request of posted) answer({ callId: request.callId, verdict: 'done', value: null });
  await Promise.all([opened, appended, closed]);
  expect(settledCalls).toEqual(['open-event-log', 'append-event', 'sync-and-close-event-log']);
});

test('an answer of no pending call is ignored', async () => {
  const { transport, posted, answer } = fakeTransport();
  const calls = createSynchronousCalls(transport);
  const started = calls.start('darwin', null);
  answer({ callId: callIdOf(posted[0]) + 1, verdict: 'done', value: 'stray' });
  answer({ callId: callIdOf(posted[0]), verdict: 'done', value: null });
  expect(await started).toBeNull();
});

test('a thread that died rejects every pending call with its reason, and every later call without posting it', async () => {
  const {
    transport, posted, answer, die
  } = fakeTransport();
  const calls = createSynchronousCalls(transport);
  const pendingIdentity = calls.identityOf(EXAMPLE_IDENTITY.processId);
  const pendingRecord = calls.writeRecord('/scratch/example/child-1.json', '{}\n', false);
  die('the synchronous-calls thread failed: example uncaught error');
  answer({ callId: callIdOf(posted[0]), verdict: 'done', value: EXAMPLE_IDENTITY });
  const laterAppend = calls.appendText('/scratch/example/talos-1.log', 'a line\n');

  const failures = await Promise.all([pendingIdentity, pendingRecord, laterAppend].map((call) => call.then(() => null, (error: unknown) => error)));
  expect(failures.map((failure) => failure instanceof SynchronousCallFailedError)).toEqual([true, true, true]);
  expect(failures).toEqual([
    expect.objectContaining({ call: 'identity-of', reason: 'the synchronous-calls thread failed: example uncaught error' }),
    expect.objectContaining({ call: 'write-record', reason: 'the synchronous-calls thread failed: example uncaught error' }),
    expect.objectContaining({ call: 'append-text', reason: 'the synchronous-calls thread failed: example uncaught error' }),
  ]);
  expect(posted.map((request) => request.call)).toEqual(['identity-of', 'write-record']);
});
