/**
 * A scratch job folder and monitor folder for specs that spawn the Watcher binary as the Overseer does: the launch file, the spawn and a client
 * attached with the job's secret. The monitor folder has a short scratch name of its own, so a socket path under a long temporary folder
 * stays inside the 104 bytes macOS allows. Test-only.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join }                                    from 'node:path';

import type { StandingReply }                             from '../lib/talos/StandingReplies.ts';
import { watcherFilesOf }                                 from '../lib/watcher/WatcherFiles.ts';
import type { WatcherKind, WatcherLaunch }                from '../lib/watcher/WatcherLaunch.ts';
import { WATCHER_PROTOCOL_VERSION }                       from '../lib/watcher/constants/WatcherProtocol.ts';
import { inheritedEnvironment }                           from './InheritedEnvironment.ts';
import { nativePlatformPorts }                            from './NativePlatformPorts.ts';
import { createScratchDirectory, removeScratchDirectory } from './ScratchWorkspace.ts';
import { firstValueOf }                                   from './WaitUntil.ts';
import { type WatcherProtocolClient, connectToWatcher }   from './WatcherProtocolClient.ts';

const WATCHER_BINARY_PATH = new URL('../../watcher.ts', import.meta.url).pathname;

export const WATCHER_JOB_SECRET = 'example-secret';
export const WATCHER_JOB_IDENTIFIER = 'J-1';
export const WATCHER_JOB_CODE_VERSION = 'code-example';

export type SpawnedWatcher = Bun.Subprocess<'ignore', 'pipe', 'pipe'>;

export interface WatcherJob {
  readonly jobFolder:       string;
  readonly monitorFolder:   string;
  readonly socketPathOf:    (instance: number) => string;
  readonly writeLaunchFile: (instance: number, kind: WatcherKind, argv: readonly string[], standingReplies?: readonly StandingReply[], launchKeys?: Partial<WatcherLaunch>) => void;
  /** A launch whose child is `bun -e <childScript>`. */
  readonly writeLaunch:     (instance: number, kind: WatcherKind, childScript: string, standingReplies?: readonly StandingReply[], launchKeys?: Partial<WatcherLaunch>) => void;
  /** `ownVariables` are added to the spec run's environment, which the Watcher inherits. */
  readonly spawnWatcher:    (instance: number, ownVariables?: Readonly<Record<string, string>>) => SpawnedWatcher;
  /** Connected, with `hello` sent from the given cursor and the job's secret. */
  readonly attach:          (instance: number, sinceSequence?: number) => Promise<WatcherProtocolClient>;
  /** The Watcher's exit code within the wait budget; a Watcher that does not exit fails the case with its log and record. */
  readonly exitCodeOf:      (watcher: SpawnedWatcher, instance: number) => Promise<number>;
  readonly remove:          () => void;
}

function textOrAbsence(filePath: string): string {
  return existsSync(filePath) ? JSON.stringify(readFileSync(filePath, 'utf8')) : 'absent';
}

export function createWatcherJob(): WatcherJob {
  const jobFolder = createScratchDirectory('watcher');
  const monitorFolder = createScratchDirectory('h');
  const socketPaths = new Map<number, string>();
  // An adapter may draw a new endpoint each call, so one instance keeps the first it was answered, as a launch does.
  const socketPathOf = (instance: number): string => {
    const socketPath = socketPaths.get(instance) ?? nativePlatformPorts().localEndpoint.endpointOf({
      monitorFolder, trackerId: 'tracker-example', name: WATCHER_JOB_IDENTIFIER, instance
    });
    socketPaths.set(instance, socketPath);
    return socketPath;
  };
  const writeLaunchFile: WatcherJob['writeLaunchFile'] = (instance, kind, argv, standingReplies = [], launchKeys = {}) => {
    const secretFilePath = join(monitorFolder, `secret-${instance}`);
    const launch = {
      kind,
      argv,
      environment:        {},
      workingDirectory:   jobFolder,
      standingReplies,
      protocolVersion:    WATCHER_PROTOCOL_VERSION,
      jobId:              WATCHER_JOB_IDENTIFIER,
      watcherCodeVersion: WATCHER_JOB_CODE_VERSION,
      socketPath:         socketPathOf(instance),
      secretFilePath,
      ...launchKeys,
    };
    writeFileSync(secretFilePath, WATCHER_JOB_SECRET);
    writeFileSync(watcherFilesOf(jobFolder, instance).launchPath, JSON.stringify(launch));
  };
  return {
    jobFolder,
    monitorFolder,
    socketPathOf,
    writeLaunchFile,
    writeLaunch: (instance, kind, childScript, standingReplies = [], launchKeys = {}) => {
      writeLaunchFile(instance, kind, [process.execPath, '-e', childScript], standingReplies, launchKeys);
    },
    spawnWatcher: (instance, ownVariables = {}) => Bun.spawn([process.execPath, WATCHER_BINARY_PATH, jobFolder, String(instance)], {
      stdin: 'ignore', stdout: 'pipe', stderr: 'pipe', env: { ...inheritedEnvironment(), ...ownVariables }
    }),
    attach: async (instance, sinceSequence = 0) => {
      const client = await connectToWatcher(socketPathOf(instance));
      client.send({
        kind: 'hello', protocolVersion: WATCHER_PROTOCOL_VERSION, sinceSequence, watcherSecret: WATCHER_JOB_SECRET
      });
      return client;
    },
    exitCodeOf: (watcher, instance) => {
      // `exitCode` stays null for a Watcher a signal ended; `exited` answers for both.
      let exitCode: number | undefined;
      void watcher.exited.then((code) => {
        exitCode = code;
      });
      return firstValueOf(() => exitCode, () => {
        const { watcherLogPath, watcherRecordPath } = watcherFilesOf(jobFolder, instance);
        return `the Watcher exiting; its log: ${textOrAbsence(watcherLogPath)}; its record: ${textOrAbsence(watcherRecordPath)}`;
      });
    },
    remove: () => {
      removeScratchDirectory(jobFolder);
      removeScratchDirectory(monitorFolder);
    },
  };
}
