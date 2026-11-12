/**
 * Finds and reads every forge the registry names (PLAN 7.1): one watch per forge identifies its Overseer, follows its monitor stream or
 * polls its summary, and opens a lost stream again. A forge that is down is an ordinary reading, never a throw. Every interval is a
 * schedule on injected timers, never a decision.
 */
import { createHash } from 'node:crypto';
import { stat }       from 'node:fs/promises';

import type { ForgeIdentity, ForgeRegistryFacts } from '../adapters/forge-api/@types/ForgeDocumentReading.ts';
import { BoardSummaryIngestion }                  from '../adapters/forge-api/BoardSummaryIngestion.ts';
import { IdentityIngestion }                      from '../adapters/forge-api/IdentityIngestion.ts';
import { MonitorSnapshotIngestion }               from '../adapters/forge-api/MonitorSnapshotIngestion.ts';
import { OverseerTokenFile }                      from '../adapters/forge-api/OverseerTokenFile.ts';
import type { RegisteredForge }                   from '../adapters/forge-registry/@types/RegisteredForge.ts';
import type { RegistryReading }                   from '../adapters/forge-registry/RegistryFile.ts';
import type { MonitorFollow }                     from '../lib/forge-client/@types/ForgeClientAnswer.ts';
import type { ForgeClient }                       from '../lib/forge-client/ForgeClient.ts';
import type { ForgeReading }                      from '../shared/@types/ForgeReading.ts';
import { WatchReadingUtil }                       from './utils/WatchReadingUtil.ts';

export interface WatchTimer {
  readonly cancel: () => void;
}

/** The clock's timers, injected so that a spec fires them by hand and never waits a real interval. */
export interface WatchTimers {
  readonly start: (callback: () => void, delayMilliseconds: number) => WatchTimer;
}

export interface ForgeWatchIntervals {
  readonly registryCheckIntervalMilliseconds:   number;
  readonly streamReconnectIntervalMilliseconds: number;
  readonly summaryPollIntervalMilliseconds:     number;
  readonly unreachableAfterFailedTries:         number;
}

export interface ForgeWatchOptions {
  readonly readRegistry:      () => Promise<RegistryReading>;
  readonly forgeClient:       ForgeClient;
  /** Read at each registry check, so a forge hidden or shown again counts from the next check on. */
  readonly hiddenTrackerIds:  () => readonly string[];
  readonly timers:            WatchTimers;
  /** The stamp a reading is taken at: recorded and shown, never compared. */
  readonly now:               () => string;
  readonly onReadingsChanged: () => void;
  readonly intervals?:        Partial<ForgeWatchIntervals>;
}

export interface ForgeWatch {
  /** Reads the registry at once, then on its interval. */
  readonly start:             () => void;
  /** Every forge Gaia has a reading of, in registry order; a forge still being identified for the first time is left out. */
  readonly readings:          () => readonly ForgeReading[];
  /** Every forge the registry names and the settings do not hide, a forge still being identified for the first time included. */
  readonly watchedForgeCount: () => number;
  /** A registry read and an identity round at once, for every forge not following a live stream; done when the registry is read. */
  readonly lookAgain:         () => Promise<void>;
  /** Cancels every timer and closes every stream; an answer that arrives later changes nothing. */
  readonly stop:              () => void;
}

const REGISTRY_CHECK_INTERVAL_MILLISECONDS = 2_000;
const STREAM_RECONNECT_INTERVAL_MILLISECONDS = 3_000;
const SUMMARY_POLL_INTERVAL_MILLISECONDS = 5_000;
const UNREACHABLE_AFTER_FAILED_TRIES = 3;

const DEFAULT_INTERVALS: ForgeWatchIntervals = {
  registryCheckIntervalMilliseconds:   REGISTRY_CHECK_INTERVAL_MILLISECONDS,
  streamReconnectIntervalMilliseconds: STREAM_RECONNECT_INTERVAL_MILLISECONDS,
  summaryPollIntervalMilliseconds:     SUMMARY_POLL_INTERVAL_MILLISECONDS,
  unreachableAfterFailedTries:         UNREACHABLE_AFTER_FAILED_TRIES,
};

/** The identity's refusal while the Overseer has not finished starting. */
const STARTING_REFUSAL = 'starting';

/** The real timers, over the runtime's own. */
export function realWatchTimers(): WatchTimers {
  return {
    start: (callback, delayMilliseconds) => {
      const timeout = setTimeout(callback, delayMilliseconds);
      return { cancel: () => clearTimeout(timeout) };
    },
  };
}

async function rootIsAFolder(root: string): Promise<boolean> {
  try {
    return (await stat(root)).isDirectory();
  } catch {
    return false;
  }
}

function contentHashOf(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

interface WatchedForge {
  readonly reading:   () => ForgeReading | null;
  readonly entry:     () => RegisteredForge;
  readonly follow:    (entry: RegisteredForge) => void;
  readonly lookAgain: () => void;
  readonly stop:      () => void;
}

interface WatchRound {
  readonly isCurrent: () => boolean;
}

export function createForgeWatch(options: ForgeWatchOptions): ForgeWatch {
  const intervals = { ...DEFAULT_INTERVALS, ...options.intervals };
  const { forgeClient, timers } = options;
  const watchedForges = new Map<string, WatchedForge>();
  let trackerIdsInRegistryOrder: readonly string[] = [];
  let lastRegistryHash: string | null = null;
  let registryTimer: WatchTimer | null = null;
  let isStarted = false;
  let isStopped = false;

  function watchedForgeOf(firstEntry: RegisteredForge): WatchedForge {
    let entry = firstEntry;
    let reading: ForgeReading | null = null;
    let lastWholeReading: ForgeReading | null = null;
    let failedTries = 0;
    let generation = 0;
    let roundTimer: WatchTimer | null = null;
    let monitorFollow: MonitorFollow | null = null;

    function setReading(nextReading: ForgeReading): void {
      if (reading !== null && contentHashOf(reading) === contentHashOf(nextReading)) return;
      reading = nextReading;
      options.onReadingsChanged();
    }

    function keepWholeReading(wholeReading: ForgeReading): void {
      failedTries      = 0;
      lastWholeReading = wholeReading;
      setReading(wholeReading);
    }

    /** A new round makes every earlier one stale: its timer is cancelled, its stream closed, and its late answers change nothing. */
    function beginRound(): WatchRound {
      generation += 1;
      const roundGeneration = generation;
      roundTimer?.cancel();
      roundTimer = null;
      monitorFollow?.stop();
      monitorFollow = null;
      return { isCurrent: () => !isStopped && roundGeneration === generation };
    }

    function scheduleRound(delayMilliseconds: number): void {
      roundTimer?.cancel();
      roundTimer = timers.start(() => {
        roundTimer = null;
        void identifyAndRead(beginRound());
      }, delayMilliseconds);
    }

    /** A forge never read in this run reads unreachable at once; one read before keeps its reading for a few tries (PLAN 7.1). */
    function failedTry(): void {
      failedTries += 1;
      if (lastWholeReading === null || failedTries >= intervals.unreachableAfterFailedTries) {
        setReading(WatchReadingUtil.unreachableReadingOf(entry, lastWholeReading));
      }
      scheduleRound(intervals.streamReconnectIntervalMilliseconds);
    }

    async function decideWithoutOverseer(round: WatchRound): Promise<void> {
      const isAFolder = await rootIsAFolder(entry.root);
      if (!round.isCurrent()) return;
      setReading(isAFolder ? WatchReadingUtil.dormantReadingOf(entry, lastWholeReading) : WatchReadingUtil.repositoryMissingReadingOf(entry));
    }

    async function readSummary(round: WatchRound, registryFacts: ForgeRegistryFacts, identity: ForgeIdentity): Promise<void> {
      const answer = await forgeClient.summaryOf(registryFacts.overseerUrl);
      if (!round.isCurrent()) return;
      if (answer.verdict !== 'answered') return failedTry();
      const summaryReading = new BoardSummaryIngestion(registryFacts, identity).readingOf(answer.document, options.now());
      if (summaryReading.verdict === 'newer-contract') return setReading(summaryReading.reading);
      if (summaryReading.verdict !== 'readable') return failedTry();
      keepWholeReading(summaryReading.reading);
      scheduleRound(intervals.summaryPollIntervalMilliseconds);
    }

    async function followMonitor(round: WatchRound, registryFacts: ForgeRegistryFacts, identity: ForgeIdentity, tokenPath: string): Promise<void> {
      const bearerToken = await new OverseerTokenFile(tokenPath).read();
      if (!round.isCurrent()) return;
      if (bearerToken === null) return failedTry();
      const ingestion = new MonitorSnapshotIngestion(registryFacts, identity);
      let wholeSnapshotsRead = 0;
      const follow = forgeClient.followMonitor({ overseerUrl: registryFacts.overseerUrl, bearerToken }, (document) => {
        if (!round.isCurrent()) return;
        const snapshotReading = ingestion.readingOf(document, options.now());
        if (snapshotReading.verdict === 'readable') {
          wholeSnapshotsRead += 1;
          keepWholeReading(snapshotReading.reading);
        } else if (snapshotReading.verdict === 'newer-contract') {
          // Gaia reads nothing of a newer contract; the forge is identified again when its registry entry changes.
          setReading(snapshotReading.reading);
          follow.stop();
        }
      });
      monitorFollow = follow;
      const end = await follow.ended;
      if (!round.isCurrent()) return;
      monitorFollow = null;
      if (end.verdict === 'ended' && end.ending === 'stopped') return;
      // A stream that gave a whole snapshot ended as a Baton pass or a lost connection does; one that gave none is a failed try.
      if (wholeSnapshotsRead === 0) return failedTry();
      scheduleRound(intervals.streamReconnectIntervalMilliseconds);
    }

    async function identifyAndRead(round: WatchRound): Promise<void> {
      const { overseer } = entry;
      if (overseer === null) return decideWithoutOverseer(round);
      const registryFacts = WatchReadingUtil.registryFactsOf(entry, overseer);
      const answer = await forgeClient.identityOf(overseer.url);
      if (!round.isCurrent()) return;
      if (answer.verdict === 'refused' && answer.refusal === STARTING_REFUSAL) {
        setReading(WatchReadingUtil.startingReadingOf(entry, lastWholeReading));
        return scheduleRound(intervals.streamReconnectIntervalMilliseconds);
      }
      if (answer.verdict !== 'answered') return failedTry();
      const identityReading = new IdentityIngestion(registryFacts).readingOf(answer.document);
      if (identityReading.verdict === 'newer-contract') {
        failedTries = 0;
        return setReading(identityReading.reading);
      }
      if (identityReading.verdict !== 'readable') return failedTry();
      const { identity, fidelity } = identityReading;
      // A forge that names no token file cannot be followed; its open summary still gives its counts.
      if (fidelity === 'full' && overseer.tokenPath !== null) return followMonitor(round, registryFacts, identity, overseer.tokenPath);
      return readSummary(round, registryFacts, identity);
    }

    function follow(nextEntry: RegisteredForge): void {
      entry       = nextEntry;
      failedTries = 0;
      void identifyAndRead(beginRound());
    }

    function lookAgain(): void {
      if (monitorFollow === null) void identifyAndRead(beginRound());
    }

    return {
      reading: () => reading,
      entry:   () => entry,
      follow,
      lookAgain,
      stop:    () => {
        beginRound();
      },
    };
  }

  /** A changed entry is followed afresh; an unchanged one is left alone, or looked at again when User asked. */
  function applyEntries(entries: readonly RegisteredForge[], isLookAgain: boolean): void {
    const trackerIds = new Set(entries.map((entry) => entry.trackerId));
    let forgesChanged = false;
    for (const [trackerId, watchedForge] of watchedForges) {
      if (trackerIds.has(trackerId)) continue;
      watchedForge.stop();
      watchedForges.delete(trackerId);
      forgesChanged = true;
    }
    for (const entry of entries) {
      const watchedForge = watchedForges.get(entry.trackerId);
      if (watchedForge === undefined) {
        const newForge = watchedForgeOf(entry);
        watchedForges.set(entry.trackerId, newForge);
        newForge.follow(entry);
      } else if (contentHashOf(watchedForge.entry()) !== contentHashOf(entry)) {
        watchedForge.follow(entry);
      } else if (isLookAgain) {
        watchedForge.lookAgain();
      }
    }
    const nextTrackerIds = entries.map((entry) => entry.trackerId);
    const orderChanged   = contentHashOf(nextTrackerIds) !== contentHashOf(trackerIdsInRegistryOrder);
    trackerIdsInRegistryOrder = nextTrackerIds;
    if (forgesChanged || orderChanged) options.onReadingsChanged();
  }

  function scheduleRegistryCheck(): void {
    registryTimer?.cancel();
    registryTimer = timers.start(() => {
      registryTimer = null;
      void checkRegistry(false);
    }, intervals.registryCheckIntervalMilliseconds);
  }

  /**
   * The content hash of the visible entries decides whether anything changed, never the file's time. A registry that cannot be read, or
   * is newer than Gaia knows, leaves every watch as it is.
   */
  async function checkRegistry(isLookAgain: boolean): Promise<void> {
    const registryReading = await options.readRegistry();
    if (isStopped) return;
    let visibleEntries: readonly RegisteredForge[] | null = null;
    if (registryReading.verdict === 'absent') visibleEntries = [];
    if (registryReading.verdict === 'readable') {
      const hiddenTrackerIds = new Set(options.hiddenTrackerIds());
      visibleEntries = registryReading.forges.filter((forge) => !hiddenTrackerIds.has(forge.trackerId));
    }
    if (visibleEntries !== null) {
      const registryHash = contentHashOf(visibleEntries);
      if (isLookAgain || registryHash !== lastRegistryHash) applyEntries(visibleEntries, isLookAgain);
      lastRegistryHash = registryHash;
    }
    scheduleRegistryCheck();
  }

  function start(): void {
    if (isStarted || isStopped) return;
    isStarted = true;
    void checkRegistry(false);
  }

  function readings(): readonly ForgeReading[] {
    return trackerIdsInRegistryOrder.flatMap((trackerId) => {
      const reading = watchedForges.get(trackerId)?.reading() ?? null;
      return reading === null ? [] : [reading];
    });
  }

  async function lookAgain(): Promise<void> {
    if (isStopped) return;
    registryTimer?.cancel();
    registryTimer = null;
    await checkRegistry(true);
  }

  function stop(): void {
    isStopped = true;
    registryTimer?.cancel();
    registryTimer = null;
    for (const watchedForge of watchedForges.values()) watchedForge.stop();
  }

  return {
    start,
    readings,
    watchedForgeCount: () => trackerIdsInRegistryOrder.length,
    lookAgain,
    stop,
  };
}
