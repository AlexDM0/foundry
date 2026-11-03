import { type ProcessIdentity, storedIdentityOf } from '../process-identity/ProcessIdentity.ts';

export type WatcherState = 'claimed' | 'running' | 'ended';

/** `exited` and `signalled` are the child's own end; the other three mean no child ever ran. */
export type WatcherEndReason = 'exited' | 'signalled' | 'launch-unreadable' | 'socket-unbindable' | 'spawn-failed';

export interface WatcherEnd {
  readonly reason:   WatcherEndReason;
  readonly exitCode: number | null;
  readonly signal:   string | null;
  /** Why no child ran; absent when one did. */
  readonly detail?:  string;
}

/**
 * `watcher-<instance>.json`: created exclusively as the claim, then replaced atomically as the child starts and ends. An identity is `null`
 * when it could not be read, such as a child gone before it was looked at.
 */
export interface WatcherRecord {
  readonly protocolVersion:       number;
  readonly eventLogFormatVersion: number;
  readonly watcherInstance:       number;
  readonly state:                 WatcherState;
  readonly watcher:               ProcessIdentity | null;
  /** Both known once the launch file is read. */
  readonly watcherCodeVersion?:   string;
  readonly socketPath?:           string;
  readonly childProcess?:         ProcessIdentity | null;
  /** The child's pid: its group's id on POSIX, and only the pid on Windows, where no group exists. */
  readonly childProcessGroupId?:  number;
  readonly end?:                  WatcherEnd;
}

export function watcherRecordTextOf(record: WatcherRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

/**
 * The parsed file with its identities as this code holds them: a live Watcher of an older protocol keeps its own field; `null` for no object.
 * A record naming no Watcher reads as one whose identity could not be read.
 */
export function watcherRecordOfStored(stored: unknown): WatcherRecord | null {
  if (typeof stored !== 'object' || stored === null) return null;
  return {
    ...stored as WatcherRecord,
    watcher: 'watcher' in stored ? storedIdentityOf(stored.watcher) : null,
    ...('childProcess' in stored ? { childProcess: storedIdentityOf(stored.childProcess) } : {}),
  };
}
