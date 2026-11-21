/**
 * The fleet stream client. What matters (W4.3; SCREENS "The shell", the connection banner): each `fleet` event's document is published;
 * a stream that errs reads `lost` at once, is closed, and is opened again only when its reopen is due, read `lost` until it opens; a
 * stopped client leaves no stream and no reopen; data that is no fleet document is dropped; a document of another `fleetVersion`, newer or
 * older, reloads the page once, and never twice for the same version, so a page that stays out of date says so rather than reload without
 * end; a session check that nothing answers reads `server-ended`, since the session lived in the gone server's memory, and only an answer
 * moves it on (#75). The stream opens on a handshake naming the server's system version: one of this page's system major is passed over, one
 * of another major reloads the page once as another `fleetVersion` does, and one that cannot be read is passed over; the system version
 * each `fleet` event carries is the stream's, so the document published leaves it out.
 *
 * The browser's `EventSource` is stood in for by a source the spec opens, errs and feeds the events Gaia's server sends (PLAN 8.1: `fleet`
 * events and a heartbeat); the reopen is a schedule the spec runs, so no spec waits the interval.
 */
import { describe, expect, test } from 'bun:test';

import type { FleetDocument } from '../@types/FleetDocument.ts';
import { FLEET_FIVE_FORGES }  from '../testing/fixtures/fleet-five-forges.ts';
import {
  type FleetEventSource,
  FleetStreamClient,
  type FleetStreamState,
  type FleetStreamSurroundings,
  type SessionReading,
} from './FleetStreamClient.ts';

interface StandInSource extends FleetEventSource {
  readonly path:     string;
  readonly isClosed: () => boolean;
  /** Dispatches an event of this type to every listener for it, with the data as a `MessageEvent`'s. */
  readonly emit:     (type: string, data?: string) => void;
}

interface ScheduledTask {
  readonly task:              () => void;
  readonly delayMilliseconds: number;
  readonly isCancelled:       () => boolean;
}

function standInSource(path: string): StandInSource {
  const listeners: { readonly type: string; readonly listener: (event: Event) => void }[] = [];
  let closed = false;
  return {
    path,
    isClosed:         () => closed,
    addEventListener: (type, listener) => listeners.push({ type, listener }),
    close:            () => {
      closed = true;
    },
    emit: (type, data) => {
      const event = data === undefined ? new Event(type) : new MessageEvent(type, { data });
      listeners.filter((entry) => entry.type === type).forEach((entry) => entry.listener(event));
    },
  };
}

interface StreamStage {
  readonly client:                  ReturnType<typeof FleetStreamClient.create>;
  readonly published:               FleetDocument[];
  readonly opened:                  StandInSource[];
  readonly scheduled:               ScheduledTask[];
  readonly reloads:                 string[];
  readonly marks:                   (string | null)[];
  /** The source opened last; the spec fails when none was. */
  readonly latest:                  () => StandInSource;
  /** What the session check answers from now on. */
  readonly answerSessionChecksWith: (reading: SessionReading) => void;
}

interface StreamStageOptions {
  readonly storedMark?:     string | null;
  readonly markCanBeKept?:  boolean;
  /** What the session check answers after each error until the spec answers otherwise; held when the spec names nothing. */
  readonly sessionReading?: SessionReading;
}

function streamStage(options: StreamStageOptions = {}): StreamStage {
  const published: FleetDocument[] = [];
  const opened: StandInSource[] = [];
  const scheduled: ScheduledTask[] = [];
  const reloads: string[] = [];
  let storedMark = options.storedMark ?? null;
  let sessionReading = options.sessionReading ?? 'held';
  const marks: (string | null)[] = [];
  const surroundings: FleetStreamSurroundings = {
    openEventSource: (path) => {
      const source = standInSource(path);
      opened.push(source);
      return source;
    },
    schedule: (task, delayMilliseconds) => {
      let cancelled = false;
      scheduled.push({ task, delayMilliseconds, isCancelled: () => cancelled });
      return () => {
        cancelled = true;
      };
    },
    reloadPage:  () => reloads.push('reloaded'),
    readSession: () => Promise.resolve(sessionReading),
    reloadMark:  {
      read:  () => storedMark,
      write: (fleetVersion) => {
        marks.push(fleetVersion);
        if (options.markCanBeKept === false) return false;
        storedMark = fleetVersion;
        return true;
      },
    },
  };
  return {
    client: FleetStreamClient.create((fleetDocument) => published.push(fleetDocument), surroundings),
    published,
    opened,
    scheduled,
    reloads,
    marks,
    latest: () => {
      const source = opened.at(-1);
      if (source === undefined) throw new Error('The client opened no stream.');
      return source;
    },
    answerSessionChecksWith: (reading) => {
      sessionReading = reading;
    },
  };
}

function followedAndLive(stage: StreamStage): StreamStage {
  stage.client.follow();
  stage.latest().emit('open');
  return stage;
}

const FLEET_DOCUMENT_TEXT = JSON.stringify(FLEET_FIVE_FORGES);

const NEWER_FLEET_VERSION = FLEET_FIVE_FORGES.fleetVersion + 1;

const NEWER_FLEET_VERSION_MARK = String(NEWER_FLEET_VERSION);

const NEWER_FLEET_DOCUMENT_TEXT = JSON.stringify({ ...FLEET_FIVE_FORGES, fleetVersion: NEWER_FLEET_VERSION });

describe('following the event stream', () => {
  test('it opens /api/v6/events, reads connecting until the stream opens and live from then, and publishes each fleet document', () => {
    const stage = streamStage();
    stage.client.follow();
    expect(stage.opened.map((source) => source.path)).toEqual(['/api/v6/events']);
    expect(stage.client.state()).toBe('connecting');
    stage.latest().emit('open');
    expect(stage.client.state()).toBe('live');
    stage.latest().emit(FleetStreamClient.FLEET_EVENT_NAME, FLEET_DOCUMENT_TEXT);
    stage.latest().emit('heartbeat', '');
    expect(stage.published).toEqual([FLEET_FIVE_FORGES]);
  });

  test('a handshake of this page\'s system major is passed over, and the document of a fleet event is published without the event\'s system version', () => {
    const stage = followedAndLive(streamStage());
    stage.latest().emit(FleetStreamClient.HANDSHAKE_EVENT_NAME, JSON.stringify({ systemVersion: { major: 1, minor: 4 } }));
    stage.latest().emit(FleetStreamClient.FLEET_EVENT_NAME, JSON.stringify({ ...FLEET_FIVE_FORGES, systemVersion: { major: 1, minor: 4 } }));
    expect([stage.client.state(), stage.published, stage.reloads]).toEqual(['live', [FLEET_FIVE_FORGES], []]);
  });

  test('a handshake of another system major reloads the page once, and a handshake that cannot be read is passed over', () => {
    const stage = followedAndLive(streamStage());
    for (const data of ['not json', '{}', JSON.stringify({ systemVersion: { major: '2', minor: 0 } })]) stage.latest().emit(FleetStreamClient.HANDSHAKE_EVENT_NAME, data);
    expect([stage.client.state(), stage.reloads]).toEqual(['live', []]);
    stage.latest().emit(FleetStreamClient.HANDSHAKE_EVENT_NAME, JSON.stringify({ systemVersion: { major: 2, minor: 0 } }));
    expect([stage.marks, stage.reloads, stage.latest().isClosed()]).toEqual([['system 2'], ['reloaded'], true]);
  });

  test('following twice opens one stream', () => {
    const stage = followedAndLive(streamStage());
    stage.client.follow();
    expect(stage.opened).toHaveLength(1);
  });

  test('a fleet document of this page\'s fleetVersion with a key this page does not know is published', () => {
    const stage = followedAndLive(streamStage());
    const withAddedKey = { ...FLEET_FIVE_FORGES, exampleAddedKey: true };
    stage.latest().emit(FleetStreamClient.FLEET_EVENT_NAME, JSON.stringify(withAddedKey));
    expect([stage.client.state(), stage.published, stage.reloads]).toEqual(['live', [withAddedKey], []]);
  });

  test('data that is no fleet document is dropped, and the stream stays live', () => {
    const stage = followedAndLive(streamStage());
    for (const data of ['not json', 'null', '{}', '{"fleetVersion":"1"}', '[1]']) stage.latest().emit(FleetStreamClient.FLEET_EVENT_NAME, data);
    stage.latest().emit(FleetStreamClient.FLEET_EVENT_NAME);
    expect([stage.published, stage.client.state(), stage.reloads]).toEqual([[], 'live', []]);
  });

  test('subscribers hear each change of state, and only a change', () => {
    const stage = streamStage();
    const heard: FleetStreamState[] = [];
    stage.client.subscribe(() => heard.push(stage.client.state()));
    followedAndLive(stage);
    stage.latest().emit('open');
    stage.latest().emit('error');
    expect(heard).toEqual(['live', 'lost']);
  });
});

describe('a lost stream and its reopening', () => {
  test('an error reads lost at once, closes the stream, and schedules one reopen after the reopen interval', () => {
    const stage = followedAndLive(streamStage());
    const first = stage.latest();
    first.emit('error');
    expect(stage.client.state()).toBe('lost');
    expect(first.isClosed()).toBe(true);
    expect(stage.scheduled.map((scheduled) => scheduled.delayMilliseconds)).toEqual([FleetStreamClient.FLEET_STREAM_REOPEN_INTERVAL_MILLISECONDS]);
    expect(stage.opened).toHaveLength(1);
  });

  test('the due reopen opens a new stream, which reads lost until it opens and live once it does', () => {
    const stage = followedAndLive(streamStage());
    stage.latest().emit('error');
    stage.scheduled[0]?.task();
    expect(stage.opened).toHaveLength(2);
    expect(stage.client.state()).toBe('lost');
    stage.latest().emit('open');
    expect(stage.client.state()).toBe('live');
    stage.latest().emit(FleetStreamClient.FLEET_EVENT_NAME, FLEET_DOCUMENT_TEXT);
    expect(stage.published).toEqual([FLEET_FIVE_FORGES]);
  });

  test('a reopened stream that errs again schedules the next reopen, and the server down at the first open reads lost too', () => {
    const stage = streamStage();
    stage.client.follow();
    stage.latest().emit('error');
    stage.scheduled[0]?.task();
    stage.latest().emit('error');
    expect(stage.client.state()).toBe('lost');
    expect(stage.scheduled).toHaveLength(2);
  });

  test('a closed stream is heard no more: its late error schedules nothing and its late events publish nothing', () => {
    const stage = followedAndLive(streamStage());
    const first = stage.latest();
    first.emit('error');
    first.emit('error');
    stage.scheduled[0]?.task();
    first.emit(FleetStreamClient.FLEET_EVENT_NAME, FLEET_DOCUMENT_TEXT);
    first.emit('open');
    expect([stage.scheduled.length, stage.published, stage.client.state()]).toEqual([1, [], 'lost']);
  });

  test('a stopped client closes its stream, cancels its reopen, and opens nothing when the cancelled reopen runs anyway', () => {
    const stage = followedAndLive(streamStage());
    stage.latest().emit('error');
    stage.client.stop();
    expect(stage.scheduled[0]?.isCancelled()).toBe(true);
    stage.scheduled[0]?.task();
    expect(stage.opened).toHaveLength(1);

    const live = followedAndLive(streamStage());
    live.client.stop();
    expect(live.latest().isClosed()).toBe(true);
  });
});

describe('a session the server no longer knows', () => {
  test('a stream that errs while the session check answers lost reads session-lost, cancels its reopen and opens no stream again', async () => {
    const stage = followedAndLive(streamStage({ sessionReading: 'lost' }));
    stage.latest().emit('error');
    expect(stage.client.state()).toBe('lost');
    await Promise.resolve();
    expect(stage.client.state()).toBe('session-lost');
    expect(stage.scheduled[0]?.isCancelled()).toBe(true);
    stage.client.follow();
    expect(stage.opened).toHaveLength(1);
  });

  test('a session check that is held leaves the stream lost and its reopen due', async () => {
    const stage = followedAndLive(streamStage({ sessionReading: 'held' }));
    stage.latest().emit('error');
    await Promise.resolve();
    expect([stage.client.state(), stage.scheduled[0]?.isCancelled()]).toEqual(['lost', false]);
  });

  test('losing the session from a command\'s answer stops the stream at once, and the controls may not act', () => {
    const stage = followedAndLive(streamStage());
    stage.client.loseSession();
    expect([stage.client.state(), stage.latest().isClosed()]).toEqual(['session-lost', true]);
    expect(FleetStreamClient.controlsMayActIn(stage.client.state())).toBe(false);
  });
});

describe('a server that no longer answers', () => {
  test('a session check that nothing answered reads server-ended, keeps the reopen due, and the controls may not act', async () => {
    const stage = followedAndLive(streamStage({ sessionReading: 'unknown' }));
    stage.latest().emit('error');
    await Promise.resolve();
    expect([stage.client.state(), stage.scheduled[0]?.isCancelled()]).toEqual(['server-ended', false]);
    expect(FleetStreamClient.controlsMayActIn(stage.client.state())).toBe(false);
  });

  test('each reopen that errs while nothing answers stays server-ended, never back to lost between checks', async () => {
    const stage = followedAndLive(streamStage({ sessionReading: 'unknown' }));
    const heard: FleetStreamState[] = [];
    stage.client.subscribe(() => heard.push(stage.client.state()));
    stage.latest().emit('error');
    await Promise.resolve();
    stage.scheduled[0]?.task();
    stage.latest().emit('error');
    await Promise.resolve();
    expect([heard, stage.scheduled.length]).toEqual([['lost', 'server-ended'], 2]);
  });

  test('a server that answers again moves it on: a session it no longer knows reads session-lost, a session it holds reads lost until the reopen', async () => {
    const forgotten = followedAndLive(streamStage({ sessionReading: 'unknown' }));
    forgotten.latest().emit('error');
    await Promise.resolve();
    forgotten.answerSessionChecksWith('lost');
    forgotten.scheduled[0]?.task();
    forgotten.latest().emit('error');
    await Promise.resolve();
    expect(forgotten.client.state()).toBe('session-lost');

    const held = followedAndLive(streamStage({ sessionReading: 'unknown' }));
    held.latest().emit('error');
    await Promise.resolve();
    held.answerSessionChecksWith('held');
    held.scheduled[0]?.task();
    held.latest().emit('error');
    await Promise.resolve();
    expect(held.client.state()).toBe('lost');
    held.scheduled[1]?.task();
    held.latest().emit('open');
    expect(held.client.state()).toBe('live');
  });

  test('a late check that nothing answered changes nothing once the reopened stream is live or the client stopped', async () => {
    const reopened = followedAndLive(streamStage({ sessionReading: 'unknown' }));
    reopened.latest().emit('error');
    reopened.scheduled[0]?.task();
    reopened.latest().emit('open');
    await Promise.resolve();
    expect(reopened.client.state()).toBe('live');

    const stopped = followedAndLive(streamStage({ sessionReading: 'unknown' }));
    stopped.latest().emit('error');
    stopped.client.stop();
    await Promise.resolve();
    expect(stopped.client.state()).toBe('lost');
  });

});

describe('another fleetVersion', () => {
  test('a document of another fleetVersion marks that version, reloads the page once, closes the stream and publishes nothing', () => {
    const stage = followedAndLive(streamStage());
    stage.latest().emit(FleetStreamClient.FLEET_EVENT_NAME, NEWER_FLEET_DOCUMENT_TEXT);
    expect([stage.marks, stage.reloads, stage.published]).toEqual([[NEWER_FLEET_VERSION_MARK], ['reloaded'], []]);
    expect(stage.latest().isClosed()).toBe(true);
    expect(stage.scheduled).toEqual([]);
  });

  test('a document of each older fleetVersion, version 1 and the one before this page\'s, is refused as version 1 is: one reload and nothing published', () => {
    const olderVersions = Array.from({ length: FLEET_FIVE_FORGES.fleetVersion - 1 }, (_unused, i) => i + 1);
    expect(olderVersions).toEqual([1, 2, 3, 4, 5]);
    for (const olderVersion of olderVersions) {
      const stage = followedAndLive(streamStage());
      stage.latest().emit(FleetStreamClient.FLEET_EVENT_NAME, JSON.stringify({ ...FLEET_FIVE_FORGES, fleetVersion: olderVersion }));
      expect([olderVersion, stage.marks, stage.reloads, stage.published, stage.latest().isClosed()]).toEqual([olderVersion, [String(olderVersion)], ['reloaded'], [], true]);
    }
  });

  test('after the reload, the same version again does not reload: the page reads out of date and follows no more', () => {
    const stage = followedAndLive(streamStage({ storedMark: NEWER_FLEET_VERSION_MARK }));
    stage.latest().emit(FleetStreamClient.FLEET_EVENT_NAME, NEWER_FLEET_DOCUMENT_TEXT);
    expect([stage.reloads, stage.client.state(), stage.latest().isClosed()]).toEqual([[], 'page-out-of-date', true]);
    stage.client.follow();
    expect(stage.opened).toHaveLength(1);
  });

  test('a mark the session cannot keep reloads nothing, since nothing would stop the next reload: the page reads out of date', () => {
    const stage = followedAndLive(streamStage({ markCanBeKept: false }));
    stage.latest().emit(FleetStreamClient.FLEET_EVENT_NAME, NEWER_FLEET_DOCUMENT_TEXT);
    expect([stage.reloads, stage.client.state()]).toEqual([[], 'page-out-of-date']);
  });

  test('a document of the known version clears the mark, so a later mismatch reloads once again', () => {
    const stage = followedAndLive(streamStage({ storedMark: NEWER_FLEET_VERSION_MARK }));
    stage.latest().emit(FleetStreamClient.FLEET_EVENT_NAME, FLEET_DOCUMENT_TEXT);
    stage.latest().emit(FleetStreamClient.FLEET_EVENT_NAME, FLEET_DOCUMENT_TEXT);
    expect([stage.marks, stage.published]).toEqual([[null], [FLEET_FIVE_FORGES, FLEET_FIVE_FORGES]]);
    stage.latest().emit(FleetStreamClient.FLEET_EVENT_NAME, NEWER_FLEET_DOCUMENT_TEXT);
    expect(stage.reloads).toEqual(['reloaded']);
  });
});

describe('whether the controls may act', () => {
  test('they may while connecting and live, and may not while the stream is lost, the server ended or the page is out of date', () => {
    const states: FleetStreamState[] = ['connecting', 'live', 'lost', 'server-ended', 'page-out-of-date', 'session-lost'];
    expect(states.map((state) => FleetStreamClient.controlsMayActIn(state))).toEqual([true, true, false, false, false, false]);
  });
});
