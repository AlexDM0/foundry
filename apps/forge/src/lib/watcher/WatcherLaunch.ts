/**
 * The launch file a Watcher reads once after its claim: what to run, where and with which environment. A Watcher pipes the child's stdin;
 * a process Watcher gives it none and answers nothing. Keys a later protocol adds are left unread.
 */
import { readFileSync } from 'node:fs';
import { isAbsolute }   from 'node:path';

import type { LocalEndpoint }                                          from '../talos/LocalEndpoint.ts';
import { type StandingReply, standingReplyOf }                         from '../talos/StandingReplies.ts';
import { WATCHER_PROTOCOL_OLDEST_SUPPORTED, WATCHER_PROTOCOL_VERSION } from './constants/WatcherProtocol.ts';

export type WatcherKind = 'agent' | 'process';

export interface WatcherLaunch {
  readonly kind:                            WatcherKind;
  /** Spawned directly, with no shell. */
  readonly argv:                            readonly string[];
  /** The child's whole environment: nothing of the Watcher's is inherited. */
  readonly environment:                     Readonly<Record<string, string>>;
  /**
   * Child variable to the name of the Watcher's own variable it copies at spawn, so a secret reaches the child and no launch file holds
   * it; a variable the Watcher does not hold is left out. Absent copies nothing.
   */
  readonly environmentFromWatcher?:         Readonly<Record<string, string>>;
  readonly workingDirectory:                string;
  readonly standingReplies:                 readonly StandingReply[];
  readonly protocolVersion:                 number;
  /** Named in `welcome`, so a client knows which job it reached. */
  readonly jobId:                           string;
  /** The code the Overseer pinned this Watcher to, recorded and named in `welcome`. */
  readonly watcherCodeVersion:              string;
  readonly socketPath:                      string;
  /** The owner-only file that holds what a client's `hello` must carry; no launch file holds the secret itself. */
  readonly secretFilePath:                  string;
  /** Hands argv to a Windows child unquoted, as a cmd.exe line needs; absent reads as `false`. */
  readonly verbatimArguments?:              boolean;
  /**
   * When set, the Watcher stops the groups of the child's last listing as it ends with no stop asked for, after this grace before each
   * stage; absent, a group the child left keeps running.
   */
  readonly treeStopAtEndGraceMilliseconds?: number;
}

export type WatcherLaunchReading =
  | { readonly verdict: 'read'; readonly launch: WatcherLaunch }
  | { readonly verdict: 'unreadable'; readonly reason: string };

const WATCHER_KINDS: readonly string[] = ['agent', 'process'] satisfies readonly WatcherKind[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isRecordOf(value: unknown, holdsItem: (item: unknown) => boolean): boolean {
  return isRecord(value) && Object.values(value).every(holdsItem);
}

export function watcherLaunchOf(launchText: string, endpoint: Pick<LocalEndpoint, 'endpointFits'>): WatcherLaunchReading {
  let parsed: unknown;
  try {
    parsed = JSON.parse(launchText);
  } catch (error) {
    return { verdict: 'unreadable', reason: `the launch file is not JSON: ${String(error)}` };
  }
  if (!isRecord(parsed)) return { verdict: 'unreadable', reason: 'the launch file is not a JSON object' };
  const {
    kind, argv, environment, workingDirectory, standingReplies, protocolVersion, jobId, watcherCodeVersion, socketPath, secretFilePath, verbatimArguments,
    treeStopAtEndGraceMilliseconds, environmentFromWatcher,
  } = parsed;
  if (environmentFromWatcher !== undefined && !isRecordOf(environmentFromWatcher, (item) => typeof item === 'string')) {
    return { verdict: 'unreadable', reason: 'environmentFromWatcher is not a record of strings' };
  }
  if (verbatimArguments !== undefined && typeof verbatimArguments !== 'boolean') return { verdict: 'unreadable', reason: 'verbatimArguments is not a boolean' };
  if (treeStopAtEndGraceMilliseconds !== undefined && !(typeof treeStopAtEndGraceMilliseconds === 'number' && treeStopAtEndGraceMilliseconds >= 0)) {
    return { verdict: 'unreadable', reason: 'treeStopAtEndGraceMilliseconds is not a number of milliseconds' };
  }
  if (typeof kind !== 'string' || !WATCHER_KINDS.includes(kind)) return { verdict: 'unreadable', reason: 'kind is neither agent nor process' };
  if (!isStringList(argv) || argv.length === 0) return { verdict: 'unreadable', reason: 'argv is not a non-empty list of strings' };
  if (!isRecordOf(environment, (item) => typeof item === 'string')) return { verdict: 'unreadable', reason: 'environment is not a record of strings' };
  if (typeof workingDirectory !== 'string') return { verdict: 'unreadable', reason: 'workingDirectory is not a string' };
  if (!Array.isArray(standingReplies) || !standingReplies.every((rule) => standingReplyOf(rule) !== null)) {
    return { verdict: 'unreadable', reason: 'standingReplies is not a list of rules' };
  }
  // An Overseer reads the launch file of a live Watcher of an older protocol to reach it.
  if (typeof protocolVersion !== 'number' || protocolVersion < WATCHER_PROTOCOL_OLDEST_SUPPORTED || protocolVersion > WATCHER_PROTOCOL_VERSION) {
    return { verdict: 'unreadable', reason: `protocolVersion ${String(protocolVersion)} is not from ${WATCHER_PROTOCOL_OLDEST_SUPPORTED} to ${WATCHER_PROTOCOL_VERSION}` };
  }
  if (typeof jobId !== 'string' || jobId === '') return { verdict: 'unreadable', reason: 'jobId is not a non-empty string' };
  if (typeof watcherCodeVersion !== 'string') return { verdict: 'unreadable', reason: 'watcherCodeVersion is not a string' };
  if (typeof socketPath !== 'string' || !isAbsolute(socketPath) || !endpoint.endpointFits(socketPath)) {
    return { verdict: 'unreadable', reason: 'socketPath is not an absolute path that fits this platform' };
  }
  if (typeof secretFilePath !== 'string' || !isAbsolute(secretFilePath)) return { verdict: 'unreadable', reason: 'secretFilePath is not an absolute path' };
  return {
    verdict: 'read',
    launch:  {
      kind:        kind as WatcherKind,
      argv,
      environment: environment as Record<string, string>,
      workingDirectory,
      standingReplies,
      protocolVersion,
      jobId,
      watcherCodeVersion,
      socketPath,
      secretFilePath,
      ...(verbatimArguments === true ? { verbatimArguments } : {}),
      ...(typeof treeStopAtEndGraceMilliseconds === 'number' ? { treeStopAtEndGraceMilliseconds } : {}),
      ...(environmentFromWatcher === undefined ? {} : { environmentFromWatcher: environmentFromWatcher as Record<string, string> }),
    },
  };
}

/** `null` when the file is absent, unreadable or empty: nobody can say `hello` with no secret. */
export function readWatcherSecret(secretFilePath: string): string | null {
  try {
    const secret = readFileSync(secretFilePath, 'utf8').trim();
    return secret === '' ? null : secret;
  } catch {
    return null;
  }
}

export function readWatcherLaunch(launchPath: string, endpoint: Pick<LocalEndpoint, 'endpointFits'>): WatcherLaunchReading {
  try {
    return watcherLaunchOf(readFileSync(launchPath, 'utf8'), endpoint);
  } catch (error) {
    return { verdict: 'unreadable', reason: `the launch file cannot be read: ${String(error)}` };
  }
}
