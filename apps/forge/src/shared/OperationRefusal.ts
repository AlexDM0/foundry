/**
 * The typed refusal library code throws instead of exiting, since nothing under `src/` calls `process.exit`: `cli/Main.ts` maps
 * `refused` to exit 1, a refusal the caller can act on, and `unrepaired` to exit 2, a state the tool will not repair on its own. A refusal
 * thrown from `src/` carries a detail, a reason code with its facts and no words, that the command line words; only `cli/` builds one from words.
 */
import type { BoardRefusalDetail }       from '../lib/tracker-model/BoardRefusal.ts';
import type { InstallVersionMismatch }   from './@types/InstallVersionMismatch.ts';
import type { RoleCommandRefusalReason } from './@types/RoleCommandRefusalReason.ts';
import type { UnreadableTracker }        from './@types/UnreadableTracker.ts';
import type { BranchNamespaceRefusal }   from './BranchNames.ts';

export type OperationRefusalStatus = 'refused' | 'unrepaired';

export type OperationRefusalDetail =
  | { kind: 'board-refusal'; boardRefusal: BoardRefusalDetail }
  | { kind: 'unreadable-tracker'; reading: UnreadableTracker }
  | { kind: 'no-tracker-at-override'; overrideDirectory: string }
  | { kind: 'no-tracker-found'; searchedFrom: string }
  | { kind: 'tracker-lock-held'; lockDirectoryPath: string }
  | { kind: 'lock-taken-over'; lockDirectoryPath: string }
  | { kind: 'lock-record-unreadable'; recordPath: string }
  | { kind: 'malformed-hold-journal'; journalFilePath: string; reason: string }
  | { kind: 'hold-journal-unremovable'; journalFilePath: string; reason: string }
  | { kind: 'install-version-mismatch'; rootDirectory: string; manifestFilePath: string; installVersion: number; mismatch: InstallVersionMismatch }
  | { kind: 'older-program-present'; rootDirectory: string; olderDataFolderPath: string; program: string; olderProgram: string }
  | { kind: 'no-readable-ticket'; reference: string }
  | { kind: 'malformed-ticket-file'; filePath: string; line: number; reason: string }
  | { kind: 'unreadable-file-in-the-way'; filePath: string; record: 'epic' | 'draft' }
  | { kind: 'malformed-pipeline'; filePath: string; reason: string }
  | { kind: 'older-pipeline'; filePath: string }
  | { kind: 'entities-in-a-folder'; filePath: string; projectPrefix: string }
  | { kind: 'role-command-refused'; reason: RoleCommandRefusalReason; commandKind: string }
  | { kind: 'verb-not-relayable'; verb: string; jobId: string }
  | { kind: 'malformed-hatch-reply'; replyFilePath: string }
  | { kind: 'overseer-already-running'; url: string; batonFilePath: string }
  | { kind: 'overseer-down'; overseerDirectory: string }
  | { kind: 'overseer-contended'; overseerDirectory: string }
  | { kind: 'gate-confinement-unavailable'; reason: string }
  | { kind: 'malformed-overseer-poll-interval'; variable: string; value: string }
  | { kind: 'malformed-versions-answer'; variable: string; value: string }
  /** `foundVersion` is `null` when no git started or it printed no version. */
  | { kind: 'git-below-floor'; foundVersion: string | null; floorVersion: string }
  | { kind: 'baton-taken'; batonFilePath: string }
  | { kind: 'baton-not-created-whole'; batonFilePath: string; reason: string }
  | { kind: 'overseer-port-in-use'; firstPort: number; lastPort: number }
  | { kind: 'overseer-identity-unreadable'; processId: number; identitySources: readonly string[] }
  | { kind: 'overseer-did-not-start'; exitCode: number | null; logFilePath: string }
  | { kind: 'overseer-still-live'; url: string; processId: number }
  | { kind: 'baton-pass-failed'; successorCodeVersion: string; step: string; error: string; url: string | null }
  | { kind: 'overseer-control-is-runtime-only'; commandKind: string }
  | { kind: 'intake-close-without-job' }
  | { kind: 'intake-title-without-job' }
  | { kind: 'question-options-without-job' }
  | { kind: 'need-declare-without-job' }
  /** A setup command whose `field` is missing or not of its shape; `field` names it as the body does, as `edits[0].value`. */
  | { kind: 'malformed-setup-command'; commandKind: string; field: string }
  | { kind: 'pipeline-draft-invalid'; setupId: string; reason: string }
  /**
   * A copy to another entity on a draft that has no entities, or with edits outside an entity: `fields` names those edits' fields, none when
   * the draft has no entities.
   */
  | { kind: 'draft-copy-outside-entities'; setupId: string; fields: readonly string[] }
  /** Git could not tell what main's `CONSTITUTION.md` holds; `reason` is git's own. */
  | { kind: 'main-constitution-unreadable'; reason: string }
  | { kind: 'picture-unknown'; pictureId: string }
  | { kind: 'too-many-pictures'; pictureCount: number; limit: number }
  | { kind: 'picture-too-large'; bytes: number; sizeLimitBytes: number }
  | { kind: 'picture-type-unsupported'; mediaTypes: readonly string[] }
  | { kind: 'overseer-owns-the-lifecycle'; url: string; batonFilePath: string }
  /** The Talos this Overseer started answers another protocol version, so no Talos starts again while it lives. */
  | { kind: 'talos-protocol-differs'; requiredProtocolVersion: number; answeredProtocolVersion: number }
  /** The Talos this Overseer started never served: its endpoint does not fit, it refused its start, or it stayed silent. */
  | { kind: 'talos-unavailable'; reason: 'endpoint-does-not-fit' | 'start-refused' | 'not-serving'; startNumber: number }
  /** The forge crashed while serving (the Overseer, or its Talos lost), wrote its crash log (`null`: it could not) and stays off until started. */
  | { kind: 'forge-crashed'; component: 'overseer' | 'talos'; crashLogPath: string | null }
  /** A start after a crash, or one suspected before a reboot, that the user did not make: it took no Baton and stays off. `null`: no Baton named it. */
  | { kind: 'forge-off-after-crash'; crashedGeneration: number | null; crashLogPath: string; suspected: boolean }
  /** No crash log of that number, or none at all when `number` is `null`. */
  | { kind: 'no-crash-log'; number: number | null }
  | { kind: 'ticket-has-live-job'; ticketId: string; jobId: string; state: string }
  | { kind: 'chart-range-bound-unreadable'; bound: 'from' | 'to'; written: string }
  | { kind: 'chart-range-backwards'; from: string; to: string }
  | { kind: 'chart-range-tick-unreadable'; tickMinutes: string }
  | { kind: 'tracker-has-live-jobs'; jobIds: readonly string[] }
  | { kind: 'malformed-hatch-request'; requestId: string }
  | { kind: 'hatch-identity-mismatch'; requestId: string; jobId: string }
  | { kind: 'overseer-not-answering'; url: string }
  | { kind: 'login-item-unavailable'; reason: string }
  | { kind: 'login-item-not-changed'; location: string; reason: string }
  | { kind: 'machine-agent-limit-above-cpus'; limit: number; ceiling: number }
  | { kind: 'machine-agent-limit-not-whole'; limit: number }
  | { kind: 'concurrency-limit-out-of-range'; limit: number; ceiling: number }
  | { kind: 'machine-limits-newer-version'; filePath: string; version: number }
  | { kind: 'task-ticket-missing'; option: 'ticket' | 'review-of'; reference: string }
  | { kind: 'namespace-board-has-jobs'; jobCount: number }
  /** `reason` is git's own. */
  | { kind: 'namespace-branch-list-failed'; reason: string }
  | { kind: 'namespace-not-free'; refusal: BranchNamespaceRefusal; wantedNamespace: string };

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
