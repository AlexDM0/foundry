/** The shape checks of the files Hephaestus keeps in a job's folder, each failing field a problem, and the words of that problem. */
import { JsonRecordUtil }                                    from '../../lib/json-record/JsonRecordUtil.ts';
import type { JobFileFieldExpectation, JobFileFieldProblem } from '../@types/JobFileFieldProblem.ts';
import { StoredValueUtil }                                   from './StoredValueUtil.ts';

/** A stored field's check and what the field must hold, as a code its problem carries. */
export type ExpectationCheck = readonly [check: (value: unknown) => boolean, expected: JobFileFieldExpectation];

function valueIsText(value: unknown): value is string {
  return typeof value === 'string';
}

function valueIsATextList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(valueIsText);
}

function valueIsATextRecord(value: unknown): value is Record<string, string> {
  return JsonRecordUtil.valueIsAPlainObject(value) && Object.values(value).every(valueIsText);
}

function valueIsANumberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

/** A stored word of a vocabulary. */
function oneOf(words: readonly unknown[]): (value: unknown) => boolean {
  return (value) => words.includes(value);
}

/** A field a writer leaves out until it is set: absent, or as `check` wants it. */
function optional(check: (value: unknown) => boolean): (value: unknown) => boolean {
  return (value) => value === undefined || check(value);
}

/** The first field whose stored value fails its check, named from the document's root through `parentPath`; `null` when every field holds. */
function firstMistypedFieldOf(
  document: Readonly<Record<string, unknown>>, checks: Readonly<Record<string, ExpectationCheck>>, parentPath = ''
): JobFileFieldProblem | null {
  for (const [field, [check, expected]] of Object.entries(checks)) {
    if (!check(Object.hasOwn(document, field) ? document[field] : undefined)) return { code: 'field-is-not', field: `${parentPath}${field}`, expected };
  }
  return null;
}

/** A kept launch snapshot's first mistyped field, named from `launchSnapshot.`; `null` when it holds. */
function launchSnapshotMistypedFieldOf(snapshot: unknown): JobFileFieldProblem | null {
  if (!JsonRecordUtil.valueIsAPlainObject(snapshot)) return { code: 'field-is-not', field: 'launchSnapshot', expected: 'an-object' };
  return firstMistypedFieldOf(snapshot, {
    refs:              [valueIsATextRecord, 'a-record-of-commits'],
    hooksFolderDigest: [StoredValueUtil.valueIsTextOrNull, 'text-or-null'],
  }, 'launchSnapshot.');
}

const EXPECTATION_WORDS: Readonly<Record<JobFileFieldExpectation, string>> = {
  'text':                     'text',
  'text-or-null':             'text or null',
  'true':                     'true',
  'an-object':                'an object',
  'a-list':                   'a list',
  'a-list-of-text':           'a list of text',
  'a-list-of-paths':          'a list of paths',
  'a-list-of-entity-keys':    'a list of entity keys',
  'an-entity-key':            'an entity key',
  'a-commit':                 'a commit',
  'a-round':                  'a round',
  'a-line-count-or-null':     'a line count or null',
  'a-record-of-commits':      'a record of commits',
  'a-record-of-phase-hashes': 'a record of phase hashes',
  'true-or-false':            'true or false',
  'a-path':                   'a path',
  'a-path-or-null':           'a path or null',
  'an-exit-code-or-null':     'an exit code or null',
  'a-count':                  'a count',
  'a-child-instance':         'a child instance',
  'a-red-handoff-kind':       'a red handoff kind',
  'a-gate-phase':             'a gate phase',
  'a-step-outcome':           'a step outcome',
  'a-cache-report':           'a cache report',
  'a-step-kind':              'a step kind',
  'a-step-ending':            'a step ending',
  'a-run-time':               'a run time',
};

function fieldProblemSentenceOf(problem: JobFileFieldProblem): string {
  return `its "${problem.field}" is not ${EXPECTATION_WORDS[problem.expected]}`;
}

export const JobFileShapeUtil = {
  valueIsText,
  valueIsATextList,
  valueIsATextRecord,
  valueIsTextOrNull: StoredValueUtil.valueIsTextOrNull,
  valueIsANumberOrNull,
  oneOf,
  optional,
  firstMistypedFieldOf,
  launchSnapshotMistypedFieldOf,
  fieldProblemSentenceOf,
} as const;
