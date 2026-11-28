/** Whether a parsed progress.json is a document in the current format this build can read, and if not, the problem naming the offending field. */
import { GATE_PHASES }                                        from '../../../domain/tracker-model/@types/GatePhase.ts';
import { LOWEST_CONCURRENCY_LIMIT_AGENTS }                    from '../../../domain/tracker-model/constants/ConcurrencyLimits.ts';
import { FIRST_DRAFT_NUMBER }                                 from '../../../domain/tracker-model/constants/DraftFields.ts';
import { FIRST_SETUP_NUMBER }                                 from '../../../domain/tracker-model/constants/PipelineSetupVocabulary.ts';
import { FIRST_REPEAT_REVIEW_ROUND, FIRST_REVIEW_BAR_ROUND }  from '../../../domain/tracker-model/constants/ReviewRounds.ts';
import { FIRST_TASK_ID }                                      from '../../../domain/tracker-model/constants/TaskIds.ts';
import { BoardSettingsUtil }                                  from '../../../domain/tracker-model/utils/BoardSettingsUtil.ts';
import { TicketStageUtil }                                    from '../../../domain/tracker-model/utils/TicketStageUtil.ts';
import { VocabularyUtil }                                     from '../../../domain/tracker-model/utils/VocabularyUtil.ts';
import { JsonRecordUtil }                                     from '../../../lib/json-record/JsonRecordUtil.ts';
import type { ProgressFieldExpectation, ProgressFileProblem } from '../../../shared/@types/ProgressFileProblem.ts';
import { BranchNamespaceUtil }                                from '../../../shared/BranchNames.ts';
import { StoredValueUtil }                                    from '../../utils/StoredValueUtil.ts';
import type { StoredProgressFile, StoredTaskPhase }           from '../@types/StoredProgressFile.ts';
import { CURRENT_PROGRESS_FILE_VERSION }                      from '../constants/ProgressFileVersions.ts';
import { StoredDecisionAndIncidentValidationUtil }            from './StoredDecisionAndIncidentValidationUtil.ts';
import { StoredJobValidationUtil }                            from './StoredJobValidationUtil.ts';

const TASKS_NOT_AN_ARRAY: ProgressFileProblem = { code: 'field-is-not', field: 'tasks', expected: 'an-array' };

/** What the retired `checks` verb stored here; the gate pipeline lives in `pipeline.json` now. */
const RETIRED_PIPELINE_KEYS = ['checkCommand', 'installCommand', 'checksDefinitionFiles', 'gateKeyCommand', 'gateCachePaths'] as const;

function textFieldIsPresent(candidate: Record<string, unknown>, field: string): boolean {
  return typeof candidate[field] === 'string';
}

function nullableTextIsWellFormed(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

/** `0` and `null` are different answers — "it used none" and "nobody said" — and every reader keeps them apart. */
function tokenCountIsWellFormed(value: unknown): value is number | null {
  return value === null || StoredValueUtil.wholeNumberIsAtLeast(value, 0);
}

/** Only a repeat review is counted, so the first round a row can record is the second one. */
function reviewRoundIsWellFormed(value: unknown): value is number {
  return StoredValueUtil.wholeNumberIsAtLeast(value, FIRST_REPEAT_REVIEW_ROUND);
}

function reviewBarRoundIsWellFormed(value: unknown): value is number {
  return StoredValueUtil.wholeNumberIsAtLeast(value, FIRST_REVIEW_BAR_ROUND);
}

function gatePhaseIsKnown(value: unknown): boolean {
  return typeof value === 'string' && GATE_PHASES.some((phase) => phase === value);
}

function entityHashesAreWellFormed(value: unknown): value is Record<string, string> {
  return JsonRecordUtil.valueIsAPlainObject(value) && Object.values(value).every((entityPhaseHash) => typeof entityPhaseHash === 'string');
}

function ticketStageIsWellFormed(value: unknown): boolean {
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return false;
  const { name, entity } = value;
  return typeof name === 'string' && TicketStageUtil.stageNameIsKnown(name) && typeof entity === 'string' && entity !== '';
}

function taskStatusIsKnown(value: unknown): boolean {
  return typeof value === 'string' && VocabularyUtil.taskStatusIsKnown(value);
}

function taskPhaseIsWellFormed(value: unknown): value is StoredTaskPhase {
  if (!JsonRecordUtil.valueIsAPlainObject(value)) return false;
  return taskStatusIsKnown(value['status']) && typeof value['at'] === 'string';
}

function taskHistoryIsWellFormed(value: unknown): value is StoredTaskPhase[] {
  return Array.isArray(value) && value.every(taskPhaseIsWellFormed);
}

function storedJsonOf(value: unknown): string {
  return String(JSON.stringify(value));
}

function taskProblem(value: unknown, index: number): ProgressFileProblem | null {
  const path = `tasks[${index}]`;
  const fieldNot = (field: string, expected: ProgressFieldExpectation): ProgressFileProblem => ({ code: 'field-is-not', field: `${path}.${field}`, expected });
  const neitherNorNull = (field: string, expected: ProgressFieldExpectation): ProgressFileProblem => ({ code: 'field-is-neither-nor-null', field: `${path}.${field}`, expected });
  const presentButNot = (field: string, expected: ProgressFieldExpectation): ProgressFileProblem => ({ code: 'present-field-is-not', field: `${path}.${field}`, expected });
  const presentAndNot = (field: string, expected: ProgressFieldExpectation): ProgressFileProblem => ({ code: 'present-and-field-is-not', field: `${path}.${field}`, expected });
  const presentRoundBelow = (field: string, least: number): ProgressFileProblem => ({
    code: 'present-and-field-is-not-at-least', field: `${path}.${field}`, unit: 'whole-round', least
  });
  // An array row is let through to the field checks, so its problem names the first field it lacks.
  if (typeof value !== 'object' || value === null) return { code: 'field-is-not', field: path, expected: 'an-object' };
  const task: Record<string, unknown> = { ...value };
  if (!StoredValueUtil.valueIsAWholeNumber(task['id'])) return fieldNot('id', 'a-whole-number');
  if (!textFieldIsPresent(task, 'name')) return fieldNot('name', 'a-string');
  if (!taskStatusIsKnown(task['status'])) return {
    code: 'not-in-vocabulary', field: `${path}.status`, storedJson: storedJsonOf(task['status']), vocabulary: 'task-status'
  };
  if (!nullableTextIsWellFormed(task['start'])) return neitherNorNull('start', 'a-timestamp');
  if (!nullableTextIsWellFormed(task['end'])) return neitherNorNull('end', 'a-timestamp');
  if (!textFieldIsPresent(task, 'owner')) return fieldNot('owner', 'a-string');
  if (!textFieldIsPresent(task, 'note')) return fieldNot('note', 'a-string');
  if (!nullableTextIsWellFormed(task['ticket'])) return neitherNorNull('ticket', 'a-ticket-id');
  if (!tokenCountIsWellFormed(task['tokens'])) return neitherNorNull('tokens', 'a-whole-number-of-tokens');
  if (task['reviewed'] !== undefined && typeof task['reviewed'] !== 'string') return presentButNot('reviewed', 'a-timestamp');
  if (task['reviewRound'] !== undefined && !reviewRoundIsWellFormed(task['reviewRound'])) return presentRoundBelow('reviewRound', FIRST_REPEAT_REVIEW_ROUND);
  if (task['history'] !== undefined && !taskHistoryIsWellFormed(task['history'])) return presentAndNot('history', 'a-list-of-task-phases');
  if (task['agent'] !== undefined && typeof task['agent'] !== 'string') return presentButNot('agent', 'the-key-of-the-claim-that-started-it');
  if (task['reviewOf'] !== undefined && typeof task['reviewOf'] !== 'string') return presentButNot('reviewOf', 'the-id-of-the-ticket-it-reviews');
  if (task['reviewBarRound'] !== undefined && !reviewBarRoundIsWellFormed(task['reviewBarRound'])) return presentRoundBelow('reviewBarRound', FIRST_REVIEW_BAR_ROUND);
  if (Object.hasOwn(task, 'checkCommand')) return { code: 'retired-row-check-command', field: `${path}.checkCommand` };
  if (task['pipelineHash'] !== undefined && !textFieldIsPresent(task, 'pipelineHash')) return presentAndNot('pipelineHash', 'a-hash');
  if (task['pipelineHashes'] !== undefined && !entityHashesAreWellFormed(task['pipelineHashes'])) return presentAndNot('pipelineHashes', 'a-record-of-entity-hashes');
  if (task['greenPhase'] !== undefined && !gatePhaseIsKnown(task['greenPhase'])) return presentAndNot('greenPhase', 'a-gate-phase');
  if (task['greenTree'] !== undefined && !textFieldIsPresent(task, 'greenTree')) return presentAndNot('greenTree', 'a-tree');
  if (task['mergeQueued'] !== undefined && task['mergeQueued'] !== true) return presentAndNot('mergeQueued', 'true');
  if (task['mergeAccepted'] !== undefined && task['mergeAccepted'] !== true) return presentAndNot('mergeAccepted', 'true');
  if (task['stage'] !== undefined && !ticketStageIsWellFormed(task['stage'])) return presentAndNot('stage', 'a-ticket-stage');
  if (task['seals'] !== undefined && !entityHashesAreWellFormed(task['seals'])) return presentAndNot('seals', 'a-record-of-package-seals');
  if (task['packageReturns'] !== undefined && !StoredValueUtil.wholeNumberIsAtLeast(task['packageReturns'], 1)) {
    return {
      code: 'present-and-field-is-not-at-least', field: `${path}.packageReturns`, unit: 'whole-number', least: 1
    };
  }
  return null;
}

function presentCounterProblemOf(candidate: Record<string, unknown>, field: string, least: number): ProgressFileProblem | null {
  const value = candidate[field];
  if (value === undefined || StoredValueUtil.wholeNumberIsAtLeast(value, least)) return null;
  return {
    code: 'present-counter-below-first', field, storedJson: storedJsonOf(value), least
  };
}

/**
 * `null` for a document whose top level this build reads, before its rows are looked at. A version 3 file keeps its log in log.jsonl, so a
 * `log` in one is refused rather than silently ignored.
 */
function documentHeaderProblemOf(candidate: unknown): ProgressFileProblem | null {
  if (!JsonRecordUtil.valueIsAPlainObject(candidate)) return { code: 'document-not-a-json-object' };
  const { version } = candidate;
  if (version !== CURRENT_PROGRESS_FILE_VERSION) {
    return {
      code: 'version-not-read', field: 'version', storedJson: storedJsonOf(version), readVersion: CURRENT_PROGRESS_FILE_VERSION
    };
  }
  if (!textFieldIsPresent(candidate, 'trackerId')) return { code: 'field-is-not', field: 'trackerId', expected: 'a-string' };
  if (!textFieldIsPresent(candidate, 'project')) return { code: 'field-is-not', field: 'project', expected: 'a-string' };
  if (!textFieldIsPresent(candidate, 'startedAt')) return { code: 'field-is-not', field: 'startedAt', expected: 'a-timestamp' };
  if (!BoardSettingsUtil.viewRangeIsWellFormed(candidate['view'])) return { code: 'field-is-not', field: 'view', expected: 'a-stored-range-shape' };
  if (!StoredValueUtil.wholeNumberIsAtLeast(candidate['nextTaskId'], FIRST_TASK_ID)) {
    return {
      code: 'counter-below-first', field: 'nextTaskId', storedJson: storedJsonOf(candidate['nextTaskId']), least: FIRST_TASK_ID
    };
  }
  if (candidate['concurrencyLimit'] !== undefined && !BoardSettingsUtil.concurrencyLimitIsWellFormed(candidate['concurrencyLimit'])) {
    return {
      code: 'present-counter-below-first', field: 'concurrencyLimit', storedJson: storedJsonOf(candidate['concurrencyLimit']), least: LOWEST_CONCURRENCY_LIMIT_AGENTS
    };
  }
  if (candidate['hephaestusState'] !== undefined && !BoardSettingsUtil.hephaestusStateIsKnown(candidate['hephaestusState'])) {
    return {
      code: 'present-value-is-not', field: 'hephaestusState', storedJson: storedJsonOf(candidate['hephaestusState']), expected: 'one-of-the-hephaestus-states'
    };
  }
  const retiredKey = RETIRED_PIPELINE_KEYS.find((key) => Object.hasOwn(candidate, key));
  if (retiredKey !== undefined) return { code: 'retired-pipeline-key', field: retiredKey };
  const counterProblem = presentCounterProblemOf(candidate, 'nextDraftId', FIRST_DRAFT_NUMBER) ?? presentCounterProblemOf(candidate, 'nextSetupId', FIRST_SETUP_NUMBER);
  if (counterProblem !== null) return counterProblem;
  if (candidate['hephaestusFirstStartedAt'] !== undefined && !textFieldIsPresent(candidate, 'hephaestusFirstStartedAt')) {
    return {
      code: 'present-value-is-not', field: 'hephaestusFirstStartedAt', storedJson: storedJsonOf(candidate['hephaestusFirstStartedAt']), expected: 'a-timestamp'
    };
  }
  const { branchNamespace } = candidate;
  if (branchNamespace !== undefined && !(typeof branchNamespace === 'string' && BranchNamespaceUtil.namespaceIsWellFormed(branchNamespace))) {
    return {
      code: 'present-value-is-not', field: 'branchNamespace', storedJson: storedJsonOf(branchNamespace), expected: 'a-branch-namespace'
    };
  }
  const rowsProblem = StoredJobValidationUtil.jobsProblemOf(candidate)
    ?? StoredJobValidationUtil.needsProblemOf(candidate)
    ?? StoredDecisionAndIncidentValidationUtil.decisionsAndIncidentsProblemOf(candidate);
  if (rowsProblem !== null) return rowsProblem;
  if (!Array.isArray(candidate['tasks'])) return TASKS_NOT_AN_ARRAY;
  if (Object.hasOwn(candidate, 'log')) return { code: 'log-kept-in-document', field: 'log', documentVersion: CURRENT_PROGRESS_FILE_VERSION };
  return null;
}

function taskRowsProblemOf(tasks: readonly unknown[]): ProgressFileProblem | null {
  for (const [index, task] of tasks.entries()) {
    const problem = taskProblem(task, index);
    if (problem !== null) return problem;
  }
  return null;
}

/** `null` for a document in the current format this build reads; the first problem found otherwise, the top level before the rows. */
function documentProblemOf(parsed: unknown): ProgressFileProblem | null {
  const headerProblem = documentHeaderProblemOf(parsed);
  if (headerProblem !== null) return headerProblem;
  const tasks = JsonRecordUtil.recordOf(parsed)?.['tasks'];
  return Array.isArray(tasks) ? taskRowsProblemOf(tasks) : TASKS_NOT_AN_ARRAY;
}

/** The checks above are the stored format's type written as checks, so a document they find nothing wrong with is one of that type. */
function documentIsStored(parsed: unknown, problemFound: ProgressFileProblem | null): parsed is StoredProgressFile {
  return problemFound === null && JsonRecordUtil.valueIsAPlainObject(parsed);
}

function readingOf(parsed: unknown): { verdict: 'readable'; document: StoredProgressFile } | { verdict: 'unreadable'; problem: ProgressFileProblem } {
  const problem = documentProblemOf(parsed);
  if (problem !== null) return { verdict: 'unreadable', problem };
  return documentIsStored(parsed, problem) ? { verdict: 'readable', document: parsed } : { verdict: 'unreadable', problem: { code: 'document-not-a-json-object' } };
}

export const ProgressFileValidationUtil = { documentProblemOf, readingOf } as const;
