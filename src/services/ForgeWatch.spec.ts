/**
 * The forge watch over a registry in the scratch root, recorded and authored Overseer answers, and timers the spec fires by hand. The flow
 * spec walks one forge through every stage PLAN 7.1 names, one answer set per stage: dormant, started, live, stream lost, unreachable and
 * back. Around it: a missing repository, a forge read as counts, another program on the port, a hidden forge, an unchanged registry, look
 * again, and a stop at any moment leaves no timer and no open stream. No spec waits a real interval.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join }                     from 'node:path';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test
} from 'bun:test';

import { RegistryFile }                       from '../adapters/forge-registry/RegistryFile.ts';
import { forgeClientOf }                      from '../lib/forge-client/ForgeClient.ts';
import type { OverseerAnswer, OverseerFetch } from '../lib/forge-client/OverseerFetch.ts';
import type { ForgeReading }                  from '../shared/@types/ForgeReading.ts';
import { manualTimers, type ManualTimers }    from '../testing/ManualTimers.ts';
import {
  recordedOverseerAnswersOf,
  recordedOverseerFetch,
  type OverseerSituation,
  type RecordedOverseerAnswer,
  type RecordedOverseerFetch,
} from '../testing/RecordedAnswers.ts';
import { createScratchDirectory, removeScratchPath } from '../testing/ScratchRoot.ts';
import {
  createForgeWatch,
  realWatchTimers,
  type ForgeWatch,
  type ForgeWatchIntervals,
} from './ForgeWatch.ts';

/** Distinct delays, so the spec fires exactly the timer it means; none is ever waited out. */
const INTERVALS: ForgeWatchIntervals = {
  registryCheckIntervalMilliseconds:   1_000,
  streamReconnectIntervalMilliseconds: 2_000,
  summaryPollIntervalMilliseconds:     3_000,
  unreachableAfterFailedTries:         3,
};
const REGISTRY_CHECK = INTERVALS.registryCheckIntervalMilliseconds;
const RECONNECT = INTERVALS.streamReconnectIntervalMilliseconds;
const SUMMARY_POLL = INTERVALS.summaryPollIntervalMilliseconds;

const SHORT_BOUND_MILLISECONDS = 200;
const EXAMPLE_TOKEN = 'example-token-0123456789abcdef';

/** The forge the authored monitor answers describe, and the one the recorded answers of today's forge came from. */
const STOREFRONT_TRACKER_ID = 'example-storefront-7c41';
const RECORDED_TRACKER_ID = '712f8bdb-e7cf-48bc-86a5-2616d2cf935f';

const STAMPS = {
  live:        '2026-11-12T13:19:22.000Z',
  unreachable: '2026-11-12T13:25:00.000Z',
  back:        '2026-11-12T13:31:40.000Z',
} as const;

function answersOf(situation: OverseerSituation, callShape: string | null = null): readonly RecordedOverseerAnswer[] {
  return recordedOverseerAnswersOf(situation).filter((answer) => callShape === null || answer.callShape === callShape);
}

const STAGE_ANSWERS = {
  dormant:     [],
  started:     answersOf('starting'),
  /** The forge serves every contract; its stream gives one whole snapshot, then the connection breaks. */
  live:        [...answersOf('serving-every-contract', 'GET /api/identity'), ...answersOf('connection-broken')],
  streamLost:  answersOf('stopped'),
  unreachable: answersOf('not-answering'),
  back:        answersOf('serving-every-contract'),
} as const;

/** One recorded answer set per stage of the flow; a stage's streams stay counted after the next stage begins. */
interface StagedOverseerFetch extends OverseerFetch {
  readonly enter:           (answers: readonly RecordedOverseerAnswer[]) => void;
  readonly callShapes:      () => readonly string[];
  readonly streamsLeftOpen: () => number;
}

function stagedOverseerFetch(firstAnswers: readonly RecordedOverseerAnswer[]): StagedOverseerFetch {
  const stages: RecordedOverseerFetch[] = [recordedOverseerFetch(firstAnswers)];
  const currentStage = (): RecordedOverseerFetch => stages[stages.length - 1] ?? recordedOverseerFetch([]);
  return {
    request:         (overseerRequest) => currentStage().request(overseerRequest),
    openStream:      (streamRequest) => currentStage().openStream(streamRequest),
    enter:           (answers) => stages.push(recordedOverseerFetch(answers)),
    callShapes:      () => stages.flatMap((stage) => stage.callsAnswered().map((call) => call.callShape)),
    streamsLeftOpen: () => stages.reduce((total, stage) => total + stage.streamsLeftOpen(), 0),
  };
}

let scratchFolder: string;
let registryPath: string;
let tokenPath: string;
let repositoryRoot: string;
let currentStamp: string;
let watchesToStop: ForgeWatch[];

beforeEach(() => {
  scratchFolder  = createScratchDirectory('forge-watch');
  registryPath   = join(scratchFolder, 'projects.json');
  tokenPath      = join(scratchFolder, 'watchers', 'token');
  repositoryRoot = join(scratchFolder, 'example-storefront');
  currentStamp   = STAMPS.live;
  watchesToStop  = [];
  mkdirSync(repositoryRoot);
  mkdirSync(join(scratchFolder, 'watchers'));
  writeFileSync(tokenPath, `${EXAMPLE_TOKEN}\n`);
});

afterEach(() => {
  for (const watch of watchesToStop) watch.stop();
  removeScratchPath(scratchFolder);
});

interface EntryOptions {
  readonly trackerId?:   string;
  readonly root?:        string;
  readonly hasOverseer?: boolean;
  readonly processId?:   number;
  readonly tokenPath?:   string | null;
}

function registryEntryOf(entryOptions: EntryOptions = {}): Record<string, unknown> {
  const hasOverseer = entryOptions.hasOverseer ?? true;
  return {
    project:  'Example Storefront',
    root:     entryOptions.root ?? repositoryRoot,
    overseer: hasOverseer ? {
      url:       'http://127.0.0.1:4951/',
      processId: entryOptions.processId ?? 48_107,
      startedAt: '2026-11-12T09:12:00.000Z',
      tokenPath: entryOptions.tokenPath === undefined ? tokenPath : entryOptions.tokenPath,
    } : null,
  };
}

function writeRegistry(entries: readonly EntryOptions[]): void {
  const projects = Object.fromEntries(entries.map((entry) => [entry.trackerId ?? STOREFRONT_TRACKER_ID, registryEntryOf(entry)]));
  writeFileSync(registryPath, JSON.stringify({ version: 1, projects }));
}

interface WatchUnderTest {
  readonly watch:         ForgeWatch;
  readonly timers:        ManualTimers;
  /** Settles with the readings once they meet the claim, at once when they already do; the spec's own bound ends a wait that never does. */
  readonly untilReadings: (claim: (readings: readonly ForgeReading[]) => boolean) => Promise<readonly ForgeReading[]>;
  readonly changes:       () => number;
}

function watchOver(overseerFetch: OverseerFetch, hiddenTrackerIds: readonly string[] = []): WatchUnderTest {
  const timers = manualTimers();
  const waiters: { readonly claim: (readings: readonly ForgeReading[]) => boolean; readonly resolve: (readings: readonly ForgeReading[]) => void }[] = [];
  let changes = 0;
  const watch = createForgeWatch({
    readRegistry:      () => new RegistryFile(registryPath).read(),
    forgeClient:       forgeClientOf({ overseerFetch, requestTimeoutMilliseconds: SHORT_BOUND_MILLISECONDS, streamOpenTimeoutMilliseconds: SHORT_BOUND_MILLISECONDS }),
    hiddenTrackerIds:  () => hiddenTrackerIds,
    timers,
    now:               () => currentStamp,
    intervals:         INTERVALS,
    onReadingsChanged: () => {
      changes += 1;
      const readings = watch.readings();
      for (const waiter of waiters.filter((candidate) => candidate.claim(readings))) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(readings);
      }
    },
  });
  watchesToStop.push(watch);

  function untilReadings(claim: (readings: readonly ForgeReading[]) => boolean): Promise<readonly ForgeReading[]> {
    const readings = watch.readings();
    if (claim(readings)) return Promise.resolve(readings);
    return new Promise((resolve) => {
      waiters.push({ claim, resolve });
    });
  }
  return {
    watch, timers, untilReadings, changes: () => changes,
  };
}

function onlyReadingIs(fidelity: ForgeReading['fidelity'], condition: ForgeReading['condition']) {
  return (readings: readonly ForgeReading[]) => readings.length === 1 && readings[0]?.fidelity === fidelity && readings[0].condition === condition;
}

function onlyReadingOf(readings: readonly ForgeReading[]): ForgeReading {
  const [reading] = readings;
  if (readings.length !== 1 || reading === undefined) throw new Error(`Expected one reading, got ${readings.length}.`);
  return reading;
}

describe('a forge through every stage of PLAN 7.1', () => {
  test('reads dormant, starting, live, keeps its reading through a lost stream, reads unreachable, then live again, and stops clean', async () => {
    writeRegistry([{ hasOverseer: false }]);
    const overseerFetch = stagedOverseerFetch(STAGE_ANSWERS.dormant);
    const { watch, timers, untilReadings } = watchOver(overseerFetch);

    watch.start();
    const dormant = onlyReadingOf(await untilReadings(onlyReadingIs('dormant', 'dormant')));
    expect(dormant).toMatchObject({
      trackerId: STOREFRONT_TRACKER_ID, url: null, lastReportedAt: null, attention: [], agents: []
    });
    expect(overseerFetch.callShapes()).toEqual([]);

    overseerFetch.enter(STAGE_ANSWERS.started);
    writeRegistry([{}]);
    timers.fire(REGISTRY_CHECK);
    const starting = onlyReadingOf(await untilReadings(onlyReadingIs('dormant', 'starting')));
    expect(starting.url).toBe('http://127.0.0.1:4951/');
    await timers.untilPending(RECONNECT);

    overseerFetch.enter(STAGE_ANSWERS.live);
    timers.fire(RECONNECT);
    const live = onlyReadingOf(await untilReadings(onlyReadingIs('full', 'live')));
    expect(live).toMatchObject({ project: 'Example Storefront', lastReportedAt: STAMPS.live, url: 'http://127.0.0.1:4951' });
    expect(live.agents.length).toBeGreaterThan(0);
    expect(live.attention.length).toBeGreaterThan(0);
    await timers.untilPending(RECONNECT);

    overseerFetch.enter(STAGE_ANSWERS.streamLost);
    for (let i = 1; i < INTERVALS.unreachableAfterFailedTries; i += 1) {
      timers.fire(RECONNECT);
      await timers.untilPending(RECONNECT);
      expect(watch.readings()).toEqual([live]);
    }

    overseerFetch.enter(STAGE_ANSWERS.unreachable);
    currentStamp = STAMPS.unreachable;
    timers.fire(RECONNECT);
    const unreachable = onlyReadingOf(await untilReadings(onlyReadingIs('unreachable', 'unreachable')));
    expect(unreachable).toEqual({ ...live, fidelity: 'unreachable', condition: 'unreachable' });
    await timers.untilPending(RECONNECT);

    overseerFetch.enter(STAGE_ANSWERS.back);
    currentStamp = STAMPS.back;
    timers.fire(RECONNECT);
    const back = onlyReadingOf(await untilReadings(onlyReadingIs('full', 'live')));
    expect(back.lastReportedAt).toBe(STAMPS.back);
    expect(overseerFetch.callShapes()).toEqual([
      'GET /api/identity',
      'GET /api/identity',
      'STREAM /api/monitor/events with bearer',
      'GET /api/identity',
      'GET /api/identity',
      'GET /api/identity',
      'GET /api/identity',
      'STREAM /api/monitor/events with bearer',
    ]);
    expect(overseerFetch.streamsLeftOpen()).toBe(1);

    watch.stop();
    expect(timers.pendingDelays()).toEqual([]);
    expect(overseerFetch.streamsLeftOpen()).toBe(0);
  });

  test('keeps what the forge last reported in this run when it stops, without its address, jobs or what waits', async () => {
    writeRegistry([{}]);
    const overseerFetch = stagedOverseerFetch(STAGE_ANSWERS.back);
    const { watch, timers, untilReadings } = watchOver(overseerFetch);
    watch.start();
    const live = onlyReadingOf(await untilReadings(onlyReadingIs('full', 'live')));

    overseerFetch.enter(STAGE_ANSWERS.dormant);
    writeRegistry([{ hasOverseer: false }]);
    timers.fire(REGISTRY_CHECK);
    const dormant = onlyReadingOf(await untilReadings(onlyReadingIs('dormant', 'dormant')));

    expect(dormant).toMatchObject({
      contracts:        live.contracts,
      codeVersion:      live.codeVersion,
      lastReportedAt:   STAMPS.live,
      readyTicketCount: live.readyTicketCount,
      activity:         live.activity,
      url:              null,
      processId:        null,
      attention:        [],
      agents:           [],
      today:            null,
    });
    expect(overseerFetch.streamsLeftOpen()).toBe(0);
    expect(timers.pendingDelays()).toEqual([REGISTRY_CHECK]);
  });
});

describe('a forge without a live Overseer', () => {
  test('reads repository-missing when its root is no folder, and no Overseer is asked', async () => {
    writeRegistry([{ hasOverseer: false, root: join(scratchFolder, 'gone') }]);
    const overseerFetch = stagedOverseerFetch([]);
    const { watch, untilReadings } = watchOver(overseerFetch);
    watch.start();

    const missing = onlyReadingOf(await untilReadings(onlyReadingIs('repository-missing', 'missing')));
    expect(missing.root).toBe(join(scratchFolder, 'gone'));
    expect(overseerFetch.callShapes()).toEqual([]);
  });
});

describe('a forge read through its summary', () => {
  test('reads counts only from a forge that names no contracts, and reads it again on the summary interval', async () => {
    writeRegistry([{ trackerId: RECORDED_TRACKER_ID, tokenPath: null }]);
    const overseerFetch = stagedOverseerFetch(answersOf('serving'));
    const { watch, timers, untilReadings } = watchOver(overseerFetch);
    watch.start();

    const countsOnly = onlyReadingOf(await untilReadings(onlyReadingIs('counts-only', 'paused')));
    expect(countsOnly.lastReportedAt).toBe(STAMPS.live);
    await timers.untilPending(SUMMARY_POLL);

    currentStamp = STAMPS.back;
    timers.fire(SUMMARY_POLL);
    await untilReadings((readings) => readings[0]?.lastReportedAt === STAMPS.back);
    expect(overseerFetch.callShapes()).toEqual(['GET /api/identity', 'GET /api/summary', 'GET /api/identity', 'GET /api/summary']);
  });

  test('reads a forge that serves the monitor but names no token file through its open summary', async () => {
    writeRegistry([{ tokenPath: null }]);
    const overseerFetch = stagedOverseerFetch([...answersOf('serving-every-contract', 'GET /api/identity'), ...answersOf('serving', 'GET /api/summary')]);
    const { watch, untilReadings } = watchOver(overseerFetch);
    watch.start();

    await untilReadings(onlyReadingIs('counts-only', 'paused'));
    expect(overseerFetch.callShapes()).toEqual(['GET /api/identity', 'GET /api/summary']);
  });
});

describe('a forge that cannot be read', () => {
  test('reads unreachable at once when another program answers on its port, and is tried again on the reconnect interval', async () => {
    writeRegistry([{}]);
    const overseerFetch = stagedOverseerFetch(answersOf('port-held-by-another-program'));
    const { watch, timers, untilReadings } = watchOver(overseerFetch);
    watch.start();

    const unreachable = onlyReadingOf(await untilReadings(onlyReadingIs('unreachable', 'unreachable')));
    expect(unreachable).toMatchObject({
      lastReportedAt: null, url: 'http://127.0.0.1:4951/', processId: 48_107, agents: []
    });
    await timers.untilPending(RECONNECT);
    timers.fire(RECONNECT);
    await timers.untilPending(RECONNECT);
    expect(overseerFetch.callShapes()).toEqual(['GET /api/identity', 'GET /api/identity']);
  });

  test('counts a stream whose token is refused as a failed try', async () => {
    writeRegistry([{}]);
    const tokenRejectedStream = answersOf('token-rejected', 'STREAM /api/monitor/events with bearer');
    const overseerFetch       = stagedOverseerFetch([...answersOf('serving-every-contract', 'GET /api/identity'), ...tokenRejectedStream]);
    const { watch, timers, untilReadings } = watchOver(overseerFetch);
    watch.start();

    await untilReadings(onlyReadingIs('unreachable', 'unreachable'));
    await timers.untilPending(RECONNECT);
    expect(overseerFetch.streamsLeftOpen()).toBe(0);
  });

  test('looks again at once on request, without waiting for the reconnect interval', async () => {
    writeRegistry([{}]);
    const overseerFetch = stagedOverseerFetch(answersOf('stopped'));
    const { watch, timers, untilReadings } = watchOver(overseerFetch);
    watch.start();
    await untilReadings(onlyReadingIs('unreachable', 'unreachable'));

    overseerFetch.enter(STAGE_ANSWERS.back);
    await watch.lookAgain();
    await untilReadings(onlyReadingIs('full', 'live'));
    expect(timers.pendingDelays()).toEqual([REGISTRY_CHECK]);
  });
});

describe('the registry', () => {
  test('asks no forge again while the registry\'s content stays the same', async () => {
    writeRegistry([{}]);
    const overseerFetch = stagedOverseerFetch(STAGE_ANSWERS.back);
    const { watch, timers, untilReadings } = watchOver(overseerFetch);
    watch.start();
    await untilReadings(onlyReadingIs('full', 'live'));
    await timers.untilPending(REGISTRY_CHECK);

    writeRegistry([{}]);
    timers.fire(REGISTRY_CHECK);
    await timers.untilPending(REGISTRY_CHECK);
    expect(overseerFetch.callShapes()).toEqual(['GET /api/identity', 'STREAM /api/monitor/events with bearer']);
    expect(overseerFetch.streamsLeftOpen()).toBe(1);
  });

  test('identifies a forge again when its entry changes, as after an Overseer\'s restart', async () => {
    writeRegistry([{}]);
    const overseerFetch = stagedOverseerFetch(STAGE_ANSWERS.back);
    const { watch, timers, untilReadings } = watchOver(overseerFetch);
    watch.start();
    await untilReadings(onlyReadingIs('full', 'live'));
    await timers.untilPending(REGISTRY_CHECK);

    overseerFetch.enter(STAGE_ANSWERS.back);
    currentStamp = STAMPS.back;
    writeRegistry([{ processId: 48_200 }]);
    timers.fire(REGISTRY_CHECK);
    await untilReadings((readings) => readings[0]?.lastReportedAt === STAMPS.back);
    expect(overseerFetch.streamsLeftOpen()).toBe(1);
  });

  test('neither watches nor reads a hidden forge', async () => {
    writeRegistry([{}, { trackerId: 'example-hidden-forge', hasOverseer: false }]);
    const overseerFetch = stagedOverseerFetch(STAGE_ANSWERS.back);
    const { watch, timers, untilReadings } = watchOver(overseerFetch, ['example-hidden-forge']);
    watch.start();

    const readings = await untilReadings(onlyReadingIs('full', 'live'));
    await timers.untilPending(REGISTRY_CHECK);
    expect(readings.map((reading) => reading.trackerId)).toEqual([STOREFRONT_TRACKER_ID]);
  });

  test('stops watching a forge that leaves the registry, closing its stream', async () => {
    writeRegistry([{}]);
    const overseerFetch = stagedOverseerFetch(STAGE_ANSWERS.back);
    const { watch, timers, untilReadings } = watchOver(overseerFetch);
    watch.start();
    await untilReadings(onlyReadingIs('full', 'live'));
    await timers.untilPending(REGISTRY_CHECK);

    writeRegistry([]);
    timers.fire(REGISTRY_CHECK);
    await untilReadings((readings) => readings.length === 0);
    expect(overseerFetch.streamsLeftOpen()).toBe(0);
  });

  test('reads no forge from an absent registry', async () => {
    const overseerFetch = stagedOverseerFetch([]);
    const { watch, timers } = watchOver(overseerFetch);
    watch.start();

    await timers.untilPending(REGISTRY_CHECK);
    expect(watch.readings()).toEqual([]);
    expect(overseerFetch.callShapes()).toEqual([]);
  });
});

describe('a stopped watch', () => {
  test('opens no stream and starts no timer when an answer arrives after the stop', async () => {
    writeRegistry([{}]);
    const inner = stagedOverseerFetch(STAGE_ANSWERS.back);
    let releaseIdentity: () => void = () => undefined;
    // The held answer travels in a record: a promise settled with a promise would wait for it.
    let identityWasAsked: (held: { readonly answer: Promise<OverseerAnswer> }) => void = () => undefined;
    const identityAsked = new Promise<{ readonly answer: Promise<OverseerAnswer> }>((resolve) => {
      identityWasAsked = resolve;
    });
    const heldFetch: OverseerFetch = {
      request: (overseerRequest) => {
        const answer = new Promise<void>((resolve) => {
          releaseIdentity = resolve;
        }).then(() => inner.request(overseerRequest));
        identityWasAsked({ answer });
        return answer;
      },
      openStream: inner.openStream,
    };
    const { watch, timers } = watchOver(heldFetch);
    watch.start();
    const held = await identityAsked;

    watch.stop();
    releaseIdentity();
    await held.answer;
    // The watch takes the answer in the microtasks that follow it; the next turn of the event loop sees what it did with it.
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    expect(timers.pendingDelays()).toEqual([]);
    expect(inner.callShapes()).toEqual(['GET /api/identity']);
    expect(inner.streamsLeftOpen()).toBe(0);
    expect(watch.readings()).toEqual([]);
  });
});

describe('the real timers', () => {
  test('call back after their delay, and a cancelled one never does', async () => {
    const timers = realWatchTimers();
    let cancelledFired = false;
    timers.start(() => {
      cancelledFired = true;
    }, 0).cancel();
    await new Promise<void>((resolve) => {
      timers.start(resolve, 0);
    });
    expect(cancelledFired).toBe(false);
  });
});
