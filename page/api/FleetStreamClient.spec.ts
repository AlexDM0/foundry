/**
 * The fleet stream client. What matters (W4.3; SCREENS "The shell", the connection banner): each `fleet` event's document is published;
 * a stream that errs reads `lost` at once, is closed, and is opened again only when its reopen is due, read `lost` until it opens; a
 * stopped client leaves no stream and no reopen; data that is no fleet document is dropped; a document of another `fleetVersion`, newer or
 * older, reloads the page once, and never twice for the same version, so a page that stays out of date says so rather than reload without
 * end.
 *
 * The browser's `EventSource` is stood in for by a source the spec opens, errs and feeds the events Gaia's server sends (PLAN 8.1: `fleet`
 * events and a heartbeat); the reopen is a schedule the spec runs, so no spec waits the interval.
 */
import { describe, expect, test } from 'bun:test';

import type { FleetDocument }     from '../@types/FleetDocument.ts';
import { FLEET_FIVE_FORGES }      from '../testing/fixtures/fleet-five-forges.ts';
import {
  type FleetEventSource,
  FleetStreamClient,
  type FleetStreamState,
  type FleetStreamSurroundings,
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
  readonly client:    ReturnType<typeof FleetStreamClient.create>;
  readonly published: FleetDocument[];
  readonly opened:    StandInSource[];
  readonly scheduled: ScheduledTask[];
  readonly reloads:   string[];
  readonly marks:     (string | null)[];
  /** The source opened last; the spec fails when none was. */
  readonly latest:    () => StandInSource;
}

function streamStage(options: { readonly storedMark?: string | null; readonly markCanBeKept?: boolean } = {}): StreamStage {
  const published: FleetDocument[] = [];
  const opened: StandInSource[] = [];
  const scheduled: ScheduledTask[] = [];
  const reloads: string[] = [];
  let storedMark = options.storedMark ?? null;
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
    reloadPage: () => reloads.push('reloaded'),
    reloadMark: {
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
  test('it opens /api/events, reads connecting until the stream opens and live from then, and publishes each fleet document', () => {
    const stage = streamStage();
    stage.client.follow();
    expect(stage.opened.map((source) => source.path)).toEqual([FleetStreamClient.EVENTS_PATH]);
    expect(stage.client.state()).toBe('connecting');
    stage.latest().emit('open');
    expect(stage.client.state()).toBe('live');
    stage.latest().emit(FleetStreamClient.FLEET_EVENT_NAME, FLEET_DOCUMENT_TEXT);
    stage.latest().emit('heartbeat', '');
    expect(stage.published).toEqual([FLEET_FIVE_FORGES]);
  });

  test('following twice opens one stream', () => {
    const stage = followedAndLive(streamStage());
    stage.client.follow();
    expect(stage.opened).toHaveLength(1);
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
    expect(olderVersions).toEqual([1, 2]);
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
  test('they may while connecting and live, and may not while the stream is lost or the page is out of date', () => {
    const states: FleetStreamState[] = ['connecting', 'live', 'lost', 'page-out-of-date'];
    expect(states.map((state) => FleetStreamClient.controlsMayActIn(state))).toEqual([true, true, false, false]);
  });
});
