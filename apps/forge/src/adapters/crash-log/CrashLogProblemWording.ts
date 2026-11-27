import { StoredFileProblemWording }                     from '../StoredFileProblemWording.ts';
import type { CrashLogMalformedField, CrashLogProblem } from './@types/CrashLogProblem.ts';

const CODE_VERSION_AND_STARTED_AT_SENTENCE = 'codeVersion and startedAt are each a string or null';

const MALFORMED_FIELD_SENTENCES: Readonly<Record<CrashLogMalformedField, string>> = {
  crashedGeneration: 'crashedGeneration is not a generation or null',
  component:         'component is not a crashed component',
  suspected:         'suspected is not a flag',
  classification:    'classification is neither null nor a start classification',
  recordedAt:        'recordedAt is not a string',
  recordedBy:        'recordedBy is not who recorded the crash',
  crashedProcess:    'crashedProcess is neither null nor a process identity',
  codeVersion:       CODE_VERSION_AND_STARTED_AT_SENTENCE,
  startedAt:         CODE_VERSION_AND_STARTED_AT_SENTENCE,
  lastHeartbeat:     'lastHeartbeat is neither null nor a beat',
  error:             'error is neither null nor a crash error',
  activeJobs:        'activeJobs is neither null nor a list of jobs',
  talosChildren:     'talosChildren is neither null nor a list',
  logTail:           'logTail is neither null nor a list of lines',
};

function sentenceOf(problem: CrashLogProblem): string {
  switch (problem.code) {
    case 'crash-log-field-malformed': return MALFORMED_FIELD_SENTENCES[problem.field];
    default:                          return StoredFileProblemWording.sentenceOf(problem);
  }
}

export const CrashLogProblemWording = Object.freeze({ sentenceOf });
