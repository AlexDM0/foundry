/**
 * What Hephaestus logs, as typed records: ids, numbers, codes, paths and stored-file problems, never a sentence. `HephaestusLogWordingUtil`
 * words each kind and gives its stored line in `hephaestus.log`. It lives in `src/adapters/`, as the problems it carries do.
 */
import type { GitProblem, WorktreeRemovalProblem }      from '../../lib/git/@types/GitProblem.ts';
import type { FrameRefusalReason }                      from '../../lib/talos/@types/TalosFrame.ts';
import type { TalosState }                              from '../../lib/talos/TalosRecord.ts';
import type { GatePhase }                               from '../../lib/tracker-model/@types/GatePhase.ts';
import type { InterruptionCause, JobKind, StartOrigin } from '../../lib/tracker-model/@types/Job.ts';
import type { ConfinementRefusal }                      from '../../shared/@types/ConfinementRefusal.ts';
import type { AgentSlotProblem }                        from '../agent-slot/@types/AgentSlotProblem.ts';
import type { CrashedComponent }                        from '../crash-log/@types/CrashLogRecord.ts';
import type { MergedTreeGate }                          from '../gate-outcome/@types/MergedTreeGate.ts';
import type { MergedTreeGateOutcomeProblem }            from '../gate-outcome/@types/MergedTreeGateOutcomeProblem.ts';
import type { GateProfileOutputProblem }                from '../gate-profile-output/@types/GateProfileOutputProblem.ts';
import type { GateRunSlotProblem }                      from '../gate-run-slot/@types/GateRunSlotProblem.ts';
import type { GenerationRecordProblem }                 from '../generation-record/@types/GenerationRecordProblem.ts';
import type { HeartbeatProblem }                        from '../heartbeat/@types/HeartbeatProblem.ts';
import type { HephaestusLockProblem }                   from '../hephaestus-lock/@types/HephaestusLockProblem.ts';
import type { PresenceProblem }                         from '../presence/@types/PresenceProblem.ts';
import type { AbandonedPassReason }                     from '../presence/@types/PresenceRecord.ts';
import type { SeenHeadProblem }                         from '../seen-head/@types/SeenHeadProblem.ts';
import type { UsageMarkerProblem }                      from '../usage-marker/@types/UsageMarkerProblem.ts';
import type { WorktreeCreationFailure }                 from '../worktree-failure/@types/WorktreeCreationFailure.ts';
import type { UnreadableFileProblem }                   from './UnreadableFileProblem.ts';

/** Why a stale lock or slot was taken over: the process it names is gone, or it could not be read. */
export type StaleHoldingReason<Problem> =
  | { readonly kind: 'holder-gone'; readonly processId: number }
  | { readonly kind: 'unreadable'; readonly problem: Problem };

/** Why a stale agent slot was taken over. */
export type StaleAgentSlotReason =
  | { readonly kind: 'unreadable'; readonly problem: AgentSlotProblem }
  | { readonly kind: 'names-no-hephaestus' }
  | { readonly kind: 'hephaestus-gone'; readonly processId: number };

/** Why a stale gate run slot was taken over. */
export type StaleGateRunSlotReason =
  | { readonly kind: 'unreadable'; readonly problem: GateRunSlotProblem }
  | { readonly kind: 'holder-not-live'; readonly holder: string };

/** Why a job's tool call guard cannot start: Hephaestus's command fails `GuardCommand`, or its command is not an absolute runtime path. */
export type UnstartableGuardReason =
  | { readonly kind:         'command-refused';
    readonly part:           'runtime' | 'entry-script';
    readonly cause:          'missing' | 'inside-repository';
    readonly path:           string | null;
    readonly repositoryRoot: string }
  | { readonly kind: 'not-an-absolute-runtime-path' };

type TalosNumbered = { readonly talosStartNumber: number };

/** The job a launch record is about, by its id and its ticket. */
type JobNamed = { readonly jobId: string; readonly ticketId: string };

/** The merged-tree gate run a record is about, by its worktree, tree and phase. */
type MergedTreeGateRunNamed = { readonly worktreePath: string; readonly treeId: string; readonly phase: GatePhase };

/** The child instance a launch record is about, with its job's kind and tickets. */
type LaunchedChildNamed = { readonly jobId: string; readonly childInstance: number; readonly jobKind: JobKind; readonly ticketIds: readonly string[] };

export type HephaestusLogRecord =
  // The serving process: its start, its Talos, its commands and its end.
  | { readonly kind:         'hephaestus-serving';
    readonly url:            string;
    readonly generation:     number;
    readonly codeVersion:    string;
    readonly installVersion: number;
    readonly agentVendor:    string }
  | { readonly kind: 'stop-signal-received' }
  | { readonly kind: 'runtime-command-received'; readonly command: 'hephaestus-stop' | 'hephaestus-restart' | 'talos-restart'; readonly now: boolean }
  | { readonly kind: 'talos-asked-to-quit-for-restart'; readonly talosStartNumber: number | null; readonly outcome: 'done' | 'nothing-to-do' }
  | { readonly kind: 'board-state-unreadable-for-event-stream'; readonly thrownMessage: string }
  | { readonly kind: 'restart-refused'; readonly step: string; readonly restartError: string }
  | { readonly kind: 'handover-started'; readonly generation: number }
  | { readonly kind: 'released-to-successor' }
  | { readonly kind: 'successor-started'; readonly processId: number }
  | { readonly kind: 'successor-could-not-serve'; readonly predecessorGeneration: number; readonly errorMessage: string }
  | { readonly kind: 'stop-wait-failed-late'; readonly waitName: string; readonly thrownMessage: string }
  | { readonly kind: 'stop-wait-cut-short'; readonly waitName: string; readonly boundMilliseconds: number }
  | { readonly kind: 'crashed-staying-off' }
  | { readonly kind: 'taken-over-stopping' }
  | { readonly kind: 'hephaestus-stopped' }
  | { readonly kind:            'staying-off-after-crash';
    readonly crashedGeneration: number | null;
    readonly suspected:         boolean;
    readonly startOrigin:       StartOrigin;
    readonly crashLogPath:      string }
  // Talos, as Hephaestus finds, starts and loses it.
  | { readonly kind: 'talos-started'; readonly talosStartNumber: number; readonly previousTalos: 'none' | 'quit' | 'lost'; readonly sweptOrphans: number }
  | { readonly kind: 'talos-attached' } & TalosNumbered
  | { readonly kind: 'talos-connection-closed' } & TalosNumbered
  | { readonly kind: 'no-talos-serves'; readonly reason: 'talos-protocol-differs' | 'endpoint-does-not-fit' | 'start-refused' | 'not-serving' }
  | { readonly kind: 'talos-stopped-after-quit-wait' } & TalosNumbered
  | { readonly kind: 'talos-lost'; readonly talosStartNumber: number; readonly sweptOrphans: number }
  | { readonly kind: 'talos-endpoint-does-not-fit'; readonly talosStartNumber: number; readonly endpoint: string }
  | { readonly kind: 'talos-did-not-serve'; readonly talosStartNumber: number; readonly recordState: TalosState | null }
  | { readonly kind: 'talos-protocol-differs'; readonly talosStartNumber: number; readonly protocolVersion: number }
  | { readonly kind: 'talos-did-not-welcome'; readonly talosStartNumber: number; readonly answer: 'refused' | 'silent' }
  | { readonly kind: 'lost-cause-unreadable'; readonly lostCausePath: string; readonly storedText: string }
  | { readonly kind: 'lost-child-stop-refused'; readonly childFolder: string; readonly instance: number; readonly talosStartNumber: number }
  // A crash, as the crash path records it.
  | { readonly kind:       'crashed';
    readonly component:    CrashedComponent;
    readonly generation:   number;
    readonly crashLogPath: string | null;
    readonly crashLog:     'written' | 'already-written' | 'not-written' }
  | { readonly kind: 'crash-log-leaves-out-presence'; readonly generation: number; readonly problem: PresenceProblem }
  | { readonly kind: 'crash-log-leaves-out-heartbeat'; readonly generation: number; readonly problem: HeartbeatProblem }
  | { readonly kind: 'crash-log-unwritten'; readonly generation: number; readonly thrownMessage: string }
  | { readonly kind: 'crashed-ending-unwritten'; readonly generation: number; readonly thrownMessage: string }
  | { readonly kind: 'lease-renewal-unstoppable'; readonly thrownMessage: string }
  | { readonly kind: 'registry-crash-unwritten'; readonly thrownMessage: string }
  // Files Hephaestus reads, and the locks and slots it takes over.
  | { readonly kind: 'board-file-unreadable'; readonly file: string; readonly problem: UnreadableFileProblem }
  | { readonly kind: 'heartbeat-unreadable-rewritten'; readonly problem: HeartbeatProblem }
  | { readonly kind: 'heartbeat-unreadable-at-start'; readonly problem: HeartbeatProblem }
  | { readonly kind: 'stale-lock-record-taken-over'; readonly recordPath: string; readonly reason: StaleHoldingReason<GenerationRecordProblem> }
  | { readonly kind:                 'stale-hephaestus-lock-taken-over';
    readonly generation:             number;
    readonly hephaestusLockFilePath: string;
    /** A `null` problem is a lock removed between the listing and its read, so nothing says why. */
    readonly reason:                 StaleHoldingReason<HephaestusLockProblem | null> }
  | { readonly kind: 'agent-slot-taken-over'; readonly slotPath: string; readonly reason: StaleAgentSlotReason }
  | { readonly kind: 'agent-slot-unreadable'; readonly slotPath: string; readonly problem: AgentSlotProblem }
  | { readonly kind: 'gate-run-slot-taken-over'; readonly slotPath: string; readonly reason: StaleGateRunSlotReason }
  | { readonly kind: 'gate-run-slot-unreadable'; readonly slotPath: string; readonly problem: GateRunSlotProblem }
  // The gates beside the pass: merged-tree gate runs, gate profiles and pipeline checks, and the lease renewal.
  | { readonly kind: 'merged-tree-gate-started' } & MergedTreeGateRunNamed
  | { readonly kind: 'merged-tree-gate-kept-outcome-unreadable'; readonly problem: MergedTreeGateOutcomeProblem } & MergedTreeGateRunNamed
  | { readonly kind: 'merged-tree-gate-ended'; readonly outcome: MergedTreeGate['outcome'] } & MergedTreeGateRunNamed
  | { readonly kind: 'merged-tree-gate-ended-without-outcome'; readonly thrownMessage: string } & MergedTreeGateRunNamed
  | { readonly kind: 'merged-tree-gate-stopped-while-running' } & MergedTreeGateRunNamed
  | { readonly kind: 'merged-tree-gate-run-folder-removed'; readonly runFolderName: string; readonly problem: MergedTreeGateOutcomeProblem }
  | { readonly kind: 'gate-profile-failed'; readonly profileRunId: string; readonly thrownMessage: string }
  | { readonly kind: 'gate-profile-worktree-left-over'; readonly worktreePath: string; readonly problem: WorktreeRemovalProblem }
  | { readonly kind: 'gate-profile-output-unreadable'; readonly outputFilePath: string; readonly problem: GateProfileOutputProblem }
  | { readonly kind: 'gate-profile-output-line-unreadable'; readonly outputFilePath: string; readonly lineNumber: number; readonly problem: GateProfileOutputProblem }
  | { readonly kind: 'pipeline-check-failed'; readonly setupId: string; readonly thrownMessage: string }
  | { readonly kind: 'pipeline-check-worktree-left-over'; readonly worktreePath: string; readonly problem: WorktreeRemovalProblem }
  | { readonly kind: 'lease-renewal-without-connection' }
  | { readonly kind: 'lease-renewal-unanswered' }
  | { readonly kind: 'lease-renewal-refused'; readonly reason: FrameRefusalReason }
  | { readonly kind: 'lease-renewal-withheld'; readonly passNumber: number }
  // The drive pass: what it observes, the sessions it launches and how a pass ends.
  | { readonly kind: 'child-event-log-malformed'; readonly jobId: string; readonly childInstance: number }
  | { readonly kind: 'usage-marker-malformed'; readonly markerPath: string; readonly problem: UsageMarkerProblem }
  | { readonly kind: 'session-confinement-refused'; readonly jobId: string; readonly confinementRefusal: ConfinementRefusal }
  | { readonly kind: 'tool-left-off-search-path'; readonly toolName: string; readonly jobId: string; readonly toolPath: string; readonly forbiddenRoot: string }
  | { readonly kind: 'job-file-unreadable-at-launch'; readonly jobId: string; readonly file: string; readonly problem: UnreadableFileProblem }
  | { readonly kind: 'pipeline-agent-awaits-billing'; readonly jobId: string }
  | { readonly kind: 'airlock-agent-root-unmade'; readonly jobId: string; readonly sandboxRefusal: string }
  | { readonly kind: 'airlock-agent-conflicts-unknown'; readonly jobId: string }
  | { readonly kind: 'commits-unsigned-despite-signing'; readonly jobId: string }
  /** A `null` Talos refusal is a launch no Talos took. */
  | { readonly kind: 'child-instance-not-launched'; readonly talosRefusal: FrameRefusalReason | null } & LaunchedChildNamed
  | { readonly kind: 'child-instance-launched' } & LaunchedChildNamed
  | { readonly kind: 'cleanup-declined'; readonly cleanup: 'refresh' | 'release'; readonly groupBranch: string; readonly problem: GitProblem }
  | { readonly kind: 'presence-unrecorded'; readonly thrownMessage: string }
  | { readonly kind: 'pass-abandoned'; readonly reason: AbandonedPassReason; readonly refusalMessage: string }
  | { readonly kind: 'pass-crashed'; readonly thrownMessage: string }
  | { readonly kind: 'pass-crash-path-threw'; readonly thrownMessage: string }
  | { readonly kind: 'child-instance-lost'; readonly jobId: string; readonly childInstance: number; readonly cause: InterruptionCause }
  // A job's launch, its lines and its worktree, and the document and pipeline agent sessions.
  | { readonly kind: 'gate-red'; readonly gate: string; readonly treeId: string; readonly outputFile: string } & JobNamed
  | { readonly kind: 'guard-cannot-start'; readonly guard: 'network' | 'stage-edits'; readonly reason: UnstartableGuardReason } & JobNamed
  /** `sandboxRefusal` is the reason the job's `sandbox-refusal.json` keeps. */
  | { readonly kind: 'line-refused'; readonly step: string; readonly sandboxRefusal: string } & JobNamed
  /** A `null` confinement is a line unconfined by design. */
  | { readonly kind: 'line-launched'; readonly step: string; readonly instance: number; readonly confinement: string | null } & JobNamed
  /** A `null` Talos refusal is a launch no Talos took. */
  | { readonly kind: 'line-not-launched'; readonly jobId: string; readonly step: string; readonly instance: number; readonly talosRefusal: FrameRefusalReason | null }
  | { readonly kind: 'merge-line-launched'; readonly step: string; readonly mergedTip: string; readonly branch: string } & JobNamed
  | { readonly kind: 'fresh-worktree-differs'; readonly jobId: string; readonly changedFileCount: number }
  /** `failure` is what the job's worktree failure file keeps, worded. */
  | { readonly kind: 'worktree-creation-failed'; readonly jobId: string; readonly failure: WorktreeCreationFailure }
  | { readonly kind: 'seen-head-unreadable'; readonly seenHeadFilePath: string; readonly problem: SeenHeadProblem }
  | { readonly kind: 'document-agent-snapshot-left-over'; readonly snapshotPath: string; readonly problem: WorktreeRemovalProblem }
  | { readonly kind: 'pipeline-agent-snapshot-left-over'; readonly snapshotPath: string; readonly problem: WorktreeRemovalProblem };

export type HephaestusLogKind = HephaestusLogRecord['kind'];

/** Where Hephaestus logs: one record per event, worded and stored by the writer `hephaestusLoggerOf` (`cli/hephaestus/HephaestusForeground.ts`). */
export type HephaestusLog = (record: HephaestusLogRecord) => void;
