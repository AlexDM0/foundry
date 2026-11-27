/**
 * Maps an `OperationRefusal` into the refusal document forge serves: its reason code, the facts its detail names, and the sentence the
 * command line prints, so a client shows the same words a terminal does. A detail that carries a typed problem serves it worded, under the
 * key and as the sentence the served document has always held.
 */
import type { ForgeJsonValue, ForgeRefusalDocument } from 'forge-contracts/ForgeRefusalDocument';

import type { BoardRefusalDetail }        from '../../lib/tracker-model/BoardRefusal.ts';
import type { InstallVersionMismatch }    from '../../shared/@types/InstallVersionMismatch.ts';
import type { UnreadableTracker }         from '../../shared/@types/UnreadableTracker.ts';
import type { OperationRefusal }          from '../../shared/OperationRefusal.ts';
import type { OperationRefusalDetail }    from '../../shared/OperationRefusal.ts';
import { reasonCodeOf }                   from '../../shared/OperationRefusal.ts';
import { ConfinementRefusalWording }      from '../ConfinementRefusalWording.ts';
import { ExecutableRefusalWording }       from '../ExecutableRefusalWording.ts';
import { GitProblemWording }              from '../GitProblemWording.ts';
import { MergeUpdateProblemWording }      from '../MergeUpdateProblemWording.ts';
import { UnreadableRecordProblemWording } from '../UnreadableRecordProblemWording.ts';
import { HoldJournalProblemWording }      from '../hold-journal/HoldJournalProblemWording.ts';
import { InstallManifestProblemWording }  from '../install/InstallManifestProblemWording.ts';
import { LogFileProblemWording }          from '../log/LogFileProblemWording.ts';
import { MachineConfigProblemWording }    from '../machine-config/MachineConfigProblemWording.ts';
import { GateProfilesProblemWording }     from '../pipeline/GateProfilesProblemWording.ts';
import { MainConstitutionProblemWording } from '../pipeline/MainConstitutionProblemWording.ts';
import { PipelineProblemWording }         from '../pipeline/PipelineProblemWording.ts';
import { PipelineSetupProblemWording }    from '../pipeline/PipelineSetupProblemWording.ts';
import { ProgressFileProblemWording }     from '../progress/ProgressFileProblemWording.ts';
import { OperationRefusalWordingUtil }    from './OperationRefusalWordingUtil.ts';

const REFUSED_WITHOUT_DETAIL_CODE = 'refused';

/** What a draft of an older pipeline version served as its reason. */
const OLDER_DRAFT_REASON = 'older';

/** A value as JSON would carry it: an absent field or a function is left out, a number JSON cannot write reads `null`. */
function jsonValueOf(value: unknown): ForgeJsonValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map((element: unknown) => jsonValueOf(element) ?? null);
  if (typeof value === 'object') return jsonFieldsOf(value);
  return undefined;
}

function jsonFieldsOf(record: object, leftOutField?: string): Record<string, ForgeJsonValue> {
  const fields: Record<string, ForgeJsonValue> = {};
  for (const [field, value] of Object.entries(record)) {
    const jsonValue = jsonValueOf(value);
    if (field !== leftOutField && jsonValue !== undefined) fields[field] = jsonValue;
  }
  return fields;
}

function servedReadingOf(reading: UnreadableTracker): Record<string, ForgeJsonValue> {
  if (reading.verdict === 'absent') return { verdict: reading.verdict, filePath: reading.filePath };
  const reason = reading.unreadableFile === 'log-file'
    ? LogFileProblemWording.sentenceOf(reading.problem)
    : ProgressFileProblemWording.sentenceOf(reading.problem);
  return {
    verdict: reading.verdict, unreadableFile: reading.unreadableFile, filePath: reading.filePath, reason
  };
}

function servedMismatchOf(mismatch: InstallVersionMismatch): Record<string, ForgeJsonValue> {
  if (mismatch.reason !== 'unreadable') return jsonFieldsOf(mismatch);
  return { reason: mismatch.reason, manifestProblem: InstallManifestProblemWording.sentenceOf(mismatch.manifestProblem) };
}

/** A board refusal's facts without its reason, a typed problem worded as the sentence it was served as. */
function servedBoardRefusalFactsOf(boardRefusal: BoardRefusalDetail): Record<string, ForgeJsonValue> {
  switch (boardRefusal.reason) {
    case 'pipeline-setup-unreadable': return { problem: PipelineSetupProblemWording.sentenceOf(boardRefusal.problem) };
    case 'gate-profiles-unreadable':  return { problem: GateProfilesProblemWording.sentenceOf(boardRefusal.problem) };
    default:                          return jsonFieldsOf(boardRefusal, 'reason');
  }
}

/**
 * The detail's facts without the field its code already says. Every kind is named, so a kind that gains a typed problem is mapped here
 * before it reaches a client: one that carries a problem serves it worded under the key it was served as.
 */
function servedFactsOf(detail: OperationRefusalDetail): Record<string, ForgeJsonValue> {
  switch (detail.kind) {
    case 'board-refusal':
      return servedBoardRefusalFactsOf(detail.boardRefusal);
    case 'unreadable-tracker':
      return { reading: servedReadingOf(detail.reading) };
    case 'malformed-hold-journal':
      return { journalFilePath: detail.journalFilePath, reason: HoldJournalProblemWording.sentenceOf(detail.problem) };
    case 'hold-journal-unremovable':
      return { journalFilePath: detail.journalFilePath, reason: detail.systemError };
    case 'install-version-mismatch':
      return {
        rootDirectory:    detail.rootDirectory,
        manifestFilePath: detail.manifestFilePath,
        installVersion:   detail.installVersion,
        mismatch:         servedMismatchOf(detail.mismatch),
      };
    case 'malformed-ticket-file':
      return { filePath: detail.filePath, line: detail.line, reason: UnreadableRecordProblemWording.ticketSentenceOf(detail.problem) };
    case 'malformed-pipeline':
      return { filePath: detail.filePath, reason: PipelineProblemWording.sentenceOf(detail.problem) };
    case 'gate-confinement-unavailable':
      return { reason: ConfinementRefusalWording.unavailabilitySentenceOf(detail.unavailability) };
    case 'hephaestus-lock-not-created-whole':
      return { hephaestusLockFilePath: detail.hephaestusLockFilePath, reason: detail.systemError };
    case 'pipeline-draft-invalid':
      return { setupId: detail.setupId, reason: detail.problem === null ? OLDER_DRAFT_REASON : PipelineProblemWording.sentenceOf(detail.problem) };
    case 'main-constitution-unreadable':
      return { reason: MainConstitutionProblemWording.sentenceOf(detail.problem) };
    case 'tool-refused':
      return { name: detail.name, reason: ExecutableRefusalWording.sentenceOf(detail.refusal) };
    case 'machine-config-unwritable':
      return { filePath: detail.filePath, reason: MachineConfigProblemWording.sentenceOf(detail.problem) };
    case 'merge-accept-prediction-failed':
      return { ticketId: detail.ticketId, target: detail.target, gitReason: GitProblemWording.sentenceOf(detail.problem) };
    case 'merge-update-failed':
      return { ticketId: detail.ticketId, target: detail.target, gitReason: MergeUpdateProblemWording.sentenceOf(detail.problem, detail.target) };
    case 'worktree-repair-failed':
      return { ticketId: detail.ticketId, step: detail.step, gitReason: GitProblemWording.sentenceOf(detail.problem) };
    case 'namespace-branch-list-failed':
      return { reason: GitProblemWording.sentenceOf(detail.problem) };
    case 'no-tracker-at-override':
    case 'no-tracker-found':
    case 'tracker-lock-held':
    case 'lock-taken-over':
    case 'no-readable-ticket':
    case 'unreadable-file-in-the-way':
    case 'older-pipeline':
    case 'entities-in-a-folder':
    case 'role-command-refused':
    case 'verb-not-relayable':
    case 'malformed-hatch-reply':
    case 'hephaestus-already-running':
    case 'hephaestus-down':
    case 'hephaestus-contended':
    case 'malformed-hephaestus-poll-interval':
    case 'malformed-versions-answer':
    case 'git-below-floor':
    case 'hephaestus-lock-taken':
    case 'hephaestus-port-in-use':
    case 'hephaestus-identity-unreadable':
    case 'hephaestus-did-not-start':
    case 'hephaestus-still-live':
    case 'restart-failed':
    case 'hephaestus-control-is-runtime-only':
    case 'intake-close-without-job':
    case 'intake-title-without-job':
    case 'question-options-without-job':
    case 'need-declare-without-job':
    case 'malformed-setup-command':
    case 'draft-copy-outside-entities':
    case 'agent-program-does-not-run':
    case 'tool-not-found':
    case 'picture-unknown':
    case 'too-many-pictures':
    case 'picture-too-large':
    case 'picture-type-unsupported':
    case 'path-not-owner-only':
    case 'hephaestus-owns-the-lifecycle':
    case 'talos-protocol-differs':
    case 'talos-unavailable':
    case 'forge-crashed':
    case 'forge-off-after-crash':
    case 'no-crash-log':
    case 'ticket-has-live-job':
    case 'merge-accept-would-conflict':
    case 'no-open-incident':
    case 'several-open-incidents':
    case 'worktree-has-uncommitted-work':
    case 'document-agent-not-live':
    case 'chart-range-bound-unreadable':
    case 'chart-range-backwards':
    case 'chart-range-tick-unreadable':
    case 'tracker-has-live-jobs':
    case 'malformed-hatch-request':
    case 'hatch-identity-mismatch':
    case 'hephaestus-not-answering':
    case 'machine-agent-limit-above-cpus':
    case 'machine-agent-limit-not-whole':
    case 'concurrency-limit-out-of-range':
    case 'machine-limits-newer-version':
    case 'task-ticket-missing':
    case 'namespace-board-has-jobs':
    case 'namespace-not-free':
    case 'merge-job-holds-no-slot':
    case 'crash-log-number-not-free':
    case 'ticket-file-not-allocated':
    case 'relayed-command-sent-setup-message':
    case 'relayed-command-read-main-constitution':
    case 'relayed-command-judged-billing':
      return jsonFieldsOf(detail, 'kind');
  }
}

function refusalDocumentOf(refusal: OperationRefusal): ForgeRefusalDocument {
  return {
    code:     refusal.detail === null ? REFUSED_WITHOUT_DETAIL_CODE : reasonCodeOf(refusal.detail),
    fields:   refusal.detail === null ? {} : servedFactsOf(refusal.detail),
    sentence: OperationRefusalWordingUtil.messageOf(refusal),
  };
}

export const RefusalDocumentUtil = {
  jsonFieldsOf,
  refusalDocumentOf,
} as const;
