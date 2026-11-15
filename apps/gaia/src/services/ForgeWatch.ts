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
import type { ClockTimer, ClockTimers }           from './Clock.ts';
import { WatchReadingUtil }                       from './utils/WatchReadingUtil.ts';

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
  readonly timers:            ClockTimers;
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

/** The part of an entry a watch follows the forge by; the last command and its stamp change with every forge command and ask nothing again. */
function followedPartOf(entry: RegisteredForge): Omit<RegisteredForge, 'lastCommand' | 'lastChangedAt'> {
  return {
    trackerId: entry.trackerId,
    project:   entry.project,
    root:      entry.root,
    program:   entry.program,
    overseer:  entry.overseer,
  };
}

interface WatchedForge {
  readonly reading:   () => ForgeReading | null;
  readonly entry:     () => RegisteredForge;
  readonly follow:    (entry: RegisteredForge) => void;
  /** Takes an entry whose followed part is unchanged: its last command reaches the reading without asking the forge again. */
  readonly keepEntry: (entry: RegisteredForge) => void;
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
  let registryTimer: ClockTimer | null = null;
  let isStarted = false;
  let isStopped = false;

  function watchedForgeOf(firstEntry: RegisteredForge): WatchedForge {
    let entry = firstEntry;
    let reading: ForgeReading | null = null;
    let lastWholeReading: ForgeReading | null = null;
    let failedTries = 0;
    let generation = 0;
    let roundTimer: ClockTimer | null = null;
    let monitorFollow: MonitorFollow | null = null;

    /** The last command is always the one the entry names now, whatever round the reading was taken in. */
    function setReading(nextReading: ForgeReading): void {
      const readingWithLastCommand = { ...nextReading, lastCommand: entry.lastCommand, lastChangedAt: entry.lastChangedAt };
      if (reading !== null && contentHashOf(reading) === contentHashOf(readingWithLastCommand)) return;
      reading = readingWithLastCommand;
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
        launchRound();
      }, delayMilliseconds);
    }

    /** A round that throws, a reading listener's throw included, is a failed try: it never ends the server. */
    function launchRound(): void {
      const round = beginRound();
      identifyAndRead(round)
        .catch(() => {
          if (round.isCurrent()) failedTry();
        })
        // The failed try scheduled the next round before it told the listener, so a listener that throws again loses nothing.
        .catch(() => undefined);
    }

    /** A forge never read in this run reads unreachable at once; one read before keeps its reading for a few tries (PLAN 7.1). */
    function failedTry(): void {
      failedTries += 1;
      scheduleRound(intervals.streamReconnectIntervalMilliseconds);
      if (lastWholeReading === null || failedTries >= intervals.unreachableAfterFailedTries) {
        setReading(WatchReadingUtil.unreachableReadingOf(entry, lastWholeReading));
      }
    }

    function readStarting(): void {
      setReading(WatchReadingUtil.startingReadingOf(entry, lastWholeReading));
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
      let snapshotWasUnreadable = false;
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
        } else {
          // An open stream that only sends what Gaia cannot read would otherwise keep the forge as it was, never failing a try.
          snapshotWasUnreadable = true;
          follow.stop();
        }
      });
      monitorFollow = follow;
      const end = await follow.ended;
      if (!round.isCurrent()) return;
      monitorFollow = null;
      if (snapshotWasUnreadable) return failedTry();
      if (end.verdict === 'ended' && end.ending === 'stopped') return;
      if (end.verdict !== 'ended' && WatchReadingUtil.failureMeansStarting(end)) return readStarting();
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
      if (answer.verdict !== 'answered' && WatchReadingUtil.failureMeansStarting(answer)) return readStarting();
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
      launchRound();
    }

    function keepEntry(nextEntry: RegisteredForge): void {
      entry = nextEntry;
      if (reading !== null) setReading(reading);
    }

    function lookAgain(): void {
      if (monitorFollow === null) launchRound();
    }

    return {
      reading: () => reading,
      entry:   () => entry,
      follow,
      keepEntry,
      lookAgain,
      stop:    () => {
        beginRound();
      },
    };
  }

  /** An entry whose followed part changed is followed afresh; any other is kept, and looked at again when User asked. */
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
      } else if (contentHashOf(followedPartOf(watchedForge.entry())) !== contentHashOf(followedPartOf(entry))) {
        watchedForge.follow(entry);
      } else {
        watchedForge.keepEntry(entry);
        if (isLookAgain) watchedForge.lookAgain();
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
      launchRegistryCheck();
    }, intervals.registryCheckIntervalMilliseconds);
  }

  /** A check that throws, a reading listener's throw included, never ends the server: the next check is scheduled all the same. */
  function launchRegistryCheck(): void {
    checkRegistry(false).catch(() => undefined);
  }

  /**
   * The content hash of the visible entries decides whether anything changed, never the file's time. A registry that cannot be read, or
   * is newer than Gaia knows, leaves every watch as it is.
   */
  async function checkRegistry(isLookAgain: boolean): Promise<void> {
    try {
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
    } finally {
      if (!isStopped) scheduleRegistryCheck();
    }
  }

  function start(): void {
    if (isStarted || isStopped) return;
    isStarted = true;
    launchRegistryCheck();
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
