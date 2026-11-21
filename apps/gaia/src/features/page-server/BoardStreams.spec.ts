/**
 * The set of open relayed streams over Example Storefront's recorded board stream, its heartbeat fired by hand. What matters: a heartbeat
 * reaches every open stream and runs only while one is open; a stop closes every page stream and the forge stream each follows, and opens
 * no stream after it; an event two page streams of one forge hear is mapped once; and a job's `history`, which carries the last cursor as
 * its id whatever cursor a page resumed from, reaches each page stream with its own entries. The routes' specs hold the opening, the
 * relaying and the refusals.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import type { ForgeStreamEvent, ForgeStreamFollow, MonitorFollowEnd }     from '../../lib/forge-client/@types/ForgeClientAnswer.ts';
import { forgeClientOf }                                                  from '../../lib/forge-client/ForgeClient.ts';
import { SUPPORTED_FORGE_VERSION }                                        from '../../lib/forge-client/constants/SupportedForgeVersions.ts';
import { manualTimers, type ManualTimers }                                from '../../testing/ManualTimers.ts';
import type { RecordedHephaestusFetch }                                   from '../../testing/RecordedAnswers.ts';
import { createBoardStreams, type BoardStreams, type RelayStreamRequest } from './BoardStreams.ts';
import {
  STOREFRONT_TRACKER_ID,
  STOREFRONT_URL,
  boardAnswering,
  recordedBoardEventIdOf,
} from './testing/ExampleRelayForge.ts';
import { relayEventReaderOf } from './testing/RelayEventReader.ts';

const HEARTBEAT_MILLISECONDS = 1_000;
const EXAMPLE_ACCESS = { hephaestusUrl: STOREFRONT_URL, bearerToken: 'example-forge-token-0123456789abcdef' };

let timers: ManualTimers;
let boardStreams: BoardStreams;
let hephaestusFetch: RecordedHephaestusFetch;

beforeEach(() => {
  timers        = manualTimers();
  boardStreams  = createBoardStreams({ timers, log: () => undefined, heartbeatIntervalMilliseconds: HEARTBEAT_MILLISECONDS });
  hephaestusFetch = boardAnswering('board-at-work');
});

afterEach(() => {
  boardStreams.stop();
});

function boardEventsRequest(mapEvent: RelayStreamRequest['mapEvent'] = (event) => ({ verdict: 'relayed', event: { eventName: event.eventName, data: '{}' } })): RelayStreamRequest {
  const forgeClient = forgeClientOf({ hephaestusFetch });
  return {
    trackerId:          STOREFRONT_TRACKER_ID,
    forgeSystemVersion: SUPPORTED_FORGE_VERSION,
    forgeStreamPath:    '/api/v3/events',
    follow:             (onEvent) => forgeClient.followEvents(EXAMPLE_ACCESS, null, onEvent),
    mapEvent,
  };
}

async function openedResponse(request: RelayStreamRequest = boardEventsRequest()): Promise<Response> {
  const opening = await boardStreams.openStream(request);
  if (opening.verdict !== 'streaming') throw new Error(`The relayed stream did not open: ${opening.refusal}.`);
  return opening.response;
}

describe('the heartbeat', () => {
  test('reaches every open stream, and runs only while one is open', async () => {
    const readers = [relayEventReaderOf(await openedResponse()), relayEventReaderOf(await openedResponse())];
    expect(timers.pendingDelays()).toEqual([HEARTBEAT_MILLISECONDS]);
    expect(timers.fire(HEARTBEAT_MILLISECONDS)).toBe(1);
    for (const events of readers) {
      await events.nextEvent();
      await events.nextEvent();
    }
    await Promise.all(readers.map((events) => events.leave()));
    expect([boardStreams.openStreamCount(), timers.pendingDelays()]).toEqual([0, []]);
  });
});

describe('a stop', () => {
  test('closes every page stream and the forge stream each follows, and opens none after it', async () => {
    const responses = [await openedResponse(), await openedResponse()];
    expect(hephaestusFetch.streamsLeftOpen()).toBe(2);
    boardStreams.stop();
    const endings = await Promise.all(responses.map((response) => relayEventReaderOf(response).untilEnd()));
    expect(endings.map((events) => events.map((event) => event.eventName))).toEqual([['handshake', 'board'], ['handshake', 'board']]);
    expect([hephaestusFetch.streamsLeftOpen(), boardStreams.openStreamCount(), timers.pendingDelays()]).toEqual([0, 0, []]);
    expect(await boardStreams.openStream(boardEventsRequest())).toEqual({ verdict: 'refused', refusal: 'forge-unreachable' });
  });
});

describe('an event mapped for several page streams', () => {
  test('is mapped once per forge stream and id, whichever page stream hears it first', async () => {
    const mappedEvents: ForgeStreamEvent[] = [];
    const countingRequest = boardEventsRequest((event) => {
      mappedEvents.push(event);
      return { verdict: 'relayed', event: { eventName: event.eventName, data: '{}' } };
    });
    const readers = [relayEventReaderOf(await openedResponse(countingRequest)), relayEventReaderOf(await openedResponse(countingRequest))];
    for (const events of readers) {
      await events.nextEvent();
      await events.nextEvent();
    }
    expect(mappedEvents.map((event) => [event.eventName, event.id])).toEqual([['board', recordedBoardEventIdOf('board-at-work', 'afresh')]]);
    await Promise.all(readers.map((events) => events.leave()));
  });
});

/** The forge's job stream as `hephaestus-fetch-board`'s `intake-conversation` sent it: its handshake, then `history` under the last cursor. */
function jobStreamFollowSending(historyData: string): RelayStreamRequest['follow'] {
  return (onEvent) => {
    let endFollow: (end: MonitorFollowEnd) => void = () => undefined;
    const follow: ForgeStreamFollow = {
      ended: new Promise<MonitorFollowEnd>((resolve) => {
        endFollow = resolve;
      }),
      stop: () => endFollow({ verdict: 'ended', ending: 'stopped' }),
    };
    onEvent({ id: null, eventName: 'handshake', data: JSON.stringify({ systemVersion: SUPPORTED_FORGE_VERSION }) });
    onEvent({ id: '1.2', eventName: 'history', data: historyData });
    return follow;
  };
}

describe('a job\'s history under one cursor', () => {
  test('reaches a page stream resumed from that cursor with no entries, though a page stream from the start heard them first', async () => {
    const historyFromStart = JSON.stringify([{ cursor: '1.2', role: 'hephaestus', text: 'Example: suggest searches as the shopper types.' }]);
    const jobStreamRequest = (historyData: string): RelayStreamRequest => ({
      trackerId:          STOREFRONT_TRACKER_ID,
      forgeSystemVersion: SUPPORTED_FORGE_VERSION,
      forgeStreamPath:    '/api/v1/jobs/J4/stream',
      follow:             jobStreamFollowSending(historyData),
      mapEvent:           (event) => ({ verdict: 'relayed', event: { eventName: event.eventName, data: event.data } }),
    });
    const fromStart = relayEventReaderOf(await openedResponse(jobStreamRequest(historyFromStart)));
    const resumed = relayEventReaderOf(await openedResponse(jobStreamRequest('[]')));
    const historiesHeard: string[] = [];
    for (const events of [fromStart, resumed]) {
      await events.nextEvent();
      historiesHeard.push((await events.nextEvent()).data);
    }
    expect(historiesHeard).toEqual([historyFromStart, '[]']);
    await Promise.all([fromStart, resumed].map((events) => events.leave()));
  });
});
