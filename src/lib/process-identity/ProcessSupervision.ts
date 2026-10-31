/**
 * The port for everything about a process that differs per operating system. `ask` is a graceful stop and `force` one that cannot be
 * declined. The unit is a tree, because a process group has no counterpart everywhere; a stop always answers a verdict.
 */
import type {
  ChildEnd,
  ProcessIdentity,
  ProcessStartStamp,
  ProcessTreeStopOutcome
} from './ProcessIdentity.ts';

export type ProcessStopStage = 'ask' | 'force';

/** `supervised-child` is the process a Watcher runs, `watcher` the Watcher itself, `overseer` an Overseer started in the background. */
export type SupervisedChildKind = 'supervised-child' | 'watcher' | 'overseer';

export interface SupervisedSpawnOptions {
  readonly detached: boolean;
}

export interface ProcessTreeMember {
  readonly processId:  number;
  readonly startStamp: ProcessStartStamp;
}

export type ProcessStopOutcome =
  | { verdict: 'signalled' }
  | { verdict: 'gone' }
  | { verdict: 'refused'; reason: string };

export interface ProcessSupervision {
  /** `null` for a process that does not exist, or whose start or boot cannot be read: an identity is never guessed. */
  readonly identityOf:           (processId: number) => ProcessIdentity | null;
  readonly sameProcess:          (first: ProcessIdentity, second: ProcessIdentity) => boolean;
  readonly startedBefore:        (firstStamp: ProcessStartStamp, secondStamp: ProcessStartStamp) => boolean;
  readonly processIsGone:        (processId: number) => boolean;
  /** Every process of the tree the leader led; `null` when they cannot be read. */
  readonly treeMembersOf:        (leader: ProcessIdentity) => readonly ProcessTreeMember[] | null;
  /**
   * The tree the recorded leader led: while the leader lives, only when it still is the recorded process; once it is gone, only while
   * the tree has members and none of them predates the leader. An empty or recycled tree is never stopped.
   */
  readonly stopTree:             (leader: ProcessIdentity, stage: ProcessStopStage) => ProcessTreeStopOutcome;
  /** That one process alone; the caller has checked its identity. */
  readonly stopProcess:          (processId: number, stage: ProcessStopStage) => ProcessStopOutcome;
  readonly spawnOptionsFor:      (childKind: SupervisedChildKind) => SupervisedSpawnOptions;
  readonly endOf:                (child: { readonly exitCode: number | null; readonly signalCode: string | null }) => ChildEnd;
  /** Whether a stop that could not go through the API has to be `force`, where this platform has no way to `ask` from outside. */
  readonly fallbackStopIsForced: boolean;
}
