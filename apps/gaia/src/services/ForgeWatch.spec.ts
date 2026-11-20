/**
 * The forge watch over a registry in the scratch root, recorded Overseer answers, and timers the spec fires by hand. The flow
 * spec walks one forge through every stage PLAN 7.1 names, one answer set per stage: dormant, started, live, stream lost, unreachable and
 * back. Around it: a missing repository, a forge read as counts, another program or another forge on the port, an open stream of snapshots
 * Gaia cannot read, a hidden forge, an unchanged registry, look again, a readings listener that throws, and a stop at any moment leaves no
 * timer and no open stream. Every round asks the forge's versions first: each of the four verdicts follows from what a forge answers there,
 * a forge that serves no versions is older, a forge Gaia can talk to is read at the versioned paths, one Gaia cannot talk to is asked
 * nothing more, and an answer that is no versions document is a failed try. No spec waits a real interval.
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

import type { SystemVersion } from 'system-versions/VersionsDocument';

import { RegistryFile }                       from '../adapters/forge-registry/RegistryFile.ts';
import { forgeClientOf }                      from '../lib/forge-client/ForgeClient.ts';
import type { OverseerAnswer, OverseerFetch } from '../lib/forge-client/OverseerFetch.ts';
import { SUPPORTED_FORGE_VERSION }            from '../lib/forge-client/constants/SupportedForgeVersions.ts';
import type { ForgeReading }                  from '../shared/@types/ForgeReading.ts';
import { ForgeVersionsUtil }                  from '../shared/utils/ForgeVersionsUtil.ts';
import { manualTimers, type ManualTimers }    from '../testing/ManualTimers.ts';
import {
  recordedOverseerAnswersOf,
  recordedOverseerFetch,
  recordedVersionsAnswersOf,
  type OverseerSituation,
  type RecordedOverseerAnswer,
  type RecordedOverseerFetch,
} from '../testing/RecordedAnswers.ts';
import { createScratchDirectory, removeScratchPath }                   from '../testing/ScratchRoot.ts';
import { createForgeWatch, type ForgeWatch, type ForgeWatchIntervals } from './ForgeWatch.ts';

/** Distinct delays, so the spec fires exactly the timer it means; none is ever waited out. */
const INTERVALS: ForgeWatchIntervals = {
  registryCheckIntervalMilliseconds:   1_000,
  streamReconnectIntervalMilliseconds: 2_000,
  summaryPollIntervalMilliseconds:     3_000,
  unreachableAfterFailedTries:         3,
};
const REGISTRY_CHECK_MILLISECONDS = INTERVALS.registryCheckIntervalMilliseconds;
const RECONNECT_MILLISECONDS = INTERVALS.streamReconnectIntervalMilliseconds;
const SUMMARY_POLL_MILLISECONDS = INTERVALS.summaryPollIntervalMilliseconds;

const SHORT_BOUND_MILLISECONDS = 200;
const EXAMPLE_TOKEN = 'example-token-0123456789abcdef';

/** The forge the answers of a forge serving every contract were recorded as, and the one the answers of a forge before F1 came from. */
const STOREFRONT_TRACKER_ID = 'example-storefront-7c41';
/** The limit the recorded serving stream's second snapshot reports. */
const RAISED_CONCURRENCY_LIMIT = 3;
const RECORDED_TRACKER_ID = '712f8bdb-e7cf-48bc-86a5-2616d2cf935f';

const STAMPS = {
  live:        '2026-11-12T13:19:22.000Z',
  unreachable: '2026-11-12T13:25:00.000Z',
  back:        '2026-11-12T13:31:40.000Z',
} as const;

function answersOf(situation: OverseerSituation, callShape: string | null = null): readonly RecordedOverseerAnswer[] {
  return recordedOverseerAnswersOf(situation).filter((answer) => callShape === null || answer.callShape === callShape);
}

/** What a watch asks a forge before anything else: its versions, then its identity. */
function identityAnswersOf(situation: OverseerSituation): readonly RecordedOverseerAnswer[] {
  return [...answersOf(situation, 'GET /api/versions'), ...answersOf(situation, 'GET /api/v1/identity')];
}

/** The program's unreadable snapshots on a stream held open after them, as a forge holds its stream open between heartbeats. */
const UNREADABLE_SNAPSHOTS_HELD_OPEN: readonly RecordedOverseerAnswer[] = answersOf('snapshot-unreadable', 'STREAM /api/v2/monitor/events with bearer')
  .map((recorded) => (recorded.answer.verdict === 'streaming' ? { ...recorded, answer: { ...recorded.answer, ending: 'stays-open' as const } } : recorded));

const STAGE_ANSWERS = {
  dormant:     [],
  started:     answersOf('starting'),
  /** The forge serves every contract; its stream gives one whole snapshot, then the connection breaks. */
  live:        [...identityAnswersOf('serving-every-contract'), ...answersOf('connection-broken')],
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
  tokenPath      = join(scratchFolder, 'private', 'token');
  repositoryRoot = join(scratchFolder, 'example-storefront');
  currentStamp   = STAMPS.live;
  watchesToStop  = [];
  mkdirSync(repositoryRoot);
  mkdirSync(join(scratchFolder, 'private'));
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
  readonly lastCommand?: string;
}

/** When every entry the spec writes was last changed by its forge. */
const LAST_CHANGED_AT = '2026-11-12T13:19:20.000Z';

function registryEntryOf(entryOptions: EntryOptions = {}): Record<string, unknown> {
  const hasOverseer = entryOptions.hasOverseer ?? true;
  return {
    project:       'Example Storefront',
    root:          entryOptions.root ?? repositoryRoot,
    lastChangedAt: LAST_CHANGED_AT,
    lastCommand:   entryOptions.lastCommand ?? 'oversee',
    overseer:      hasOverseer ? {
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

/** `throwingListenerCalls`: the calls of the readings listener, counted from one, that throw once the waiters have heard them. */
function watchOver(
  overseerFetch: OverseerFetch,
  hiddenTrackerIds: readonly string[] = [],
  throwingListenerCalls: ReadonlySet<number> = new Set(),
  supportedForgeVersion: SystemVersion | null = null,
): WatchUnderTest {
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
    ...supportedForgeVersion === null ? {} : { supportedForgeVersion },
    onReadingsChanged: () => {
      changes += 1;
      const readings = watch.readings();
      for (const waiter of waiters.filter((candidate) => candidate.claim(readings))) {
        waiters.splice(waiters.indexOf(waiter), 1);
        waiter.resolve(readings);
      }
      if (throwingListenerCalls.has(changes)) throw new Error(`The readings listener failed on call ${changes}.`);
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
    timers.fire(REGISTRY_CHECK_MILLISECONDS);
    const starting = onlyReadingOf(await untilReadings(onlyReadingIs('dormant', 'starting')));
    expect(starting.url).toBe('http://127.0.0.1:4951/');
    await timers.untilPending(RECONNECT_MILLISECONDS);

    overseerFetch.enter(STAGE_ANSWERS.live);
    timers.fire(RECONNECT_MILLISECONDS);
    const live = onlyReadingOf(await untilReadings(onlyReadingIs('full', 'live')));
    expect(live).toMatchObject({ project: 'Example Storefront', lastReportedAt: STAMPS.live, url: 'http://127.0.0.1:4951/' });
    expect(live.agents.length).toBeGreaterThan(0);
    expect(live.attention.length).toBeGreaterThan(0);
    await timers.untilPending(RECONNECT_MILLISECONDS);

    overseerFetch.enter(STAGE_ANSWERS.streamLost);
    for (let i = 1; i < INTERVALS.unreachableAfterFailedTries; i += 1) {
      timers.fire(RECONNECT_MILLISECONDS);
      await timers.untilPending(RECONNECT_MILLISECONDS);
      expect(watch.readings()).toEqual([live]);
    }

    overseerFetch.enter(STAGE_ANSWERS.unreachable);
    currentStamp = STAMPS.unreachable;
    timers.fire(RECONNECT_MILLISECONDS);
    const unreachable = onlyReadingOf(await untilReadings(onlyReadingIs('unreachable', 'unreachable')));
    expect(unreachable).toEqual({ ...live, fidelity: 'unreachable', condition: 'unreachable' });
    await timers.untilPending(RECONNECT_MILLISECONDS);

    overseerFetch.enter(STAGE_ANSWERS.back);
    currentStamp = STAMPS.back;
    timers.fire(RECONNECT_MILLISECONDS);
    const back = onlyReadingOf(await untilReadings(onlyReadingIs('full', 'live')));
    expect(back.lastReportedAt).toBe(STAMPS.back);
    // An Overseer that does not answer its versions is a failed try before its identity is asked.
    expect(overseerFetch.callShapes()).toEqual([
      'GET /api/versions',
      'GET /api/v1/identity',
      'GET /api/versions',
      'GET /api/v1/identity',
      'STREAM /api/v2/monitor/events with bearer',
      'GET /api/versions',
      'GET /api/versions',
      'GET /api/versions',
      'GET /api/versions',
      'GET /api/v1/identity',
      'STREAM /api/v2/monitor/events with bearer',
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
    // The recorded stream's second snapshot is the last the forge reported, after a command raised its limit.
    const live = onlyReadingOf(await untilReadings((readings) => onlyReadingIs('full', 'live')(readings) && readings[0]?.concurrency?.limit === RAISED_CONCURRENCY_LIMIT));

    overseerFetch.enter(STAGE_ANSWERS.dormant);
    writeRegistry([{ hasOverseer: false }]);
    timers.fire(REGISTRY_CHECK_MILLISECONDS);
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
    expect(timers.pendingDelays()).toEqual([REGISTRY_CHECK_MILLISECONDS]);
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
  test('reads counts only from a forge whose entry names no token file, and reads it again on the summary interval', async () => {
    writeRegistry([{ trackerId: RECORDED_TRACKER_ID, tokenPath: null }]);
    const overseerFetch = stagedOverseerFetch(answersOf('serving'));
    const { watch, timers, untilReadings } = watchOver(overseerFetch);
    watch.start();

    const countsOnly = onlyReadingOf(await untilReadings(onlyReadingIs('counts-only', 'paused')));
    expect(countsOnly.lastReportedAt).toBe(STAMPS.live);
    await timers.untilPending(SUMMARY_POLL_MILLISECONDS);

    currentStamp = STAMPS.back;
    timers.fire(SUMMARY_POLL_MILLISECONDS);
    await untilReadings((readings) => readings[0]?.lastReportedAt === STAMPS.back);
    const oneRound = ['GET /api/versions', 'GET /api/v1/identity', 'GET /api/v1/summary'];
    expect(overseerFetch.callShapes()).toEqual([...oneRound, ...oneRound]);
  });

  test('reads a forge that serves the monitor but names no token file through its open summary', async () => {
    writeRegistry([{ tokenPath: null }]);
    const overseerFetch = stagedOverseerFetch([...identityAnswersOf('serving-every-contract'), ...answersOf('serving', 'GET /api/v1/summary')]);
    const { watch, untilReadings } = watchOver(overseerFetch);
    watch.start();

    await untilReadings(onlyReadingIs('counts-only', 'paused'));
    expect(overseerFetch.callShapes()).toEqual(['GET /api/versions', 'GET /api/v1/identity', 'GET /api/v1/summary']);
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
    await timers.untilPending(RECONNECT_MILLISECONDS);
    timers.fire(RECONNECT_MILLISECONDS);
    await timers.untilPending(RECONNECT_MILLISECONDS);
    expect(overseerFetch.callShapes()).toEqual(['GET /api/versions', 'GET /api/versions']);
  });

  test('reads unreachable when another forge answers at the address its registry entry names, and opens no stream', async () => {
    writeRegistry([{}]);
    const overseerFetch = stagedOverseerFetch(identityAnswersOf('serving'));
    const { watch, timers, untilReadings } = watchOver(overseerFetch);
    watch.start();

    const unreachable = onlyReadingOf(await untilReadings(onlyReadingIs('unreachable', 'unreachable')));
    expect(unreachable.trackerId).toBe(STOREFRONT_TRACKER_ID);
    await timers.untilPending(RECONNECT_MILLISECONDS);
    expect(overseerFetch.callShapes()).toEqual(['GET /api/versions', 'GET /api/v1/identity']);
  });

  test('reads unreachable and closes the stream when an open stream sends only snapshots it cannot read', async () => {
    writeRegistry([{}]);
    const overseerFetch = stagedOverseerFetch([...identityAnswersOf('serving-every-contract'), ...UNREADABLE_SNAPSHOTS_HELD_OPEN]);
    const { watch, timers, untilReadings } = watchOver(overseerFetch);
    watch.start();

    await untilReadings(onlyReadingIs('unreachable', 'unreachable'));
    await timers.untilPending(RECONNECT_MILLISECONDS);
    expect(overseerFetch.streamsLeftOpen()).toBe(0);
  });

  test('counts a stream whose token is refused as a failed try', async () => {
    writeRegistry([{}]);
    const tokenRejectedStream = answersOf('token-rejected', 'STREAM /api/v2/monitor/events with bearer');
    const overseerFetch       = stagedOverseerFetch([...identityAnswersOf('serving-every-contract'), ...tokenRejectedStream]);
    const { watch, timers, untilReadings } = watchOver(overseerFetch);
    watch.start();

    await untilReadings(onlyReadingIs('unreachable', 'unreachable'));
    await timers.untilPending(RECONNECT_MILLISECONDS);
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
    expect(timers.pendingDelays()).toEqual([REGISTRY_CHECK_MILLISECONDS]);
  });
});

describe('the registry', () => {
  test('asks no forge again while the registry\'s content stays the same', async () => {
    writeRegistry([{}]);
    const overseerFetch = stagedOverseerFetch(STAGE_ANSWERS.back);
    const { watch, timers, untilReadings } = watchOver(overseerFetch);
    watch.start();
    await untilReadings(onlyReadingIs('full', 'live'));
    await timers.untilPending(REGISTRY_CHECK_MILLISECONDS);

    writeRegistry([{}]);
    timers.fire(REGISTRY_CHECK_MILLISECONDS);
    await timers.untilPending(REGISTRY_CHECK_MILLISECONDS);
    expect(overseerFetch.callShapes()).toEqual(['GET /api/versions', 'GET /api/v1/identity', 'STREAM /api/v2/monitor/events with bearer']);
    expect(overseerFetch.streamsLeftOpen()).toBe(1);
  });

  test('shows the last command the entry names, and a new one without asking the forge again or closing its stream', async () => {
    writeRegistry([{}]);
    const overseerFetch = stagedOverseerFetch(STAGE_ANSWERS.back);
    const { watch, timers, untilReadings } = watchOver(overseerFetch);
    watch.start();
    const live = onlyReadingOf(await untilReadings(onlyReadingIs('full', 'live')));
    expect(live).toMatchObject({ lastCommand: 'oversee', lastChangedAt: LAST_CHANGED_AT });
    await timers.untilPending(REGISTRY_CHECK_MILLISECONDS);

    writeRegistry([{ lastCommand: 'ticket ready' }]);
    timers.fire(REGISTRY_CHECK_MILLISECONDS);
    await untilReadings((readings) => readings[0]?.lastCommand === 'ticket ready');
    expect(overseerFetch.callShapes()).toEqual(['GET /api/versions', 'GET /api/v1/identity', 'STREAM /api/v2/monitor/events with bearer']);
    expect(overseerFetch.streamsLeftOpen()).toBe(1);
  });

  test('identifies a forge again when its entry changes, as after an Overseer\'s restart', async () => {
    writeRegistry([{}]);
    const overseerFetch = stagedOverseerFetch(STAGE_ANSWERS.back);
    const { watch, timers, untilReadings } = watchOver(overseerFetch);
    watch.start();
    await untilReadings(onlyReadingIs('full', 'live'));
    await timers.untilPending(REGISTRY_CHECK_MILLISECONDS);

    overseerFetch.enter(STAGE_ANSWERS.back);
    currentStamp = STAMPS.back;
    writeRegistry([{ processId: 48_200 }]);
    timers.fire(REGISTRY_CHECK_MILLISECONDS);
    await untilReadings((readings) => readings[0]?.lastReportedAt === STAMPS.back);
    expect(overseerFetch.streamsLeftOpen()).toBe(1);
  });

  test('neither watches nor reads a hidden forge', async () => {
    writeRegistry([{}, { trackerId: 'example-hidden-forge', hasOverseer: false }]);
    const overseerFetch = stagedOverseerFetch(STAGE_ANSWERS.back);
    const { watch, timers, untilReadings } = watchOver(overseerFetch, ['example-hidden-forge']);
    watch.start();

    const readings = await untilReadings(onlyReadingIs('full', 'live'));
    await timers.untilPending(REGISTRY_CHECK_MILLISECONDS);
    expect(readings.map((reading) => reading.trackerId)).toEqual([STOREFRONT_TRACKER_ID]);
    expect(watch.watchedForgeCount()).toBe(1);
  });

  test('counts a forge it watches while the forge is still being identified for the first time', async () => {
    writeRegistry([{}]);
    const recordedFetch = stagedOverseerFetch(STAGE_ANSWERS.back);
    let firstRequestWasAsked: () => void = () => undefined;
    const firstRequestAsked = new Promise<void>((resolve) => {
      firstRequestWasAsked = resolve;
    });
    const unansweredFetch: OverseerFetch = {
      request: () => {
        firstRequestWasAsked();
        return new Promise<OverseerAnswer>(() => undefined);
      },
      openStream: recordedFetch.openStream,
    };
    const { watch } = watchOver(unansweredFetch);
    watch.start();

    await firstRequestAsked;
    expect(watch.readings()).toEqual([]);
    expect(watch.watchedForgeCount()).toBe(1);
  });

  test('stops watching a forge that leaves the registry, closing its stream', async () => {
    writeRegistry([{}]);
    const overseerFetch = stagedOverseerFetch(STAGE_ANSWERS.back);
    const { watch, timers, untilReadings } = watchOver(overseerFetch);
    watch.start();
    await untilReadings(onlyReadingIs('full', 'live'));
    await timers.untilPending(REGISTRY_CHECK_MILLISECONDS);

    writeRegistry([]);
    timers.fire(REGISTRY_CHECK_MILLISECONDS);
    await untilReadings((readings) => readings.length === 0);
    expect(overseerFetch.streamsLeftOpen()).toBe(0);
  });

  test('reads no forge from an absent registry', async () => {
    const overseerFetch = stagedOverseerFetch([]);
    const { watch, timers } = watchOver(overseerFetch);
    watch.start();

    await timers.untilPending(REGISTRY_CHECK_MILLISECONDS);
    expect(watch.readings()).toEqual([]);
    expect(watch.watchedForgeCount()).toBe(0);
    expect(overseerFetch.callShapes()).toEqual([]);
  });
});

describe('a readings listener that throws', () => {
  test('leaves the registry checked again on its interval when it throws as the registry is applied', async () => {
    writeRegistry([{}]);
    const overseerFetch = stagedOverseerFetch(answersOf('port-held-by-another-program'));
    const { watch, timers, untilReadings } = watchOver(overseerFetch, [], new Set([1]));
    watch.start();

    await untilReadings(onlyReadingIs('unreachable', 'unreachable'));
    await timers.untilPending(REGISTRY_CHECK_MILLISECONDS);
  });

  test('counts a round it throws in as a failed try, and the forge is tried again on the reconnect interval', async () => {
    writeRegistry([{}]);
    const overseerFetch = stagedOverseerFetch(answersOf('port-held-by-another-program'));
    const { watch, timers, untilReadings } = watchOver(overseerFetch, [], new Set([2]));
    watch.start();

    await untilReadings(onlyReadingIs('unreachable', 'unreachable'));
    await timers.untilPending(RECONNECT_MILLISECONDS);
    timers.fire(RECONNECT_MILLISECONDS);
    await timers.untilPending(RECONNECT_MILLISECONDS);
    expect(overseerFetch.callShapes()).toEqual(['GET /api/versions', 'GET /api/versions']);
  });
});

describe('a stopped watch', () => {
  test('opens no stream and starts no timer when an answer arrives after the stop', async () => {
    writeRegistry([{}]);
    const recordedFetch = stagedOverseerFetch(STAGE_ANSWERS.back);
    let releaseFirstAnswer: () => void = () => undefined;
    // The held answer travels in a record: a promise settled with a promise would wait for it.
    let firstRequestWasAsked: (held: { readonly answer: Promise<OverseerAnswer> }) => void = () => undefined;
    const firstRequestAsked = new Promise<{ readonly answer: Promise<OverseerAnswer> }>((resolve) => {
      firstRequestWasAsked = resolve;
    });
    const heldFetch: OverseerFetch = {
      request: (overseerRequest) => {
        const answer = new Promise<void>((resolve) => {
          releaseFirstAnswer = resolve;
        }).then(() => recordedFetch.request(overseerRequest));
        firstRequestWasAsked({ answer });
        return answer;
      },
      openStream: recordedFetch.openStream,
    };
    const { watch, timers } = watchOver(heldFetch);
    watch.start();
    const held = await firstRequestAsked;

    watch.stop();
    releaseFirstAnswer();
    await held.answer;
    // The watch takes the answer in the microtasks that follow it; the next turn of the event loop sees what it did with it.
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
    expect(timers.pendingDelays()).toEqual([]);
    expect(recordedFetch.callShapes()).toEqual(['GET /api/versions']);
    expect(recordedFetch.streamsLeftOpen()).toBe(0);
    expect(watch.readings()).toEqual([]);
  });
});

describe('a forge\'s system version', () => {
  /** The version the ahead forge was recorded at: one minor past the one this Gaia supports. */
  const ONE_MINOR_AHEAD: SystemVersion = { major: SUPPORTED_FORGE_VERSION.major, minor: SUPPORTED_FORGE_VERSION.minor + 1 };
  const VERSIONED_PATHS_ASKED = ['GET /api/versions', 'GET /api/v1/identity', 'STREAM /api/v2/monitor/events with bearer'];

  async function onlyReadingOfAnswers(answers: readonly RecordedOverseerAnswer[], supportedForgeVersion: SystemVersion | null = null) {
    writeRegistry([{}]);
    const overseerFetch = stagedOverseerFetch(answers);
    const { watch, untilReadings } = watchOver(overseerFetch, [], new Set(), supportedForgeVersion);
    watch.start();
    const reading = onlyReadingOf(await untilReadings((readings) => readings.length === 1 && readings[0]?.fidelity !== 'unreachable'));
    return { reading, callShapes: overseerFetch.callShapes };
  }

  test('of a forge at the version this Gaia supports is current, and it is read in full at the versioned paths', async () => {
    const { reading, callShapes } = await onlyReadingOfAnswers(answersOf('serving-every-contract'));
    expect([reading.fidelity, reading.condition, reading.versions])
      .toEqual(['full', 'live', { verdict: 'current', current: SUPPORTED_FORGE_VERSION, minimumSupported: { major: 0, minor: 0 } }]);
    expect(callShapes()).toEqual(VERSIONED_PATHS_ASKED);
  });

  test('of a forge ahead of this Gaia that still serves its version is ahead, and it is read in full with what this Gaia knows', async () => {
    const { reading, callShapes } = await onlyReadingOfAnswers(recordedVersionsAnswersOf('versions-ahead'));
    expect([reading.fidelity, reading.versions]).toEqual(['full', { verdict: 'ahead', current: ONE_MINOR_AHEAD, minimumSupported: { major: 1, minor: 0 } }]);
    expect(callShapes()).toEqual(VERSIONED_PATHS_ASKED);
  });

  test('of a forge whose minimum is above the version this Gaia supports is newer: nothing more is asked and nothing of it is read', async () => {
    const { reading, callShapes } = await onlyReadingOfAnswers(recordedVersionsAnswersOf('versions-newer'));
    expect([reading.fidelity, reading.condition, reading.agents, reading.versions])
      .toEqual(['newer-contract', 'unreadable', [], { verdict: 'newer', current: { major: 2, minor: 1 }, minimumSupported: { major: 2, minor: 0 } }]);
    expect(callShapes()).toEqual(['GET /api/versions']);
  });

  test('of a forge below the version this Gaia supports is older: nothing more is asked, and the forge needs an update', async () => {
    const { reading, callShapes } = await onlyReadingOfAnswers(recordedVersionsAnswersOf('versions-older'));
    expect([reading.fidelity, reading.condition, reading.url, reading.versions])
      .toEqual(['older-contract', 'unreadable', 'http://127.0.0.1:4951/', { verdict: 'older', current: { major: 1, minor: 0 }, minimumSupported: { major: 0, minor: 0 } }]);
    expect(callShapes()).toEqual(['GET /api/versions']);
  });

  test('of the forge Gaia supports read by a Gaia that supports a later one is older too, read from the same answer', async () => {
    const { reading, callShapes } = await onlyReadingOfAnswers(answersOf('serving-every-contract'), ONE_MINOR_AHEAD);
    expect([reading.fidelity, reading.versions?.verdict]).toEqual(['older-contract', 'older']);
    expect(callShapes()).toEqual(['GET /api/versions']);
  });

  test('of a forge that serves no versions, as every released forge, is older with neither version, and nothing more is asked', async () => {
    const { reading, callShapes } = await onlyReadingOfAnswers(recordedVersionsAnswersOf('versions-absent'));
    expect([reading.fidelity, reading.condition, reading.versions]).toEqual(['older-contract', 'unreadable', ForgeVersionsUtil.NO_VERSIONS_SERVED]);
    expect(callShapes()).toEqual(['GET /api/versions']);
  });
});
