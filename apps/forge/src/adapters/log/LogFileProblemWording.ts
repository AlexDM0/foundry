import { GATE_CACHE_REPORTS }                                  from '../../lib/tracker-model/constants/GateProfileVocabulary.ts';
import { PIPELINE_SETUP_STEPS }                                from '../../lib/tracker-model/constants/PipelineSetupVocabulary.ts';
import type { LogFileProblem, LogListItems, LogRecordProblem } from '../../shared/@types/LogFileProblem.ts';
import type { BaseStoredFileProblem }                          from '../../shared/@types/StoredFileProblem.ts';
import { StoredFileProblemWording }                            from '../StoredFileProblemWording.ts';

const LIST_ITEMS_TEXT: Readonly<Record<LogListItems, string>> = {
  'ticket-ids':       'ticket ids',
  'epic-keys':        'epic keys',
  'domains':          'domains',
  'permission-names': 'permission names',
  'file-paths':       'file paths',
  'gate-names':       'gate names',
  'customs-checks':   'Customs checks',
  'setup-item-ids':   'setup item ids',
  'draft-fields':     'draft fields',
};

function recordSentenceOf(problem: BaseStoredFileProblem | LogRecordProblem): string {
  switch (problem.code) {
    case 'record-not-an-object':       return 'it is not an object';
    case 'at-not-text':                return 'at is not a string';
    case 'kind-unknown':               return `kind is ${String(problem.storedValue)}, which is not a kind of log record`;
    case 'fields-not-an-object':       return 'fields is not an object';
    case 'field-not-text':             return `${problem.field} is not a string`;
    case 'field-blank':                return `${problem.field} is not a text that is not blank`;
    case 'field-not-a-whole-number':   return `${problem.field} is not a whole number`;
    case 'field-below-minimum':        return `${problem.field} is not a whole number of at least ${problem.minimum}`;
    case 'round-below-minimum':        return `${problem.field} is not a whole round of at least ${problem.minimum}`;
    case 'field-not-a-list':           return `${problem.field} is not a list`;
    case 'field-not-a-list-of':        return `${problem.field} is not a list of ${LIST_ITEMS_TEXT[problem.items]}`;
    case 'field-not-one-of':           return `${problem.field} is ${String(problem.storedValue)}, which is not one of ${problem.allowedValues.join(', ')}`;
    case 'field-not-an-object':        return `${problem.field} is not an object`;
    case 'model-unknown':              return `${problem.field} is ${String(problem.storedValue)}, which is not a known model`;
    case 'effort-unknown':             return `${problem.field} is ${String(problem.storedValue)}, which is not a known effort`;
    case 'field-not-a-flag':           return `${problem.field} is not true or false`;
    case 'field-not-a-cost':           return `${problem.field} is not a cost of at least 0`;
    case 'field-not-a-chart-range':    return `${problem.field} is not a chart range`;
    case 'field-not-an-agent-count':   return `${problem.field} is not a whole number of agents`;
    case 'field-not-a-check-command':  return `${problem.field} is neither null nor a shell line that is not blank`;
    case 'field-not-a-run-id':         return `${problem.field} is neither null nor a run id`;
    case 'field-not-answers':          return `${problem.field} is not an object of at least one answer keyed by its question`;
    case 'field-not-setup-steps':      return `${problem.field} is not a list of setup steps, each one of ${PIPELINE_SETUP_STEPS.join(', ')}`;
    case 'field-not-pictures':         return `${problem.field} is not a list of at least one picture, each a pictureId of 64 hex digits and a name`;
    case 'field-not-a-refusal-detail': return `${problem.field} is not a refusal detail, an object naming its kind`;
    case 'field-not-cache-reports':
      return `${problem.field} is not a gate run's cache reports, a phase and a list of gates each with a gateName and a cacheReport of `
        + `${GATE_CACHE_REPORTS.join(', ')} or null`;
    default:                           return StoredFileProblemWording.sentenceOf(problem);
  }
}

/** The sentence names the file and the line, since the tracker's log may come from another file and a reader must see which is at fault. */
function sentenceOf(problem: LogFileProblem): string {
  const place = problem.lineNumber === undefined ? problem.logFilePath : `${problem.logFilePath}, line ${problem.lineNumber}`;
  return `${place}: ${recordSentenceOf(problem)}`;
}

export const LogFileProblemWording = Object.freeze({ sentenceOf, recordSentenceOf });
