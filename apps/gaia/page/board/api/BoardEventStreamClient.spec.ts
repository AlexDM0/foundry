/**
 * The board's event-stream client against fake relay sources. What matters: it opens the relay's board events at their version; each event
 * of the board's names reaches the handler as Gaia's change signal and the last event id is kept; the connection follows open and error; a
 * handshake of another `boardStreamVersion`, or an event of another `boardVersion`, closes the stream for good as `down`; a stream the
 * browser closed is opened again after the wait while one it is reconnecting by itself is left alone; and a closed stream asks Gaia's
 * session standing as the fleet stream does: lost is `no-session`, calls `sessionWasLost` once and opens no more, held or unknown is `down`.
 */
import { describe, expect, test } from 'bun:test';

import { GAIA_ENDPOINT_VERSIONS }                                              from '../../../src/shared/constants/GaiaSystemVersions.ts';
import type { BoardEventDocument }                                             from '../../@types/board/BoardEventDocument.ts';
import type { SessionReading }                                                 from '../../api/FleetStreamClient.ts';
import { fakeRelayStreams, type FakeRelayStreams }                             from '../testing/FakeRelay.ts';
import { BoardEventStreamClient, type BoardEventStream, type ConnectionState } from './BoardEventStreamClient.ts';
import { STREAM_REOPEN_DELAY_MILLISECONDS }                                    from './constants/StreamReopening.ts';

const HANDSHAKE = { boardStreamVersion: 2, systemVersion: { major: 1, minor: 2 }, forgeSystemVersion: { major: 1, minor: 22 } };

interface OpenedStream {
  readonly relay:           FakeRelayStreams;
  readonly stream:          BoardEventStream;
  readonly received:        BoardEventDocument[];
  readonly states:          ConnectionState[];
  readonly sessionLosses:   () => number;
  /** Settles once the stream reported a state after a session reading. */
  readonly sessionAnswered: Promise<void>;
}

function openedStream(sessionReading: SessionReading = 'held'): OpenedStream {
  const relay = fakeRelayStreams();
  const received: BoardEventDocument[] = [];
  const states: ConnectionState[] = [];
  let sessionLossCount = 0;
  const { promise: sessionAnswered, resolve: answerSession } = Promise.withResolvers<void>();
  const stream = BoardEventStreamClient.open('example-tracker', {
    onEvent:      (event) => received.push(event),
    onConnection: (state) => states.push(state),
  }, {
    ...relay.surroundings,
    readSession: () => {
      queueMicrotask(answerSession);
      return Promise.resolve(sessionReading);
    },
    sessionWasLost: () => {
      sessionLossCount += 1;
    },
  });
  return {
    relay, stream, received, states, sessionLosses: () => sessionLossCount, sessionAnswered
  };
}

describe('the board\'s event-stream client', () => {
  test('opens the relay\'s board events, hands each change signal on, keeps the last event id and follows open and error', () => {
    const {
      relay, stream, received, states
    } = openedStream();
    const [source] = relay.sources;
    source?.fire('open');
    source?.fire('handshake', HANDSHAKE);
    source?.fire('job', { boardVersion: 3, kind: 'part-changed', part: 'job' }, '3-1');
    source?.fire('board', { boardVersion: 3, kind: 'board-changed' }, '3-2');
    source?.fire('pipeline', { boardVersion: 3, kind: 'part-changed', part: 'pipeline' }, '3-3');
    source?.fire('board', { boardVersion: 3, kind: 'no-such-kind' }, '3-4');
    source?.fire('error');
    expect(source?.path).toBe(`/api/v${GAIA_ENDPOINT_VERSIONS.forgeBoardEvents}/forges/example-tracker/board/events`);
    expect(received).toEqual([
      { boardVersion: 3, kind: 'part-changed', part: 'job' },
      { boardVersion: 3, kind: 'board-changed' },
      { boardVersion: 3, kind: 'part-changed', part: 'pipeline' },
    ]);
    expect(stream.lastEventId()).toBe('3-3');
    expect(states).toEqual(['connecting', 'live', 'down']);
    stream.close();
    expect(source?.closed).toBe(true);
  });

  test('a handshake of another stream version closes the stream for good as down', () => {
    const { relay, states } = openedStream();
    const [source] = relay.sources;
    source?.fire('open');
    source?.fire('handshake', { ...HANDSHAKE, boardStreamVersion: 3 });
    expect([source?.closed, states.at(-1), relay.pendingWaits()]).toEqual([true, 'down', []]);
  });

  test('an event of another board version closes the stream for good as down, and hands nothing on', () => {
    const { relay, received, states } = openedStream();
    const [source] = relay.sources;
    source?.fire('open');
    source?.fire('board', { boardVersion: 4, kind: 'board-changed' }, '3-1');
    source?.fire('board', { boardVersion: 3, kind: 'board-changed' }, '3-2');
    expect([source?.closed, states.at(-1), received, relay.pendingWaits()]).toEqual([true, 'down', [], []]);
  });

  test('a stream the browser closed is opened again after the wait; one it is reconnecting itself is not', async () => {
    const { relay, stream, sessionAnswered } = openedStream();
    const [first] = relay.sources;
    first?.fire('error');
    expect([relay.sources.length, relay.pendingWaits()]).toEqual([1, []]);
    first?.giveUp();
    await sessionAnswered;
    expect(relay.pendingWaits()).toEqual([STREAM_REOPEN_DELAY_MILLISECONDS]);
    relay.fireWaits();
    expect(relay.sources.length).toBe(2);
    stream.close();
  });

  test.each([
    { reading: 'held', expected: 'down' },
    { reading: 'unknown', expected: 'down' },
  ] as const)('a closed stream while Gaia\'s session reads $reading is $expected, and reopens', async ({ reading, expected }) => {
    const {
      relay, states, sessionLosses, sessionAnswered
    } = openedStream(reading);
    relay.sources[0]?.giveUp();
    await sessionAnswered;
    expect([states, sessionLosses(), relay.pendingWaits()]).toEqual([['connecting', expected], 0, [STREAM_REOPEN_DELAY_MILLISECONDS]]);
  });

  test('a closed stream whose session is lost is no-session, tells the page once, and opens no more', async () => {
    const {
      relay, states, sessionLosses, sessionAnswered
    } = openedStream('lost');
    relay.sources[0]?.giveUp();
    await sessionAnswered;
    expect([states, sessionLosses(), relay.pendingWaits()]).toEqual([['connecting', 'no-session'], 1, []]);
  });
});
