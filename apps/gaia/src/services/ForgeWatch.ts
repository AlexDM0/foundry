/**
 * Finds and reads every forge the registry names (`docs/architecture.md`, "A reading, from forge to screen"): one watch per forge asks its
 * Hephaestus's versions, identifies it, follows its monitor stream or polls its summary, and opens a lost stream again. The forge's system
 * version decides whether Gaia can talk to it at all; a forge that serves no versions is older than Gaia supports. A forge that is down is
 * an ordinary reading, never a throw. Every interval is a schedule on injected timers, never a decision.
 */
import { createHash } from 'node:crypto';
import { stat }       from 'node:fs/promises';

import type { SystemVersion } from 'system-versions/VersionsDocument';

import type { ForgeIdentity, ForgeRegistryFacts }        from '../adapters/forge-api/@types/ForgeDocumentReading.ts';
import { BoardSummaryIngestion }                         from '../adapters/forge-api/BoardSummaryIngestion.ts';
import { HephaestusTokenFile }                           from '../adapters/forge-api/HephaestusTokenFile.ts';
import { IdentityIngestion }                             from '../adapters/forge-api/IdentityIngestion.ts';
import { MonitorSnapshotIngestion }                      from '../adapters/forge-api/MonitorSnapshotIngestion.ts';
import { PresenceIngestion, type PresenceReportReading } from '../adapters/forge-api/PresenceIngestion.ts';
import { ForgeReadingMapUtil }                           from '../adapters/forge-api/utils/ForgeReadingMapUtil.ts';
import type { RegisteredForge }                          from '../adapters/forge-registry/@types/RegisteredForge.ts';
import type { RegistryReading }                          from '../adapters/forge-registry/RegistryFile.ts';
import type {
  ForgeDocumentAnswer,
  MonitorFollow,
  HephaestusAccess,
  HephaestusAddress,
} from '../lib/forge-client/@types/ForgeClientAnswer.ts';
import type { ForgeClient }                                      from '../lib/forge-client/ForgeClient.ts';
import { SUPPORTED_FORGE_VERSION }                               from '../lib/forge-client/constants/SupportedForgeVersions.ts';
import type { ForgePresenceReport }                              from '../shared/@types/ForgePresence.ts';
import type { ForgeNewestVersions, ForgeReading, ForgeVersions } from '../shared/@types/ForgeReading.ts';
import { ForgeVersionsUtil }                                     from '../shared/utils/ForgeVersionsUtil.ts';
import { SystemVersionUtil }                                     from '../shared/utils/SystemVersionUtil.ts';
import type { ClockTimer, ClockTimers }                          from './Clock.ts';
import { WatchReadingUtil }                                      from './utils/WatchReadingUtil.ts';

export interface ForgeWatchIntervals {
  readonly registryCheckIntervalMilliseconds:   number;
  readonly streamReconnectIntervalMilliseconds: number;
  readonly summaryPollIntervalMilliseconds:     number;
  readonly unreachableAfterFailedTries:         number;
}

export interface ForgeWatchOptions {
  readonly readRegistry:           () => Promise<RegistryReading>;
  readonly forgeClient:            ForgeClient;
  /** Read at each registry check, so a forge hidden or shown again counts from the next check on. */
  readonly hiddenTrackerIds:       () => readonly string[];
  readonly timers:                 ClockTimers;
  /** The stamp a reading is taken at: recorded and shown, never compared. */
  readonly now:                    () => string;
  readonly onReadingsChanged:      () => void;
  readonly intervals?:             Partial<ForgeWatchIntervals>;
  /** The one forge version this Gaia supports; `SUPPORTED_FORGE_VERSION` when not given, and planted by a spec. */
  readonly supportedForgeVersion?: SystemVersion;
  /**
   * The installed program's versions, run once each time a registry check follows the forge afresh and when User looks again, never on a
   * timer of its own; `null` when the program does not answer them. Absent, no reading names a newest version.
   */
  readonly readNewestVersions?:    (entry: RegisteredForge) => Promise<ForgeNewestVersions | null>;
}

export interface ForgeWatch {
  /** Reads the registry at once, then on its interval. */
  readonly start:                   () => void;
  /** Every forge Gaia has a reading of, in registry order; a forge still being identified for the first time is left out. */
  readonly readings:                () => readonly ForgeReading[];
  /** Every forge the registry names and the settings do not hide, a forge still being identified for the first time included. */
  readonly watchedForgeCount:       () => number;
  /** A registry read and an identity round at once, for every forge not following a live stream; done when the registry is read. */
  readonly lookAgain:               () => Promise<void>;
  /**
   * The forge's presence read after now, through the one reader the watch reads it with at each change of its monitor snapshot: a call
   * while a read is on its way shares the next one. `null` when the watch follows no monitor of the forge or the presence did not answer.
   */
  readonly presenceReadingAfterNow: (trackerId: string) => Promise<PresenceReportReading | null>;
  /** Cancels every timer and closes every stream; an answer that arrives later changes nothing. */
  readonly stop:                    () => void;
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

/**
 * What a forge's `/api/versions` answer says. `starting`: its Hephaestus is not up yet. `unanswered`: it does not answer, or answers what no
 * forge would, as a program that is no forge does, so the try fails. A refusal is a forge from before versions, which answers the path as
 * any unknown one: older than Gaia supports.
 */
type VersionsAnswerReading = { readonly verdict: 'versions'; readonly versions: ForgeVersions } | { readonly verdict: 'starting' } | { readonly verdict: 'unanswered' };

function versionsAnswerReadingOf(answer: ForgeDocumentAnswer, supportedForgeVersion: SystemVersion): VersionsAnswerReading {
  if (answer.verdict !== 'answered' && WatchReadingUtil.failureMeansStarting(answer)) return { verdict: 'starting' };
  if (answer.verdict === 'refused') return { verdict: 'versions', versions: ForgeVersionsUtil.NO_VERSIONS_SERVED };
  if (answer.verdict !== 'answered') return { verdict: 'unanswered' };
  const document = SystemVersionUtil.versionsDocumentOf(answer.document);
  return document === null ? { verdict: 'unanswered' } : { verdict: 'versions', versions: ForgeVersionsUtil.forgeVersionsOf(document, supportedForgeVersion) };
}

function contentHashOf(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/**
 * The part of an entry a watch follows the forge by; the last command and its stamp change with every forge command, and the presence with
 * every start, stop and crash, and ask nothing again.
 */
function followedPartOf(entry: RegisteredForge): Omit<RegisteredForge, 'lastCommand' | 'lastChangedAt' | 'presence'> {
  return {
    trackerId:  entry.trackerId,
    project:    entry.project,
    root:       entry.root,
    program:    entry.program,
    hephaestus: entry.hephaestus,
  };
}

type PresenceReadAfterNow = () => Promise<PresenceReportReading | null>;

interface WatchedForge {
  readonly reading:                 () => ForgeReading | null;
  readonly presenceReadingAfterNow: PresenceReadAfterNow;
  readonly entry:                   () => RegisteredForge;
  readonly follow:                  (entry: RegisteredForge) => void;
  /** Takes an entry whose followed part is unchanged: its last command reaches the reading without asking the forge again. */
  readonly keepEntry:               (entry: RegisteredForge) => void;
  readonly lookAgain:               () => void;
  readonly stop:                    () => void;
}

interface WatchRound {
  readonly isCurrent: () => boolean;
}

/** One round's way to the forge: what the registry holds of it, its address, and its versions, which every reading carries. */
interface ForgeAddress {
  readonly registryFacts: ForgeRegistryFacts;
  readonly address:       HephaestusAddress;
  readonly versions:      ForgeVersions;
}

export function createForgeWatch(options: ForgeWatchOptions): ForgeWatch {
  const intervals = { ...DEFAULT_INTERVALS, ...options.intervals };
  const { forgeClient, timers } = options;
  const supportedForgeVersion = options.supportedForgeVersion ?? SUPPORTED_FORGE_VERSION;
  const presenceIngestion = new PresenceIngestion();
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
    let presenceReport: ForgePresenceReport | null = null;
    let presenceReadAfterNow: PresenceReadAfterNow | null = null;
    let newestVersions: ForgeNewestVersions | null = null;
    let newestVersionsReads = 0;

    /**
     * The last command and the registry's presence are always the ones the entry names now, whatever round the reading was taken in; the
     * presence a forge serves holds only while it is read in full.
     */
    function setReading(nextReading: ForgeReading): void {
      const readingWithLastCommand = {
        ...nextReading,
        lastCommand:      entry.lastCommand,
        lastChangedAt:    entry.lastChangedAt,
        registryPresence: entry.presence,
        presenceReport:   nextReading.fidelity === 'full' ? presenceReport : null,
        newestVersions,
      };
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
      presenceReport = null;
      presenceReadAfterNow = null;
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

    /** A forge never read in this run reads unreachable at once; one read before keeps its reading for a few tries. */
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

    async function decideWithoutHephaestus(round: WatchRound): Promise<void> {
      const isAFolder = await rootIsAFolder(entry.root);
      if (!round.isCurrent()) return;
      setReading(isAFolder ? WatchReadingUtil.dormantReadingOf(entry, lastWholeReading) : WatchReadingUtil.repositoryMissingReadingOf(entry));
    }

    async function readSummary(round: WatchRound, forgeAddress: ForgeAddress, identity: ForgeIdentity): Promise<void> {
      const { registryFacts, address, versions } = forgeAddress;
      const answer = await forgeClient.summaryOf(address);
      if (!round.isCurrent()) return;
      if (answer.verdict !== 'answered') return failedTry();
      const summaryReading = new BoardSummaryIngestion(registryFacts, identity).readingOf(answer.document, options.now());
      if (summaryReading.verdict === 'newer-contract') return setReading({ ...summaryReading.reading, versions });
      if (summaryReading.verdict !== 'readable') return failedTry();
      keepWholeReading({ ...summaryReading.reading, versions });
      scheduleRound(intervals.summaryPollIntervalMilliseconds);
    }

    async function followMonitor(round: WatchRound, forgeAddress: ForgeAddress, identity: ForgeIdentity, tokenPath: string): Promise<void> {
      const { registryFacts, address, versions } = forgeAddress;
      const bearerToken = await new HephaestusTokenFile(tokenPath).read();
      if (!round.isCurrent()) return;
      if (bearerToken === null) return failedTry();
      const ingestion = new MonitorSnapshotIngestion(registryFacts, identity);
      const access: HephaestusAccess = { ...address, bearerToken };
      const readPresence = presenceReaderOf(round, access);
      presenceReadAfterNow = readPresence;
      let wholeSnapshotsRead = 0;
      let snapshotWasUnreadable = false;
      const follow = forgeClient.followMonitor(access, (document) => {
        if (!round.isCurrent()) return;
        const snapshotReading = ingestion.readingOf(document, options.now());
        if (snapshotReading.verdict === 'readable') {
          wholeSnapshotsRead += 1;
          keepWholeReading({ ...snapshotReading.reading, versions });
          void readPresence();
        } else if (snapshotReading.verdict === 'newer-contract') {
          // Gaia reads nothing of a newer contract; the forge is identified again when its registry entry changes.
          setReading({ ...snapshotReading.reading, versions });
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
      // A stream that gave a whole snapshot ended as a restart or a lost connection does; one that gave none is a failed try.
      if (wholeSnapshotsRead === 0) return failedTry();
      scheduleRound(intervals.streamReconnectIntervalMilliseconds);
    }

    /**
     * Reads the forge's presence once per change of its monitor snapshot, never on a timer, and for a board read that asks: a call while a
     * read is on its way shares the one after it, so a burst of changes and asks costs at most two. A presence that cannot be read keeps the
     * last one read in this round.
     */
    function presenceReaderOf(round: WatchRound, access: HephaestusAccess): PresenceReadAfterNow {
      let readOnItsWay: Promise<PresenceReportReading | null> | null = null;
      let readAfterIt: Promise<PresenceReportReading | null> | null = null;

      async function readOnce(): Promise<PresenceReportReading | null> {
        const answer = await forgeClient.presenceOf(access);
        if (!round.isCurrent() || answer.verdict !== 'answered') return null;
        const presenceReading = presenceIngestion.presenceReportOf(answer.document);
        if (presenceReading.report !== null) {
          presenceReport = presenceReading.report;
          if (reading !== null) setReading(reading);
        }
        return presenceReading;
      }

      function beginRead(): Promise<PresenceReportReading | null> {
        // A presence read that throws is a lost read, never a failed try of the round.
        const read = readOnce().catch(() => null);
        readOnItsWay = read;
        void read.then(() => {
          if (readOnItsWay === read) readOnItsWay = null;
        });
        return read;
      }

      return () => {
        if (readOnItsWay === null) return beginRead();
        readAfterIt ??= readOnItsWay.then(() => {
          readAfterIt = null;
          return round.isCurrent() ? beginRead() : null;
        });
        return readAfterIt;
      };
    }

    /** A forge Gaia cannot talk to is read from the registry alone, and asked nothing more until its entry changes or User looks again. */
    function readCannotTalk(registryFacts: ForgeRegistryFacts, versions: ForgeVersions): void {
      failedTries = 0;
      const reading = versions.verdict === 'older'
        ? ForgeReadingMapUtil.olderContractReadingOf(registryFacts)
        : ForgeReadingMapUtil.newerContractReadingOf(registryFacts, null, ForgeReadingMapUtil.contractsWith(null, {}));
      setReading({ ...reading, versions });
    }

    async function identifyAndRead(round: WatchRound): Promise<void> {
      const { hephaestus } = entry;
      if (hephaestus === null) return decideWithoutHephaestus(round);
      const registryFacts = WatchReadingUtil.registryFactsOf(entry, hephaestus);
      const versionsReading = versionsAnswerReadingOf(await forgeClient.versionsOf(hephaestus.url), supportedForgeVersion);
      if (!round.isCurrent()) return;
      if (versionsReading.verdict === 'starting') return readStarting();
      if (versionsReading.verdict === 'unanswered') return failedTry();
      const { versions } = versionsReading;
      if (!ForgeVersionsUtil.canTalk(versions)) return readCannotTalk(registryFacts, versions);
      const forgeAddress: ForgeAddress = { registryFacts, address: { hephaestusUrl: hephaestus.url }, versions };
      const answer = await forgeClient.identityOf(forgeAddress.address);
      if (!round.isCurrent()) return;
      if (answer.verdict !== 'answered' && WatchReadingUtil.failureMeansStarting(answer)) return readStarting();
      if (answer.verdict !== 'answered') return failedTry();
      const identityReading = new IdentityIngestion(registryFacts).readingOf(answer.document);
      if (identityReading.verdict === 'newer-contract') {
        failedTries = 0;
        return setReading({ ...identityReading.reading, versions });
      }
      if (identityReading.verdict !== 'readable') return failedTry();
      const { identity } = identityReading;
      // A forge that names no token file cannot be followed; its open summary still gives its counts.
      if (hephaestus.tokenPath !== null) return followMonitor(round, forgeAddress, identity, hephaestus.tokenPath);
      return readSummary(round, forgeAddress, identity);
    }

    /** Only the newest read counts: an answer that arrives after a later read began, or after the watch stopped, changes nothing. */
    function readNewestVersions(): void {
      const { readNewestVersions: readVersions } = options;
      if (readVersions === undefined) return;
      newestVersionsReads += 1;
      const readNumber = newestVersionsReads;
      readVersions(entry)
        .then((versions) => {
          if (isStopped || readNumber !== newestVersionsReads) return;
          newestVersions = versions;
          if (reading !== null) setReading(reading);
        })
        // A program that throws is a read that gave nothing, never a failed try of the watch.
        .catch(() => undefined);
    }

    function follow(nextEntry: RegisteredForge): void {
      entry       = nextEntry;
      failedTries = 0;
      readNewestVersions();
      launchRound();
    }

    function keepEntry(nextEntry: RegisteredForge): void {
      entry = nextEntry;
      if (reading !== null) setReading(reading);
    }

    function lookAgain(): void {
      readNewestVersions();
      if (monitorFollow === null) launchRound();
    }

    return {
      reading:                 () => reading,
      presenceReadingAfterNow: () => presenceReadAfterNow?.() ?? Promise.resolve(null),
      entry:                   () => entry,
      follow,
      keepEntry,
      lookAgain,
      stop:                    () => {
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

  function presenceReadingAfterNow(trackerId: string): Promise<PresenceReportReading | null> {
    return watchedForges.get(trackerId)?.presenceReadingAfterNow() ?? Promise.resolve(null);
  }

  return {
    start,
    readings,
    watchedForgeCount: () => trackerIdsInRegistryOrder.length,
    lookAgain,
    presenceReadingAfterNow,
    stop,
  };
}
