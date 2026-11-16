/**
 * Where a run of Flint's brain lives: a Watcher of its own in the tracker's `flint-brain/` folder, launched, written to and read as a job's
 * Watcher is, but no job. The engine reaches it only through `FlintBrainSessionHost`, which a spec replaces.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync
} from 'node:fs';
import { join } from 'node:path';

import type { AgentLaunchPlan }                    from '../../lib/agent-launch/AgentLaunchPlan.ts';
import type { PlatformPorts }                      from '../../lib/platform-ports/PlatformPortsFor.ts';
import { watcherFilesOf }                          from '../../lib/watcher/WatcherFiles.ts';
import type { FlintBrainSessionPlace }             from './FlintBrainProfile.ts';
import { type ProcessStarts, REAL_PROCESS_STARTS } from './ProcessStarts.ts';
import { WatcherFleet }                            from './WatcherFleet.ts';

/** `starting` until the session's process runs; `ended` once it is gone, also when it never ran. */
export type FlintBrainSessionStanding = 'starting' | 'running' | 'ended';

export interface FlintBrainSessionLines {
  /** What the session printed, in order. */
  readonly lines:        readonly string[];
  /** The cursor the next read passes. */
  readonly lastSequence: number;
}

export type FlintBrainLaunchOutcome =
  | { readonly verdict: 'launched'; readonly run: number }
  | { readonly verdict: 'refused'; readonly reason: string };

export interface FlintBrainSessionHost {
  /** Ends what an earlier Overseer left running, then launches the plan made for the place it gives. */
  readonly launch:         (planOf: (place: FlintBrainSessionPlace) => AgentLaunchPlan) => Promise<FlintBrainLaunchOutcome>;
  readonly linesAfter:     (run: number, afterSequence: number) => FlintBrainSessionLines;
  readonly standingOf:     (run: number) => FlintBrainSessionStanding;
  /** Whether the session took the line. */
  readonly write:          (run: number, line: string) => Promise<boolean>;
  readonly stop:           (run: number) => Promise<void>;
  /** Acknowledges the run's ended Watcher so it exits; true once nothing of the run is live. */
  readonly acknowledgeEnd: (run: number) => Promise<boolean>;
}

export interface FlintBrainHostFacts {
  readonly platformPorts:     PlatformPorts;
  readonly trackerDirectory:  string;
  readonly trackerId:         string;
  readonly monitorFolder:     string;
  readonly watcherBundlePath: string;
  readonly codeVersion:       string;
  readonly processStarts?:    ProcessStarts;
}

/** The name a run's Watcher goes by in its socket, its secret and its `welcome`. */
export const FLINT_BRAIN_WATCHER_NAME = 'flint-brain';

const FLINT_BRAIN_FOLDER_NAME = 'flint-brain';
const SESSION_FOLDER_NAME = 'session';
const WATCHER_RECORD_FILE_PATTERN = /^watcher-(?<instance>\d+)\.json$/;

function brainFolderOf(trackerDirectory: string): string {
  return join(trackerDirectory, FLINT_BRAIN_FOLDER_NAME);
}

function runFolderOf(brainFolder: string, run: number): string {
  return join(brainFolder, `run-${run}`);
}

function claimedRunsIn(brainFolder: string): number[] {
  if (!existsSync(brainFolder)) return [];
  return readdirSync(brainFolder).flatMap((fileName) => {
    const instance = WATCHER_RECORD_FILE_PATTERN.exec(fileName)?.groups?.['instance'];
    return instance === undefined ? [] : [Number(instance)];
  });
}

/** The newest run's record stays, so the next run's number is above every earlier one and no socket or secret is used twice. */
function removeEndedRuns(ports: PlatformPorts, brainFolder: string, runs: readonly number[]): void {
  const newestRun = Math.max(...runs);
  for (const run of runs) {
    if (run === newestRun || WatcherFleet.livenessOf(ports, brainFolder, run).verdict === 'live') continue;
    for (const path of Object.values(watcherFilesOf(brainFolder, run))) rmSync(path, { force: true });
    rmSync(runFolderOf(brainFolder, run), { recursive: true, force: true });
  }
}

/** A run an earlier Overseer left running had no one to end it at its time: it is stopped now. */
async function stopLeftoverRuns(ports: PlatformPorts, brainFolder: string, runs: readonly number[]): Promise<void> {
  for (const run of runs) {
    if (WatcherFleet.livenessOf(ports, brainFolder, run).verdict === 'live') await WatcherFleet.sendFrames(ports, brainFolder, run, [{ kind: 'stop', graceMilliseconds: 0 }]);
  }
  await WatcherFleet.reapEndedHostsIn(ports, brainFolder);
}

export function createWatcherFlintBrainSessionHost(facts: FlintBrainHostFacts): FlintBrainSessionHost {
  const ports = facts.platformPorts;
  const brainFolder = brainFolderOf(facts.trackerDirectory);
  return Object.freeze<FlintBrainSessionHost>({
    launch: async (planOf) => {
      const earlierRuns = claimedRunsIn(brainFolder);
      await stopLeftoverRuns(ports, brainFolder, earlierRuns);
      if (earlierRuns.length > 0) removeEndedRuns(ports, brainFolder, earlierRuns);
      const run = Math.max(0, ...earlierRuns) + 1;
      const unfitEndpoint = WatcherFleet.unfitEndpointOf(ports, {
        monitorFolder: facts.monitorFolder, trackerId: facts.trackerId, jobId: FLINT_BRAIN_WATCHER_NAME, instance: run
      });
      if (unfitEndpoint !== null) return { verdict: 'refused', reason: `the Watcher's endpoint ${unfitEndpoint} does not fit` };
      const place = { run, workingDirectory: join(brainFolder, SESSION_FOLDER_NAME), jobFilesDirectory: runFolderOf(brainFolder, run) };
      mkdirSync(place.workingDirectory, { recursive: true });
      WatcherFleet.writeLaunchFiles(ports, {
        jobFolder:          brainFolder,
        instance:           run,
        jobId:              FLINT_BRAIN_WATCHER_NAME,
        trackerId:          facts.trackerId,
        monitorFolder:      facts.monitorFolder,
        watcherCodeVersion: facts.codeVersion,
        workingDirectory:   place.workingDirectory,
        plan:               planOf(place),
      });
      (facts.processStarts ?? REAL_PROCESS_STARTS).spawnWatcher(ports, {
        bundlePath: facts.watcherBundlePath, jobFolder: brainFolder, instance: run, rootDirectory: brainFolder
      });
      return { verdict: 'launched', run };
    },
    linesAfter: (run, afterSequence) => {
      const entries = WatcherFleet.eventsAfter(brainFolder, run, afterSequence);
      if (entries === 'malformed') return { lines: [], lastSequence: afterSequence };
      return {
        lines:        entries.filter((entry) => entry.origin === 'agent').map((entry) => entry.line),
        lastSequence: entries.reduce((last, entry) => Math.max(last, entry.sequence), afterSequence),
      };
    },
    standingOf: (run) => {
      const liveness = WatcherFleet.livenessOf(ports, brainFolder, run);
      if (liveness.verdict === 'ended' || liveness.verdict === 'lost') return 'ended';
      if (liveness.verdict === 'unclaimed') return 'starting';
      return WatcherFleet.watcherRecordOf(brainFolder, run)?.state === 'running' ? 'running' : 'starting';
    },
    write: (run, line) => WatcherFleet.sendFrames(ports, brainFolder, run, [{ kind: 'write', line }]),
    stop:  async (run) => {
      if (WatcherFleet.livenessOf(ports, brainFolder, run).verdict === 'live') await WatcherFleet.sendFrames(ports, brainFolder, run, [{ kind: 'stop', graceMilliseconds: 0 }]);
    },
    acknowledgeEnd: async (run) => {
      if (WatcherFleet.livenessOf(ports, brainFolder, run).verdict === 'live') return false;
      await WatcherFleet.reapEndedHostsIn(ports, brainFolder);
      return true;
    },
  });
}

/** How many looks an Overseer's stop gives a stopped brain session to end, inside the stop's own bound, before it leaves the run behind. */
const STOP_LOOKS = 10;

/**
 * The Overseer's stop: once no run's session is live, each ended run's Watcher is acknowledged, so none outlives its Overseer waiting for
 * the acknowledgement only the next launch would give.
 */
async function reapRunsAtStop(ports: PlatformPorts, trackerDirectory: string, lookIntervalMilliseconds: number): Promise<void> {
  const brainFolder = brainFolderOf(trackerDirectory);
  const runs = claimedRunsIn(brainFolder);
  const anyRunIsLive = (): boolean => runs.some((run) => WatcherFleet.livenessOf(ports, brainFolder, run).verdict === 'live');
  for (let look = 0; look < STOP_LOOKS && anyRunIsLive(); look += 1) {
    await new Promise((resolve) => {
      setTimeout(resolve, lookIntervalMilliseconds);
    });
  }
  await WatcherFleet.reapEndedHostsIn(ports, brainFolder);
}

export const FlintBrainSessionHosts = Object.freeze({ reapRunsAtStop });
