/**
 * The three relayed streams over Example Storefront's recorded streams. What matters: a stream opens with Gaia's handshake, with no id,
 * naming Gaia's and the forge's versions; the forge's own handshake is dropped; each event is re-emitted under the forge's name and id with
 * its data mapped to the page's contract; the page's `Last-Event-ID` and `after` reach the forge; the page's stream ends when the forge's
 * does, and the forge's is closed when the page goes; two page streams of one forge map each event once; an event that does not ingest is
 * dropped and logged; and each way a stream cannot open is its own refusal, the token in no answer and no log line.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  spyOn,
  test
} from 'bun:test';

import { recordedPathSegmentOf }   from '../../../adapters/forge-api/testing/BoardDocuments.ts';
import { BoardDocumentMapUtil }    from '../../../adapters/page-api/BoardDocumentMapUtil.ts';
import { SUPPORTED_FORGE_VERSION } from '../../../lib/forge-client/constants/SupportedForgeVersions.ts';
import { GAIA_SYSTEM_VERSION }     from '../../../shared/constants/GaiaSystemVersions.ts';
import { manualTimers }            from '../../../testing/ManualTimers.ts';
import {
  recordedBoardAnswersOf,
  recordedOverseerFetch,
  type BoardSituation,
  type RecordedOverseerAnswer,
  type RecordedOverseerFetch,
} from '../../../testing/RecordedAnswers.ts';
import { createScratchDirectory, removeScratchPath } from '../../../testing/ScratchRoot.ts';
import type { BoardRelayLogEntry }                   from '../@types/BoardRelayLogEntry.ts';
import { createBoardStreams, type BoardStreams }     from '../BoardStreams.ts';
import {
  EXAMPLE_FORGE_TOKEN,
  STOREFRONT_TRACKER_ID,
  boardAnswering,
  exampleRelayForgeOf,
  exampleTokenFileIn,
  recordedBoardEventIdOf,
  relaySourcesOver,
  stoppedForgeAnswering,
  type ExampleRelayForgeOptions,
} from '../testing/ExampleRelayForge.ts';
import { relayEventReaderOf }                                               from '../testing/RelayEventReader.ts';
import { boardEventsAnswerFor, jobStreamAnswerFor, profileStreamAnswerFor } from './BoardStreamRoutes.ts';

const EVENTS_CALL_SHAPE = 'STREAM /api/v2/events with bearer';
const EVENTS_FROM_LAST_ID_CALL_SHAPE = 'STREAM /api/v2/events with bearer from a last event id';
const RELAY_URL = 'http://127.0.0.1:4790/api/v1/forges/example-storefront-7c41';
const EXAMPLE_LAST_EVENT_ID = recordedBoardEventIdOf('board-at-work', 'afresh');

const JOB_ID = recordedPathSegmentOf('intake-conversation', /\/jobs\/([^/]+)\/stream/);
const PROFILE_RUN_ID = recordedPathSegmentOf('gate-profile-run', /\/profiles\/([^/]+)\/stream/);

let scratchFolder = '';
let tokenPath = '';
let logEntries: BoardRelayLogEntry[] = [];
let boardStreams: BoardStreams;

beforeEach(() => {
  scratchFolder = createScratchDirectory('board-stream-routes');
  tokenPath     = exampleTokenFileIn(scratchFolder);
  logEntries    = [];
  boardStreams  = createBoardStreams({
    timers: manualTimers(),
    log:    (entry) => {
      logEntries.push(entry);
    },
  });
});

afterEach(() => {
  boardStreams.stop();
  removeScratchPath(scratchFolder);
});

function sourcesOver(overseerFetch: RecordedOverseerFetch, options: ExampleRelayForgeOptions = {}) {
  return { forgeAccess: relaySourcesOver(exampleRelayForgeOf(scratchFolder, tokenPath, options), overseerFetch), boardStreams };
}

function pageRequest(path: string, headers: Readonly<Record<string, string>> = {}): Request {
  return new Request(`${RELAY_URL}/${path}`, { headers });
}

/** The recorded answers of a situation, a stream among them ending where the recording stays open, as a forge's stream ends at its stop. */
function answersEndingStreams(situation: BoardSituation): readonly RecordedOverseerAnswer[] {
  return recordedBoardAnswersOf(situation).map(({ callShape, answer }) => ({
    callShape,
    answer: answer.verdict === 'streaming' ? { ...answer, ending: 'closed' as const } : answer,
  }));
}

/** The recorded answer of a stream, given for the same stream asked from a cursor and a last event id, which the recording did not ask. */
function answersAfterCursor(situation: BoardSituation, cursor: string): readonly RecordedOverseerAnswer[] {
  return recordedBoardAnswersOf(situation).map(({ callShape, answer }) => ({
    callShape: callShape.replace(/\/stream with bearer$/, `/stream?after=${encodeURIComponent(cursor)} with bearer from a last event id`),
    answer,
  }));
}

describe('the board\'s events', () => {
  test('open with Gaia\'s handshake, with no id, then re-emit each event under the forge\'s name and id as a change signal', async () => {
    const answer = await boardEventsAnswerFor(pageRequest('board/events'), STOREFRONT_TRACKER_ID, sourcesOver(boardAnswering('board-at-work')));
    expect([answer.status, answer.headers.get('content-type')]).toEqual([200, 'text/event-stream']);
    const events = relayEventReaderOf(answer);
    const handshake = await events.nextEvent();
    expect([handshake.eventName, handshake.lastEventId, JSON.parse(handshake.data)]).toEqual(['handshake', '', {
      boardStreamVersion: 1,
      systemVersion:      { major: GAIA_SYSTEM_VERSION.major, minor: GAIA_SYSTEM_VERSION.minor },
      forgeSystemVersion: { major: SUPPORTED_FORGE_VERSION.major, minor: SUPPORTED_FORGE_VERSION.minor },
    }]);
    const boardEvent = await events.nextEvent();
    expect([boardEvent.eventName, boardEvent.lastEventId, JSON.parse(boardEvent.data)]).toEqual(['board', EXAMPLE_LAST_EVENT_ID, { boardVersion: 1, kind: 'board-changed' }]);
    await events.leave();
  });

  test('ask the forge from the page\'s Last-Event-ID', async () => {
    const overseerFetch = boardAnswering('board-at-work');
    const answer = await boardEventsAnswerFor(pageRequest('board/events', { 'last-event-id': EXAMPLE_LAST_EVENT_ID }), STOREFRONT_TRACKER_ID, sourcesOver(overseerFetch));
    const events = relayEventReaderOf(answer);
    await events.nextEvent();
    expect((await events.nextEvent()).lastEventId).toBe(recordedBoardEventIdOf('board-at-work', 'from-a-last-event-id'));
    expect(overseerFetch.callsAnswered().map((call) => [call.callShape, call.lastEventId])).toEqual([[EVENTS_FROM_LAST_ID_CALL_SHAPE, EXAMPLE_LAST_EVENT_ID]]);
    await events.leave();
  });

  test('end the page\'s stream when the forge\'s ends', async () => {
    const overseerFetch = recordedOverseerFetch(answersEndingStreams('board-at-work'));
    const answer = await boardEventsAnswerFor(pageRequest('board/events'), STOREFRONT_TRACKER_ID, sourcesOver(overseerFetch));
    expect((await relayEventReaderOf(answer).untilEnd()).map((event) => event.eventName)).toEqual(['handshake', 'board']);
    expect(boardStreams.openStreamCount()).toBe(0);
  });

  test('close the forge\'s stream when the page goes', async () => {
    const overseerFetch = boardAnswering('board-at-work');
    const answer = await boardEventsAnswerFor(pageRequest('board/events'), STOREFRONT_TRACKER_ID, sourcesOver(overseerFetch));
    const events = relayEventReaderOf(answer);
    await events.nextEvent();
    expect(overseerFetch.streamsLeftOpen()).toBe(1);
    await events.leave();
    expect([overseerFetch.streamsLeftOpen(), boardStreams.openStreamCount()]).toEqual([0, 0]);
  });

  test('map each event once for two page streams of the same forge', async () => {
    const eventMapSpy = spyOn(BoardDocumentMapUtil, 'eventDocumentOf');
    try {
      const sources = sourcesOver(boardAnswering('board-at-work'));
      const readers = await Promise.all([1, 2].map(async () => relayEventReaderOf(await boardEventsAnswerFor(pageRequest('board/events'), STOREFRONT_TRACKER_ID, sources))));
      for (const events of readers) {
        await events.nextEvent();
        expect((await events.nextEvent()).eventName).toBe('board');
      }
      expect(eventMapSpy).toHaveBeenCalledTimes(1);
      await Promise.all(readers.map((events) => events.leave()));
    } finally {
      eventMapSpy.mockRestore();
    }
  });
});

describe('a job\'s stream', () => {
  test('re-emits the forge\'s history under its name and id, as the page\'s conversation document', async () => {
    const answer = await jobStreamAnswerFor(pageRequest(`jobs/${JOB_ID}/stream`), STOREFRONT_TRACKER_ID, JOB_ID, sourcesOver(boardAnswering('intake-conversation')));
    const events = relayEventReaderOf(answer);
    expect((await events.nextEvent()).eventName).toBe('handshake');
    const history = await events.nextEvent();
    expect([history.eventName, history.lastEventId]).toEqual(['history', '1.2']);
    expect(JSON.parse(history.data)).toMatchObject({ boardVersion: 1, kind: 'history', entries: [{ cursor: '1.2', role: 'overseer' }] });
    await events.leave();
  });

  test('asks the forge from the page\'s after cursor and Last-Event-ID', async () => {
    const overseerFetch = recordedOverseerFetch(answersAfterCursor('intake-conversation', '1.1'));
    const request = pageRequest(`jobs/${JOB_ID}/stream?after=1.1`, { 'last-event-id': '1.1' });
    const events = relayEventReaderOf(await jobStreamAnswerFor(request, STOREFRONT_TRACKER_ID, JOB_ID, sourcesOver(overseerFetch)));
    await events.nextEvent();
    const [call] = overseerFetch.callsAnswered().filter((answered) => answered.callShape.startsWith('STREAM '));
    expect([call?.callShape, call?.lastEventId]).toEqual([`STREAM /api/v1/jobs/${JOB_ID}/stream?after=1.1 with bearer from a last event id`, '1.1']);
    await events.leave();
  });
});

describe('a profile run\'s stream', () => {
  test('re-emits each output line under its name and id', async () => {
    const request = pageRequest(`profiles/${PROFILE_RUN_ID}/stream`);
    const answer = await profileStreamAnswerFor(request, STOREFRONT_TRACKER_ID, PROFILE_RUN_ID, sourcesOver(boardAnswering('gate-profile-run')));
    const events = relayEventReaderOf(answer);
    await events.nextEvent();
    const line = await events.nextEvent();
    expect([line.eventName, line.lastEventId, JSON.parse(line.data)]).toEqual(['line', '1', { boardVersion: 1, kind: 'line', line: { text: 'Example gate passed\n' } }]);
    await events.leave();
  });
});

describe('an event that does not ingest', () => {
  test('is dropped, never forwarded raw, and logged with the keys it lacks', async () => {
    const recordedLine = recordedBoardAnswersOf('gate-profile-run');
    const withoutText = recordedLine.map(({ callShape, answer }) => ({
      callShape,
      answer: answer.verdict === 'streaming'
        ? { ...answer, ending: 'closed' as const, chunks: answer.chunks.map((chunk) => chunk.replace(/data: \{"text":.*\}/, 'data: {"line":"Example gate passed"}')) }
        : answer,
    }));
    const request = pageRequest(`profiles/${PROFILE_RUN_ID}/stream`);
    const answer = await profileStreamAnswerFor(request, STOREFRONT_TRACKER_ID, PROFILE_RUN_ID, sourcesOver(recordedOverseerFetch(withoutText)));
    expect((await relayEventReaderOf(answer).untilEnd()).map((event) => event.eventName)).toEqual(['handshake']);
    expect(boardStreams.droppedEventCount()).toBe(1);
    expect(logEntries).toEqual([{
      kind: 'event-dropped', trackerId: STOREFRONT_TRACKER_ID, stream: `/api/v1/profiles/${PROFILE_RUN_ID}/stream`, eventName: 'line', invalidKeys: ['text'],
    }]);
  });
});

describe('a stream that cannot open', () => {
  test('is forge-not-registered for a forge the registry does not name, and asks nothing', async () => {
    const overseerFetch = recordedOverseerFetch([]);
    const forgeAccess = relaySourcesOver(exampleRelayForgeOf(scratchFolder, tokenPath), overseerFetch, { verdict: 'readable', forges: [] });
    const answer = await boardEventsAnswerFor(pageRequest('board/events'), STOREFRONT_TRACKER_ID, { forgeAccess, boardStreams });
    expect([answer.status, await answer.json(), overseerFetch.callsAnswered()]).toEqual([404, { refusal: 'forge-not-registered', refusedBy: 'gaia' }, []]);
  });

  test('is forge-unreachable when the Overseer does not answer', async () => {
    const answer = await boardEventsAnswerFor(pageRequest('board/events'), STOREFRONT_TRACKER_ID, sourcesOver(stoppedForgeAnswering([EVENTS_CALL_SHAPE])));
    expect([answer.status, await answer.json(), boardStreams.openStreamCount()]).toEqual([502, { refusal: 'forge-unreachable', refusedBy: 'gaia' }, 0]);
  });

  test('is forge-version-unsupported for a forge Gaia cannot talk to', async () => {
    const newer = { verdict: 'newer', current: { major: 2, minor: 1 }, minimumSupported: { major: 2, minor: 0 } } as const;
    const sources = sourcesOver(recordedOverseerFetch([]), { fidelity: 'newer-contract', versions: newer });
    const answer = await boardEventsAnswerFor(pageRequest('board/events'), STOREFRONT_TRACKER_ID, sources);
    expect([answer.status, await answer.json()]).toEqual([501, { refusal: 'forge-version-unsupported', refusedBy: 'gaia' }]);
  });

  test('is forge-version-unsupported, logged, when the forge\'s handshake names another version than the watch read', async () => {
    const ahead = { major: SUPPORTED_FORGE_VERSION.major, minor: SUPPORTED_FORGE_VERSION.minor + 1 };
    const overseerFetch = boardAnswering('board-at-work');
    const answer = await boardEventsAnswerFor(
      pageRequest('board/events'), STOREFRONT_TRACKER_ID, sourcesOver(overseerFetch, { versions: { verdict: 'ahead', current: ahead, minimumSupported: { major: 1, minor: 0 } } }),
    );
    expect([answer.status, await answer.json(), overseerFetch.streamsLeftOpen(), boardStreams.openStreamCount()])
      .toEqual([501, { refusal: 'forge-version-unsupported', refusedBy: 'gaia' }, 0, 0]);
    expect(logEntries).toEqual([{
      kind: 'handshake-version-differs', trackerId: STOREFRONT_TRACKER_ID, stream: '/api/v2/events', versionWatchRead: ahead, versionHandshakeNamed: SUPPORTED_FORGE_VERSION,
    }]);
  });

  test('is token-unreadable when the registry names no token file', async () => {
    const answer = await boardEventsAnswerFor(pageRequest('board/events'), STOREFRONT_TRACKER_ID, sourcesOver(recordedOverseerFetch([]), { tokenPath: null }));
    expect([answer.status, await answer.json()]).toEqual([502, { refusal: 'token-unreadable', refusedBy: 'gaia' }]);
  });

  test('is token-rejected when the Overseer refuses the token, which reaches no answer and no log line', async () => {
    const answer = await boardEventsAnswerFor(pageRequest('board/events'), STOREFRONT_TRACKER_ID, sourcesOver(boardAnswering('board-token-rejected')));
    const answerText = `${[...answer.headers.entries()].flat().join('\n')}\n${await answer.text()}`;
    expect([answer.status, JSON.parse(answerText.slice(answerText.indexOf('{')))]).toEqual([502, { refusal: 'token-rejected', refusedBy: 'gaia' }]);
    expect(`${answerText}${JSON.stringify(logEntries)}`).not.toContain(EXAMPLE_FORGE_TOKEN);
  });
});
