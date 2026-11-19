/**
 * `BoardChildren` over the Watchers: each child runs under a Watcher of its own, launched, read, written to and stopped through
 * `WatcherFleet` as before the port.
 */
import { basename, dirname } from 'node:path';

import type { PlatformPorts }                                    from '../../lib/platform-ports/PlatformPortsFor.ts';
import type { ProcessIdentity }                                  from '../../lib/process-identity/ProcessIdentity.ts';
import type { ChildInput }                                       from '../../lib/talos/@types/TalosFrame.ts';
import { childIdOf }                                             from '../../lib/talos/ChildLaunch.ts';
import type { ChildEnd, ChildKind, ChildRecord }                 from '../../lib/talos/ChildRecord.ts';
import { CHILD_RECORD_FORMAT_VERSION, EVENT_LOG_FORMAT_VERSION } from '../../lib/talos/constants/TalosProtocol.ts';
import type { ActingFrame }                                      from '../../lib/watcher/@types/WatcherFrame.ts';
import { watcherFilesOf }                                        from '../../lib/watcher/WatcherFiles.ts';
import { readWatcherLaunch }                                     from '../../lib/watcher/WatcherLaunch.ts';
import type { WatcherEnd, WatcherEndReason, WatcherRecord }      from '../../lib/watcher/WatcherRecord.ts';
import type { BoardChildren, ChildLiveness }                     from './BoardChildren.ts';
import { type ProcessStarts, REAL_PROCESS_STARTS }               from './ProcessStarts.ts';
import { WatcherFleet }                                          from './WatcherFleet.ts';

/** What a launch needs beyond reading: the facts each Watcher's launch file, endpoint and secret are made of. */
export interface WatcherLaunching {
  trackerId:         string;
  monitorFolder:     string;
  watcherBundlePath: string;
  codeVersion:       string;
  /** Where each Watcher process runs, so none holds a worktree it does not own as its working directory. */
  watcherDirectory:  string;
  processStarts?:    ProcessStarts;
}

export interface WatcherBoardChildrenFacts {
  platformPorts:    PlatformPorts;
  trackerDirectory: string;
  /** `null` for a reader that launches nothing: each launch answers `talos-unavailable`. */
  launching:        WatcherLaunching | null;
  log:              (sentence: string) => void;
}

export interface WatcherBoardChildren extends BoardChildren {
  /** Acknowledges every ended Watcher of the board's jobs that still runs, so it exits; answers how many took it. */
  readonly reapEndedWatchers: () => Promise<number>;
}

/** A Watcher record names no Talos start. */
const WATCHER_TALOS_START_NUMBER = 0;

/** A Watcher end where no child ran is Talos's `spawn-failed`; the other reasons keep their name. */
const CHILD_END_REASON_OF_WATCHER_END: Readonly<Record<WatcherEndReason, ChildEnd['reason']>> = {
  'exited':            'exited',
  'signalled':         'signalled',
  'spawn-failed':      'spawn-failed',
  'launch-unreadable': 'spawn-failed',
  'socket-unbindable': 'spawn-failed',
};

interface SpawnedWatcher {
  readonly kind:             ChildKind;
  readonly label:            string;
  readonly workingDirectory: string;
  readonly watcher:          ProcessIdentity | null;
}

function childEndOf(end: WatcherEnd): ChildEnd {
  return {
    reason: CHILD_END_REASON_OF_WATCHER_END[end.reason], exitCode: end.exitCode, signal: end.signal, detail: end.detail ?? null, runMilliseconds: 0
  };
}

function actingFrameOf(input: ChildInput): ActingFrame {
  return input.act === 'write-line' ? { kind: 'write', line: input.line } : { kind: 'close-input' };
}

function childRecordOf(childFolder: string, instance: number, record: WatcherRecord, spawned: Omit<SpawnedWatcher, 'watcher'>): ChildRecord {
  return {
    formatVersion:         CHILD_RECORD_FORMAT_VERSION,
    childId:               childIdOf(childFolder, instance),
    kind:                  spawned.kind,
    label:                 spawned.label,
    workingDirectory:      spawned.workingDirectory,
    talosStartNumber:      WATCHER_TALOS_START_NUMBER,
    talos:                 record.watcher,
    state:                 record.end === undefined ? (record.state === 'running' ? 'running' : 'starting') : 'ended',
    childProcess:          record.childProcess ?? null,
    childProcessGroupId:   record.childProcessGroupId ?? null,
    eventLogFormatVersion: EVENT_LOG_FORMAT_VERSION,
    timeBoundMilliseconds: null,
    recognisedEndings:     [],
    end:                   record.end === undefined ? null : childEndOf(record.end),
  };
}

/** A Watcher spawned by this Overseer that has not claimed yet reads as a child starting under it. */
function startingRecordOf(childFolder: string, instance: number, spawned: SpawnedWatcher): ChildRecord {
  return {
    formatVersion:         CHILD_RECORD_FORMAT_VERSION,
    childId:               childIdOf(childFolder, instance),
    kind:                  spawned.kind,
    label:                 spawned.label,
    workingDirectory:      spawned.workingDirectory,
    talosStartNumber:      WATCHER_TALOS_START_NUMBER,
    talos:                 spawned.watcher,
    state:                 'starting',
    childProcess:          null,
    childProcessGroupId:   null,
    eventLogFormatVersion: EVENT_LOG_FORMAT_VERSION,
    timeBoundMilliseconds: null,
    recognisedEndings:     [],
    end:                   null,
  };
}

export function createWatcherBoardChildren(facts: WatcherBoardChildrenFacts): WatcherBoardChildren {
  const ports = facts.platformPorts;
  const spawnedWatchers = new Map<string, SpawnedWatcher>();

  function launchedFactsOf(childFolder: string, instance: number): Omit<SpawnedWatcher, 'watcher'> {
    const reading = readWatcherLaunch(watcherFilesOf(childFolder, instance).launchPath, ports.localEndpoint);
    if (reading.verdict !== 'read') return { kind: 'agent', label: basename(childFolder), workingDirectory: childFolder };
    const { launch } = reading;
    return { kind: launch.kind === 'process' ? 'line' : 'agent', label: launch.jobId, workingDirectory: launch.workingDirectory };
  }

  function livenessOf(childFolder: string, instance: number): ChildLiveness {
    const liveness = WatcherFleet.livenessOf(ports, childFolder, instance);
    switch (liveness.verdict) {
      case 'unclaimed':
        return { verdict: 'unlaunched' };
      case 'ended':
        return { verdict: 'ended', end: childEndOf(liveness.end) };
      case 'lost':
        return liveness;
      default:
        return { verdict: 'live', state: WatcherFleet.watcherRecordOf(childFolder, instance)?.state === 'running' ? 'running' : 'starting' };
    }
  }

  function rememberSpawn(childFolder: string, instance: number, spawned: Omit<SpawnedWatcher, 'watcher'>, processId: number | undefined): void {
    const watcher = processId === undefined ? null : ports.processSupervision.identityOf(processId);
    spawnedWatchers.set(childIdOf(childFolder, instance), { ...spawned, watcher });
  }

  async function sendFrames(childFolder: string, instance: number, frames: readonly ActingFrame[]): Promise<boolean> {
    return await WatcherFleet.sendFrames(ports, childFolder, instance, frames);
  }

  return Object.freeze<WatcherBoardChildren>({
    beginPass:   () => undefined,
    jobFolderOf: (jobId) => WatcherFleet.jobFolderOf(facts.trackerDirectory, jobId),
    livenessOf,
    recordOf:    (childFolder, instance) => {
      const record = WatcherFleet.watcherRecordOf(childFolder, instance);
      if (record !== null) return childRecordOf(childFolder, instance, record, launchedFactsOf(childFolder, instance));
      const spawned = spawnedWatchers.get(childIdOf(childFolder, instance));
      return spawned === undefined ? null : startingRecordOf(childFolder, instance, spawned);
    },
    newestInstanceIn: (childFolder) => {
      const instances = WatcherFleet.claimedInstancesIn(childFolder);
      return instances.length === 0 ? null : Math.max(...instances);
    },
    eventsAfter:         (childFolder, instance, afterSequence) => WatcherFleet.eventsAfter(childFolder, instance, afterSequence),
    recognisedEndingsOf: () => [],
    launchAgent:         (request) => {
      const { launching } = facts;
      if (launching === null) return Promise.resolve({ verdict: 'talos-unavailable' });
      WatcherFleet.writeLaunchFiles(ports, {
        jobFolder:          request.childFolder,
        instance:           request.instance,
        jobId:              request.label,
        trackerId:          launching.trackerId,
        monitorFolder:      launching.monitorFolder,
        watcherCodeVersion: launching.codeVersion,
        workingDirectory:   request.workingDirectory,
        plan:               request.plan,
        ...(request.treeStopAtEndGraceMilliseconds === null ? {} : { treeStopAtEndGraceMilliseconds: request.treeStopAtEndGraceMilliseconds }),
      });
      const processId = (launching.processStarts ?? REAL_PROCESS_STARTS).spawnWatcher(ports, {
        bundlePath: launching.watcherBundlePath, jobFolder: request.childFolder, instance: request.instance, rootDirectory: launching.watcherDirectory
      });
      rememberSpawn(request.childFolder, request.instance, { kind: 'agent', label: request.label, workingDirectory: request.workingDirectory }, processId);
      return Promise.resolve({ verdict: 'launched' });
    },
    launchLine: (request) => {
      const { launching } = facts;
      if (launching === null) return Promise.resolve({ verdict: 'talos-unavailable' });
      WatcherFleet.writeProcessLaunchFile(ports, {
        watcherFolder:      request.childFolder,
        instance:           request.instance,
        jobId:              basename(dirname(request.childFolder)),
        socketName:         request.label,
        trackerId:          launching.trackerId,
        monitorFolder:      launching.monitorFolder,
        watcherCodeVersion: launching.codeVersion,
        workingDirectory:   request.workingDirectory,
        argv:               request.argv,
        ...(request.verbatimArguments ? { verbatimArguments: true } : {}),
        environment:        request.environment,
      });
      const processId = (launching.processStarts ?? REAL_PROCESS_STARTS).spawnWatcher(ports, {
        bundlePath: launching.watcherBundlePath, jobFolder: request.childFolder, instance: request.instance, rootDirectory: launching.watcherDirectory
      });
      rememberSpawn(request.childFolder, request.instance, { kind: 'line', label: request.label, workingDirectory: request.workingDirectory }, processId);
      return Promise.resolve({ verdict: 'launched' });
    },
    sendInput:     async (childFolder, instance, input) => await sendFrames(childFolder, instance, [actingFrameOf(input)]),
    sendInputOnce: async (markerPath, childFolder, instance, inputs) => {
      return await WatcherFleet.sendFramesOnce(ports, markerPath, childFolder, instance, inputs.map(actingFrameOf));
    },
    stop:          async (childFolder, instance, graceMilliseconds) => await sendFrames(childFolder, instance, [{ kind: 'stop', graceMilliseconds }]),
    stopLiveLines: async () => {
      const stoppedWatchers = await WatcherFleet.stopLiveProcessWatchers(ports, facts.trackerDirectory);
      facts.log(`Stopped ${stoppedWatchers} live process Watcher${stoppedWatchers === 1 ? '' : 's'}.`);
      return true;
    },
    reapEndedWatchers: async () => await WatcherFleet.reapEndedWatchers(ports, facts.trackerDirectory),
  });
}
