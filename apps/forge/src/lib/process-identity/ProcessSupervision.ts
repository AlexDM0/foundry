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

/**
 * `supervised-child` is a process a supervisor runs and watches, such as an agent session or a line; `detached-program` is a Bun program
 * started to outlive its parent.
 */
export type SupervisedChildKind = 'supervised-child' | 'detached-program';

/** Spread last over a spawn's own options, so `stderr` wins: a caller then reads the stream wherever it would have given a descriptor. */
export interface SupervisedSpawnOptions {
  readonly detached:     boolean;
  readonly windowsHide?: true;
  readonly stderr?:      'pipe';
}

export interface ProcessTreeMember {
  readonly processId:      number;
  readonly startStamp:     ProcessStartStamp;
  /** What a stop reaches this member through: its process group, or the member itself where a platform has none. */
  readonly processGroupId: number;
}

export type ProcessStopOutcome =
  | { verdict: 'signalled' }
  | { verdict: 'gone' }
  | { verdict: 'refused'; reason: string };

export interface ProcessSupervision {
  /** `null` for a process that does not exist, or whose start or boot cannot be read: an identity is never guessed. */
  readonly identityOf:                (processId: number) => ProcessIdentity | null;
  /** Where this platform reads that from, for a report that it could not; empty where it has no way to. */
  readonly identitySourcesOf:         (processId: number) => readonly string[];
  readonly sameProcess:               (first: ProcessIdentity, second: ProcessIdentity) => boolean;
  /** Only for two stamps of one reader; a stamp means nothing to another. */
  readonly startedBefore:             (firstStamp: ProcessStartStamp, secondStamp: ProcessStartStamp) => boolean;
  readonly processIsGone:             (processId: number) => boolean;
  /**
   * Every process of the tree the leader led and of its descendants' groups; `null` when they cannot be read. The descendants are found
   * through their parents, so a group whose parent died is found only through `earlierMembers`, this call's last answer, while a member
   * of it still lives: such a group's id cannot have been reused.
   */
  readonly treeMembersOf:             (leader: ProcessIdentity, earlierMembers?: readonly ProcessTreeMember[]) => readonly ProcessTreeMember[] | null;
  /**
   * The tree the recorded leader led: while the leader lives, only when it still is the recorded process; once it is gone, only while
   * the tree has members and none of them predates the leader. An empty or recycled tree is never stopped. `treeMembers` is what
   * `treeMembersOf` has just answered, and its other groups are stopped with the tree. A platform with no way to `ask` answers `no-ask-stage`
   * to that stage and stops nothing.
   */
  readonly stopTree:                  (leader: ProcessIdentity, stage: ProcessStopStage, treeMembers?: readonly ProcessTreeMember[]) => ProcessTreeStopOutcome;
  /** That one process alone; the caller has checked its identity. */
  readonly stopProcess:               (processId: number, stage: ProcessStopStage) => ProcessStopOutcome;
  readonly spawnOptionsFor:           (childKind: SupervisedChildKind) => SupervisedSpawnOptions;
  /** `forcedStopRan`: a `force` of the holder took effect before the child ended, for a platform whose runtime cannot report that kill. */
  readonly endOf:                     (child: { readonly exitCode: number | null; readonly signalCode: string | null; readonly forcedStopRan?: boolean }) => ChildEnd;
  /** Whether a stop that could not go through the API has to be `force`, where this platform has no way to `ask` from outside. */
  readonly fallbackStopIsForced:      boolean;
  /** Every signal this platform delivers to a process that a listener can take as a stop. */
  readonly stopSignals:               readonly NodeJS.Signals[];
  /** The epoch second the current boot started, as the system names it; `null` when it cannot be read: an answer is never guessed. */
  readonly bootStartedAtEpochSeconds: () => number | null;
}
