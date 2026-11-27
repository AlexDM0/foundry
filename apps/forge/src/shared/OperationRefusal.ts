/**
 * The typed refusal library code throws instead of exiting, since nothing under `src/` calls `process.exit`: `cli/Main.ts` maps
 * `refused` to exit 1, a refusal the caller can act on, and `unrepaired` to exit 2, a state the tool will not repair on its own. A refusal
 * thrown from `src/` carries a detail, a reason code with its facts and no words, that the command line words; only `cli/` builds one from words.
 */
import type { ExecutableRefusal }         from '../lib/executable-resolver/ExecutableResolver.ts';
import type { ConfinementUnavailability } from '../lib/gate-confinement/GateConfinement.ts';
import type {
  GitRunFailure,
  MergePredictionProblem,
  WorktreeRemovalProblem,
  WorktreeStepProblem
} from '../lib/git/@types/GitProblem.ts';
import type { OwnerOnlyRefusalCause }          from '../lib/owner-only-files/OwnerOnlyFiles.ts';
import type { PipelineProblem }                from '../lib/tracker-model/@types/PipelineProblem.ts';
import type { MainConstitutionProblem }        from '../lib/tracker-model/@types/PipelineSetup.ts';
import type { TicketDocumentKind }             from '../lib/tracker-model/@types/TicketDocument.ts';
import type { BoardRefusalDetail }             from '../lib/tracker-model/BoardRefusal.ts';
import type { AgentProgramRefusalCause }       from './@types/AgentProgramCheck.ts';
import type { HoldJournalProblem }             from './@types/HoldJournalProblem.ts';
import type { InstallVersionMismatch }         from './@types/InstallVersionMismatch.ts';
import type { MachineConfigUnwritableProblem } from './@types/MachineConfigProblem.ts';
import type { MergeUpdateProblem }             from './@types/MergeUpdateProblem.ts';
import type { RoleCommandRefusalReason }       from './@types/RoleCommandRefusalReason.ts';
import type { UnreadableTicketProblem }        from './@types/UnreadableTicketProblem.ts';
import type { UnreadableTracker }              from './@types/UnreadableTracker.ts';
import type { BranchNamespaceRefusal }         from './BranchNames.ts';

export type OperationRefusalStatus = 'refused' | 'unrepaired';

export type OperationRefusalDetail =
  | { kind: 'board-refusal'; boardRefusal: BoardRefusalDetail }
  | { kind: 'unreadable-tracker'; reading: UnreadableTracker }
  | { kind: 'no-tracker-at-override'; overrideDirectory: string }
  | { kind: 'no-tracker-found'; searchedFrom: string }
  | { kind: 'tracker-lock-held'; lockDirectoryPath: string }
  | { kind: 'lock-taken-over'; lockDirectoryPath: string }
  | { kind: 'malformed-hold-journal'; journalFilePath: string; problem: HoldJournalProblem }
  | { kind: 'hold-journal-unremovable'; journalFilePath: string; systemError: string }
  | { kind: 'install-version-mismatch'; rootDirectory: string; manifestFilePath: string; installVersion: number; mismatch: InstallVersionMismatch }
  | { kind: 'no-readable-ticket'; reference: string }
  | { kind: 'malformed-ticket-file'; filePath: string; line: number; problem: UnreadableTicketProblem }
  | { kind: 'unreadable-file-in-the-way'; filePath: string; record: 'epic' | 'draft' | 'ticket-documents' }
  | { kind: 'malformed-pipeline'; filePath: string; problem: PipelineProblem }
  | { kind: 'older-pipeline'; filePath: string }
  | { kind: 'entities-in-a-folder'; filePath: string; projectPrefix: string }
  | { kind: 'role-command-refused'; reason: RoleCommandRefusalReason; commandKind: string }
  | { kind: 'verb-not-relayable'; verb: string; jobId: string }
  | { kind: 'malformed-hatch-reply'; replyFilePath: string }
  | { kind: 'hephaestus-already-running'; url: string; hephaestusLockFilePath: string }
  | { kind: 'hephaestus-down'; hephaestusDirectory: string }
  | { kind: 'hephaestus-contended'; hephaestusDirectory: string }
  | { kind: 'gate-confinement-unavailable'; unavailability: ConfinementUnavailability }
  | { kind: 'malformed-hephaestus-poll-interval'; variable: string; value: string }
  | { kind: 'malformed-versions-answer'; variable: string; value: string }
  /** `foundVersion` is `null` when no git started or it printed no version. */
  | { kind: 'git-below-floor'; foundVersion: string | null; floorVersion: string }
  | { kind: 'hephaestus-lock-taken'; hephaestusLockFilePath: string }
  | { kind: 'hephaestus-lock-not-created-whole'; hephaestusLockFilePath: string; systemError: string }
  | { kind: 'hephaestus-port-in-use'; firstPort: number; lastPort: number }
  | { kind: 'hephaestus-identity-unreadable'; processId: number; identitySources: readonly string[] }
  | { kind: 'hephaestus-did-not-start'; exitCode: number | null; logFilePath: string }
  | { kind: 'hephaestus-still-live'; url: string; processId: number }
  | { kind: 'restart-failed'; successorCodeVersion: string; step: string; error: string; url: string | null }
  | { kind: 'hephaestus-control-is-runtime-only'; commandKind: string }
  | { kind: 'intake-close-without-job' }
  | { kind: 'intake-title-without-job' }
  | { kind: 'question-options-without-job' }
  | { kind: 'need-declare-without-job' }
  /** A setup command whose `field` is missing or not of its shape; `field` names it as the body does, as `edits[0].value`. */
  | { kind: 'malformed-setup-command'; commandKind: string; field: string }
  /** `problem` is null when the draft is of an older version. */
  | { kind: 'pipeline-draft-invalid'; setupId: string; problem: PipelineProblem | null }
  /**
   * A copy to another entity on a draft that has no entities, or with edits outside an entity: `fields` names those edits' fields, none when
   * the draft has no entities.
   */
  | { kind: 'draft-copy-outside-entities'; setupId: string; fields: readonly string[] }
  /** Git could not tell what main's `CONSTITUTION.md` holds. */
  | { kind: 'main-constitution-unreadable'; problem: MainConstitutionProblem }
  /**
   * A chosen agent program that does not run is not kept; `agentName` is the agent's name as a person knows it, `outputLine` the first line
   * a failed run printed.
   */
  | { kind: 'agent-program-does-not-run'; cause: AgentProgramRefusalCause; programPath: string | null; agentName: string; outputLine?: string }
  /** A tool named alone that none of `searchedFolders` holds. */
  | { kind: 'tool-not-found'; name: string; searchedFolders: readonly string[] }
  /** A tool named with its path that is no program to keep, such as one inside a repository a job could write; `reason` is the resolver's. */
  | { kind: 'tool-refused'; name: string; refusal: ExecutableRefusal }
  /** This machine's config that is newer or malformed is never written over. */
  | { kind: 'machine-config-unwritable'; filePath: string; problem: MachineConfigUnwritableProblem }
  | { kind: 'picture-unknown'; pictureId: string }
  | { kind: 'too-many-pictures'; pictureCount: number; limit: number }
  | { kind: 'picture-too-large'; bytes: number; sizeLimitBytes: number }
  | { kind: 'picture-type-unsupported'; mediaTypes: readonly string[] }
  | { kind: 'path-not-owner-only'; path: string; cause: OwnerOnlyRefusalCause }
  | { kind: 'hephaestus-owns-the-lifecycle'; url: string; hephaestusLockFilePath: string }
  /** The Talos this Hephaestus started answers another protocol version, so no Talos starts again while it lives. */
  | { kind: 'talos-protocol-differs'; requiredProtocolVersion: number; answeredProtocolVersion: number }
  /** The Talos this Hephaestus started never served: its endpoint does not fit, it refused its start, or it stayed silent. */
  | { kind: 'talos-unavailable'; reason: 'endpoint-does-not-fit' | 'start-refused' | 'not-serving'; startNumber: number }
  /** The forge crashed while serving (Hephaestus, or its Talos lost), wrote its crash log (`null`: it could not) and stays off until started. */
  | { kind: 'forge-crashed'; component: 'hephaestus' | 'talos'; crashLogPath: string | null }
  /** A start after a crash, or one suspected before a reboot, that the user did not make: it took no lock and stays off. `null`: no lock named it. */
  | { kind: 'forge-off-after-crash'; crashedGeneration: number | null; crashLogPath: string; suspected: boolean }
  /** No crash log of that number, or none at all when `number` is `null`. */
  | { kind: 'no-crash-log'; number: number | null }
  | { kind: 'ticket-has-live-job'; ticketId: string; jobId: string; state: string }
  /** Git's prediction of `merge accept`'s merge into the target's tip; `gitReason` is git's own. */
  | { kind: 'merge-accept-would-conflict'; ticketId: string; target: string; conflictedFiles: readonly string[] }
  | { kind: 'merge-accept-prediction-failed'; ticketId: string; target: string; problem: MergePredictionProblem }
  | { kind: 'merge-update-failed'; ticketId: string; target: string; problem: MergeUpdateProblem }
  /** A repair or Airlock move named no incident, and its subject has none, or several, of the open ones the Bouncer lets it handle. */
  | { kind: 'no-open-incident'; subject: string; move: string }
  | { kind: 'several-open-incidents'; subject: string; move: string; incidentIds: readonly string[] }
  | { kind: 'worktree-has-uncommitted-work'; ticketId: string; worktreePath: string }
  /** `gitReason` is git's own. */
  | { kind: 'worktree-repair-failed'; ticketId: string; step: string; problem: WorktreeStepProblem | WorktreeRemovalProblem }
  /** A document agent's move that Hephaestus did not stamp with its snapshot's commit, worded as the Board's own `document-agent-not-live`. */
  | { kind: 'document-agent-not-live'; ticketId: string; document: TicketDocumentKind; jobId: string }
  | { kind: 'chart-range-bound-unreadable'; bound: 'from' | 'to'; written: string }
  | { kind: 'chart-range-backwards'; from: string; to: string }
  | { kind: 'chart-range-tick-unreadable'; tickMinutes: string }
  | { kind: 'tracker-has-live-jobs'; jobIds: readonly string[] }
  | { kind: 'malformed-hatch-request'; requestId: string }
  | { kind: 'hatch-identity-mismatch'; requestId: string; jobId: string }
  | { kind: 'hephaestus-not-answering'; url: string }
  | { kind: 'machine-agent-limit-above-cpus'; limit: number; ceiling: number }
  | { kind: 'machine-agent-limit-not-whole'; limit: number }
  | { kind: 'concurrency-limit-out-of-range'; limit: number; ceiling: number }
  | { kind: 'machine-limits-newer-version'; filePath: string; version: number }
  | { kind: 'task-ticket-missing'; option: 'ticket' | 'review-of'; reference: string }
  | { kind: 'namespace-board-has-jobs'; jobCount: number }
  /** `reason` is git's own. */
  | { kind: 'namespace-branch-list-failed'; problem: GitRunFailure }
  | { kind: 'namespace-not-free'; refusal: BranchNamespaceRefusal; wantedNamespace: string }
  /** The states below are defects of forge's own code, which nothing a person does reaches; each is `unrepaired`. */
  | { kind: 'merge-job-holds-no-slot'; jobId: string }
  | { kind: 'crash-log-number-not-free'; attempts: number; crashLogDirectory: string }
  | { kind: 'ticket-file-not-allocated'; ticketId: string }
  /** The Bouncer admits no User setup command from a session, so a relayed command that reaches one of these steps is a Bouncer defect. */
  | { kind: 'relayed-command-sent-setup-message'; messageKind: string }
  | { kind: 'relayed-command-read-main-constitution' }
  | { kind: 'relayed-command-judged-billing'; vendor: string };

export function reasonCodeOf(detail: OperationRefusalDetail): string {
  if (detail.kind === 'role-command-refused') return detail.reason;
  return detail.kind === 'board-refusal' ? detail.boardRefusal.reason : detail.kind;
}

export class OperationRefusal extends Error {
  readonly status: OperationRefusalStatus;
  readonly detail: OperationRefusalDetail | null;

  constructor(status: OperationRefusalStatus, explanation: string | OperationRefusalDetail) {
    super(typeof explanation === 'string' ? explanation : reasonCodeOf(explanation));
    // Extending a built-in leaves `name` as `Error`, and the name is what an unhandled stack trace shows.
    this.name   = 'OperationRefusal';
    this.status = status;
    this.detail = typeof explanation === 'string' ? null : explanation;
  }
}

export function refusalIsOperationRefusal(error: unknown): error is OperationRefusal {
  return error instanceof OperationRefusal;
}
